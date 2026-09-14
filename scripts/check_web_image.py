#!/usr/bin/env python3
"""P1 验证脚本：调用真实生图接口，落盘图片并留证。

验证目标（对应计划验收标准）：
  1. 用客户端密钥调 /v1/images/generations 能拿到**真实图片**（非报错、非空壳）
  2. 作品库中能查到该图片记录
  3. 记录本次出图所用**出口地址**与耗时

用法：
    # 先看客户端可见的模型名
    python scripts/check_web_image.py --models

    # 出图（默认 b64_json，直接落盘，便于取字节数/哈希）
    python scripts/check_web_image.py --prompt "a red panda riding a bicycle"

    # 指定模型与参数
    python scripts/check_web_image.py --model grok-imagine-image --aspect-ratio 16:9 --resolution 1k

令牌来源：--client-key / 环境变量 DDYU_CLIENT_KEY；否则自动从管理端取名为 default 的密钥明文。
安全性：不打印密钥明文与密文字段；只读取必要信息。
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

BASE = os.environ.get("DDYU_BASE_URL", "http://127.0.0.1:8000")
ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config.yaml"


def api(method: str, path: str, token: str = "", body: dict | None = None,
        timeout: int = 600) -> tuple[int, str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
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


def load_config_value(section: str, key: str, default: str = "") -> str:
    """极简 YAML 取值：只处理 config.yaml 里两层缩进的标量，够用且不引入依赖。"""
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


def admin_credentials() -> tuple[str, str]:
    user = os.environ.get("DDYU_ADMIN_USER", "") or load_config_value("bootstrapAdmin", "username")
    password = os.environ.get("DDYU_ADMIN_PASS", "") or load_config_value("bootstrapAdmin", "password")
    if not user or not password:
        raise SystemExit("缺少管理员账号：用 DDYU_ADMIN_USER / DDYU_ADMIN_PASS 指定")
    return user, password


def admin_login() -> str:
    user, password = admin_credentials()
    code, raw = api("POST", "/api/admin/v1/auth/login",
                    body={"username": user, "password": password}, timeout=20)
    if code != 200:
        raise SystemExit(f"管理员登录失败 {code}: {raw[:300]}"
                         "（提示：迁移库的管理员是既有账号，不是 config.yaml 的 bootstrapAdmin）")
    data = unwrap(raw) or {}
    tokens = data.get("tokens") if isinstance(data, dict) else None
    token = tokens.get("accessToken", "") if isinstance(tokens, dict) else ""
    if not token:
        raise SystemExit(f"登录响应缺少 accessToken: {raw[:200]}")
    return token


def resolve_client_key(admin_token: str, wanted: str) -> str:
    """取客户端密钥明文：优先参数/环境变量，否则复用名为 default 的管理端密钥。"""
    if wanted:
        return wanted
    code, raw = api("GET", "/api/admin/v1/client-keys", admin_token)
    if code != 200:
        raise SystemExit(f"列客户端密钥失败 {code}: {raw[:300]}")
    items = as_items(unwrap(raw))
    chosen = next((i for i in items if i.get("name") == "default"), None)
    if chosen is None:
        chosen = next((i for i in items if i.get("enabled") is not False
                       and not str(i.get("name", "")).startswith("[system]")), None)
    if chosen is None:
        raise SystemExit("没有可用的客户端密钥；请先在管理端创建，或用 DDYU_CLIENT_KEY 指定")
    key_id = chosen.get("id")
    code, raw = api("GET", f"/api/admin/v1/client-keys/{key_id}/secret", admin_token)
    if code != 200:
        raise SystemExit(f"获取密钥明文失败 {code}: {raw[:300]}")
    data = unwrap(raw)
    secret = data if isinstance(data, str) else ""
    if not secret and isinstance(data, dict):
        secret = data.get("secret") or data.get("key") or ""
    if not secret:
        raise SystemExit(f"密钥明文解析失败: {raw[:200]}")
    print(f"[*] 使用客户端密钥 name={chosen.get('name')} prefix={chosen.get('prefix')}")
    return secret


def list_models(client_key: str) -> int:
    code, raw = api("GET", "/v1/models", client_key, timeout=60)
    print(f"[*] GET /v1/models -> {code}")
    data = unwrap(raw)
    items = as_items(data)
    for item in items:
        print(f"    {item.get('id') or item.get('name')}")
    if not items:
        print(f"    raw: {raw[:600]}")
    return 0 if code == 200 else 1


def media_assets_snapshot() -> tuple[int, str]:
    """只读统计作品表，用于证明「生图确实落库」。"""
    path = load_config_value("sqlite", "path", "./data/backend.db")
    db_path = Path(path)
    if not db_path.is_absolute():
        db_path = (CONFIG.parent / path).resolve()
    if not db_path.exists():
        return -1, f"数据库不存在: {db_path}"
    try:
        conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
        try:
            total = conn.execute("SELECT COUNT(*) FROM media_assets").fetchone()[0]
            # media_assets.id 是字符串主键，按 id 排序拿不到最新，必须按 created_at。
            last = conn.execute(
                "SELECT id, kind, size_bytes, created_at FROM media_assets ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return -1, str(exc)
    return total, repr(last)


def web_egress_summary(admin_token: str) -> list[str]:
    code, raw = api("GET", "/api/admin/v1/egress-nodes", admin_token)
    lines: list[str] = []
    if code != 200:
        return [f"  查询出口节点失败 {code}: {raw[:200]}"]
    for node in as_items(unwrap(raw)):
        if str(node.get("scope")) != "grok_web":
            continue
        lines.append(
            f"  id={node.get('id')} name={node.get('name')} enabled={node.get('enabled')} "
            f"health={node.get('health')} exit_ip={node.get('exitIp') or node.get('exit_ip')}"
        )
    return lines or ["  （无 grok_web 出口节点）"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--models", action="store_true", help="只列出客户端可见模型")
    parser.add_argument("--model", default="grok-imagine-image", help="客户端模型名")
    parser.add_argument("--prompt", default="a red panda riding a bicycle, cinematic lighting",
                        help="提示词")
    parser.add_argument("--aspect-ratio", default="1:1")
    parser.add_argument("--resolution", default="1k")
    parser.add_argument("--quality", default="low", choices=["low", "medium"])
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--response-format", default="b64_json", choices=["b64_json", "url"])
    parser.add_argument("--client-key", default=os.environ.get("DDYU_CLIENT_KEY", ""))
    parser.add_argument("--save-dir", default=str(ROOT / "data" / "media-check"))
    args = parser.parse_args(argv)

    admin_token = admin_login()
    client_key = resolve_client_key(admin_token, args.client_key)
    if args.models:
        return list_models(client_key)

    before_total, before_last = media_assets_snapshot()
    print(f"[*] 生图前作品数={before_total} 最新={before_last}")

    payload = {
        "model": args.model,
        "prompt": args.prompt,
        "n": args.count,
        "aspect_ratio": args.aspect_ratio,
        "resolution": args.resolution,
        "quality": args.quality,
        "response_format": args.response_format,
    }
    print(f"[*] POST /v1/images/generations {json.dumps(payload, ensure_ascii=False)}")
    started = time.time()
    code, raw = api("POST", "/v1/images/generations", client_key, payload, timeout=600)
    elapsed = time.time() - started
    print(f"[*] 返回 {code}，耗时 {elapsed:.1f}s")

    if code != 200:
        print(f"[!] 生图失败：{raw[:800]}")
        print("[*] grok_web 出口节点：")
        for line in web_egress_summary(admin_token):
            print(line)
        return 1

    saved = 0
    try:
        document = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[!] 响应不是 JSON：{raw[:400]}")
        return 1
    items = document.get("data") or []
    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        if item.get("b64_json"):
            raw_bytes = base64.b64decode(item["b64_json"])
        elif item.get("url"):
            url = item["url"]
            if url.startswith("/"):
                url = BASE + url
            fetch_code, body = api("GET", url, client_key, timeout=120)
            if fetch_code != 200:
                print(f"[!] 下载图片失败 {fetch_code}: {body[:200]}")
                continue
            raw_bytes = body.encode("utf-8", "replace")
        else:
            print(f"[!] 第 {index} 项既无 b64_json 也无 url：{json.dumps(item, ensure_ascii=False)[:200]}")
            continue
        target = save_dir / f"gen-{stamp}-{index}.png"
        target.write_bytes(raw_bytes)
        saved += 1
        print(f"[+] 已保存 {target}  bytes={len(raw_bytes)}  "
              f"sha256={hashlib.sha256(raw_bytes).hexdigest()[:16]}  "
              f"mime={item.get('mime_type', '-')}")

    after_total, after_last = media_assets_snapshot()
    print(f"[*] 生图后作品数={after_total} 最新={after_last}")
    print("[*] grok_web 出口节点：")
    for line in web_egress_summary(admin_token):
        print(line)

    ok = saved > 0 and after_total == before_total + 1
    print(f"[=] 结论：{'PASS' if ok else 'CHECK'}（保存 {saved} 张；作品数 {before_total} → {after_total}）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
