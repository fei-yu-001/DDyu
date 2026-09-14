#!/usr/bin/env python3
"""调整媒体容量策略（只能经运行设置，config.yaml 里的同名字段是 yaml:"-" 改不动）。

背景（见 docs/开发文档.md「六、必须在后续注意的坑」第 2 条）：
  media.local.maxTotalBytes / cleanupThresholdPercent 不在配置文件里，默认
  maxTotalBytes = 1 GiB、cleanupThresholdPercent = 80 → 总字节超过 800 MiB 时
  清理任务就会按「最旧优先」回收**持久作品**。要在公网长期运行必须调高。

做法：GET 现有运行设置 → 只改 media 两项 → 原样 PUT 回去（保持 revision 乐观锁）。
      不会触碰 providerWeb 等其它字段（服务端对 statsig 字段是无条件覆盖，因此
      绝不能只提交 media 而省略其它字段）。

用法：
    python scripts/set_media_capacity.py                       # 默认 20 GiB / 90%
    python scripts/set_media_capacity.py --max-total-gib 50 --threshold-percent 90
    python scripts/set_media_capacity.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("DDYU_BASE_URL", "http://127.0.0.1:8000")
CONFIG = Path(__file__).resolve().parent.parent / "config.yaml"


def api(method: str, path: str, token: str = "", body: dict | None = None,
        timeout: int = 60) -> tuple[int, str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
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
    payload = json.loads(raw)
    token = payload["data"]["tokens"]["accessToken"]
    return token


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-total-gib", type=float, default=20.0, help="媒体总容量上限（GiB）")
    parser.add_argument("--threshold-percent", type=int, default=90, help="回收阈值百分比")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if not 1 <= args.threshold_percent <= 100:
        raise SystemExit("threshold-percent 必须在 1..100 之间")
    target_total = int(args.max_total_gib * 1024 * 1024 * 1024)

    token = admin_login()
    print(f"[*] 已登录 {BASE}")
    code, raw = api("GET", "/api/admin/v1/settings", token)
    if code != 200:
        raise SystemExit(f"读取运行设置失败 {code}: {raw[:300]}")
    current_raw = raw
    payload = json.loads(current_raw)
    data = payload.get("data") or payload
    revision = data.get("revision")
    config = data.get("config") or {}
    media = config.get("media") or {}
    print(f"[*] 当前：revision={revision} maxTotalBytes={media.get('maxTotalBytes')} "
          f"cleanupThresholdPercent={media.get('cleanupThresholdPercent')}")

    media["maxTotalBytes"] = target_total
    media["cleanupThresholdPercent"] = args.threshold_percent
    config["media"] = media
    body = {"revision": str(revision), "config": config}
    keep = int(target_total * args.threshold_percent / 100)
    print(f"[*] 目标：maxTotalBytes={target_total}（{args.max_total_gib:g} GiB）"
          f" cleanupThresholdPercent={args.threshold_percent} → 回收水位 {keep / 1024 / 1024 / 1024:.1f} GiB")
    if args.dry_run:
        print("[*] dry-run，未提交")
        return 0

    code, raw = api("PUT", "/api/admin/v1/settings", token, body)
    if code != 200:
        raise SystemExit(f"提交运行设置失败 {code}: {raw[:400]}")
    print(f"[+] 已提交 -> {code}")

    code, raw = api("GET", "/api/admin/v1/settings", token)
    if code == 200:
        data = (json.loads(raw).get("data") or {})
        media = ((data.get("config") or {}).get("media") or {})
        print(f"[=] 复核：maxTotalBytes={media.get('maxTotalBytes')} "
              f"cleanupThresholdPercent={media.get('cleanupThresholdPercent')} revision={data.get('revision')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
