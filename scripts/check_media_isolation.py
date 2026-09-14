#!/usr/bin/env python3
"""P3 验证脚本：作品按客户端密钥归属 + 读取鉴权（「各看各的」）。

验证项（对应 docs/开发文档.md 文末「改动时间线」→ 2026-09-11 · P0 / P2 / P3 / P4（部分） 的 P3）：
  1. 无凭证读取作品 → 401
  2. 管理员 Bearer 读取任意作品 → 200（含无归属的历史作品）
  3. 归属密钥读取自己的作品 → 200
  4. 其他客户端密钥读取他人作品 → 404（不泄漏作品是否存在）
  5. 客户端作品列表只返回自己名下的作品
  6. 无归属历史作品对普通客户端密钥不可见

用法：
    python scripts/check_media_isolation.py

令牌：管理员账号默认读 config.yaml 的 bootstrapAdmin（可用 DDYU_ADMIN_USER / DDYU_ADMIN_PASS 覆盖）。
安全性：只调用接口并读取必要字段，不打印密钥明文与密文字段。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("DDYU_BASE_URL", "http://127.0.0.1:8000")
ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.yaml"
PROBE_KEY_NAME = "p3-isolation-probe"
OWNER_KEY_NAME = "default"

PASS = "PASS"
FAIL = "FAIL"
results: list[tuple[str, bool, str]] = []


def api(method: str, path: str, token: str = "", body: dict | None = None,
        extra_headers: dict[str, str] | None = None, timeout: int = 600,
        client_key: str = "") -> tuple[int, str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    elif client_key:
        headers["X-API-Key"] = client_key
    if extra_headers:
        headers.update(extra_headers)
    if data:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


def unwrap(raw: str) -> object:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict) and "data" in parsed:
        return parsed["data"]
    return parsed


def as_items(value: object) -> list[dict]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("items", "list", "records"):
            inner = value.get(key)
            if isinstance(inner, list):
                return [item for item in inner if isinstance(item, dict)]
    return []


def config_value(section: str, key: str, default: str = "") -> str:
    try:
        text = CONFIG.read_text(encoding="utf-8")
    except OSError:
        return default
    match = re.search(rf"^{re.escape(section)}:\s*$\n((?:[ \t]+.*\n?)*)", text, re.M)
    if not match:
        return default
    for line in match.group(1).splitlines():
        found, _, value = line.strip().partition(":")
        if found == key:
            return value.strip().strip('"').strip("'")
    return default


def admin_login() -> str:
    user = os.environ.get("DDYU_ADMIN_USER", "") or config_value("bootstrapAdmin", "username")
    password = os.environ.get("DDYU_ADMIN_PASS", "") or config_value("bootstrapAdmin", "password")
    if not user or not password:
        raise SystemExit("缺少管理员账号：用 DDYU_ADMIN_USER / DDYU_ADMIN_PASS 指定")
    code, raw = api("POST", "/api/admin/v1/auth/login", body={"username": user, "password": password}, timeout=20)
    if code != 200:
        raise SystemExit(f"管理员登录失败 {code}: {raw[:300]}")
    data = unwrap(raw) or {}
    tokens = data.get("tokens") if isinstance(data, dict) else None
    token = tokens.get("accessToken", "") if isinstance(tokens, dict) else ""
    if not token:
        raise SystemExit(f"登录响应缺少 accessToken: {raw[:200]}")
    return token


def client_key_secret(admin_token: str, name: str) -> tuple[int, str]:
    code, raw = api("GET", "/api/admin/v1/client-keys", admin_token)
    if code != 200:
        raise SystemExit(f"列客户端密钥失败 {code}: {raw[:300]}")
    chosen = next((item for item in as_items(unwrap(raw)) if item.get("name") == name), None)
    if chosen is None:
        code, raw = api("POST", "/api/admin/v1/client-keys", admin_token,
                        {"name": name, "enabled": True, "allowModelAliases": True})
        if code not in (200, 201):
            raise SystemExit(f"创建客户端密钥失败 {code}: {raw[:300]}")
        # 创建接口不保证回显主键，统一回列表按名字取一次 ID（主键是字符串）。
        code, raw = api("GET", "/api/admin/v1/client-keys", admin_token)
        if code != 200:
            raise SystemExit(f"列客户端密钥失败 {code}: {raw[:300]}")
        chosen = next((item for item in as_items(unwrap(raw)) if item.get("name") == name), None)
    key_id = chosen.get("id") if chosen else ""
    if not key_id:
        raise SystemExit(f"未能解析客户端密钥 {name} 的 ID")
    code, raw = api("GET", f"/api/admin/v1/client-keys/{key_id}/secret", admin_token)
    if code != 200:
        raise SystemExit(f"获取密钥明文失败 {code}: {raw[:300]}")
    data = unwrap(raw)
    secret = data if isinstance(data, str) else ""
    if not secret and isinstance(data, dict):
        secret = data.get("secret") or data.get("key") or ""
    if not secret:
        raise SystemExit(f"密钥明文解析失败: {raw[:200]}")
    return int(key_id), secret


def sqlite_path() -> Path:
    value = config_value("sqlite", "path", "./data/backend.db")
    path = Path(value)
    return path if path.is_absolute() else (CONFIG.parent / value).resolve()


def unowned_asset_id() -> str:
    """取一条无归属（client_key_id = 0）的历史作品 ID，用于验证历史数据仍然只对管理员可见。"""
    path = sqlite_path()
    if not path.exists():
        return ""
    try:
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            row = conn.execute(
                "SELECT id FROM media_assets WHERE client_key_id = 0 AND expires_at IS NULL LIMIT 1"
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return ""
    return row[0] if row else ""


def record(name: str, ok: bool, detail: str) -> None:
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} —— {detail}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default="grok-imagine-image")
    parser.add_argument("--prompt", default="a paper boat on a calm lake, soft morning light")
    args = parser.parse_args(argv)

    admin_token = admin_login()
    print(f"[*] 已登录 {BASE}")
    owner_id, owner_key = client_key_secret(admin_token, OWNER_KEY_NAME)
    probe_id, probe_key = client_key_secret(admin_token, PROBE_KEY_NAME)
    print(f"[*] 归属密钥 id={owner_id}（{OWNER_KEY_NAME}）；对照密钥 id={probe_id}（{PROBE_KEY_NAME}）")

    print("[*] 用归属密钥生成一张作品，确认归属被写入")
    code, raw = api("POST", "/v1/images/generations", client_key=owner_key, body={
        "model": args.model, "prompt": args.prompt, "n": 1,
        "aspect_ratio": "1:1", "resolution": "1k", "quality": "low",
        "response_format": "url",
    })
    if code != 200:
        raise SystemExit(f"生图失败 {code}: {raw[:400]}")
    document = json.loads(raw)
    url = str((document.get("data") or [{}])[0].get("url") or "")
    match = re.search(r"/v1/media/images/([A-Za-z0-9_-]+)", url)
    if not match:
        raise SystemExit(f"响应中没有可解析的作品 URL: {raw[:300]}")
    asset_id = match.group(1)
    asset_path = f"/v1/media/images/{asset_id}"
    print(f"[*] 新作品 id={asset_id}")

    owner_ref = {"X-API-Key": owner_key}
    probe_ref = {"X-API-Key": probe_key}

    print("[*] 逐项校验读取鉴权与归属隔离")
    status, _ = api("GET", asset_path)
    record("无凭证读取作品被拒", status == 401, f"status={status}")

    status, _ = api("GET", asset_path, token=admin_token)
    record("管理员可读任意作品", status == 200, f"status={status}")

    status, _ = api("GET", asset_path, extra_headers=owner_ref, client_key=owner_key)
    record("归属密钥可读自己的作品", status == 200, f"status={status}")

    status, _ = api("GET", asset_path, extra_headers=probe_ref, client_key=probe_key)
    record("其他密钥读他人作品按 404 拒绝", status == 404, f"status={status}")

    status, raw = api("GET", "/v1/media/images", client_key=owner_key, extra_headers=owner_ref)
    body = raw
    record("归属密钥的作品列表包含该作品", status == 200 and asset_id in body,
           f"status={status} contains={asset_id in body}")

    status, raw = api("GET", "/v1/media/images", client_key=probe_key, extra_headers=probe_ref)
    body = raw
    record("对照密钥的作品列表不含该作品", status == 200 and asset_id not in body,
           f"status={status} contains={asset_id in body}")

    legacy = unowned_asset_id()
    if legacy:
        status, _ = api("GET", f"/v1/media/images/{legacy}", extra_headers=owner_ref, client_key=owner_key)
        record("无归属历史作品对普通密钥不可见", status == 404, f"asset={legacy} status={status}")
        status, _ = api("GET", f"/v1/media/images/{legacy}", token=admin_token)
        record("无归属历史作品仍对管理员可见", status == 200, f"asset={legacy} status={status}")
    else:
        record("无归属历史作品检查", True, "库中没有 client_key_id=0 的持久作品，跳过")

    failed = [name for name, ok, _ in results if not ok]
    print()
    print(f"[=] 结论：{PASS if not failed else FAIL}（{len(results) - len(failed)}/{len(results)} 项通过）")
    if failed:
        print(f"    未通过：{', '.join(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
