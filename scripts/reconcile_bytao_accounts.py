# -*- coding: utf-8 -*-
"""对账（只读）：grok_bytao 账本 vs DDyu 号池 grok_web 账号。

用法：
    python reconcile_bytao_accounts.py            # 打印重合/新增清单
    python reconcile_bytao_accounts.py --json     # 输出 JSON（供导入脚本消费）

不做任何写操作。
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
ADMIN_USER = "DDyu"
ADMIN_PASS = "DDyu-996"
CLI = Path(r"D:\work\amaze\grok_bytao\accounts_cli.txt")


def call(path: str, method: str = "GET", token: str | None = None, data: bytes | None = None,
         timeout: int = 30) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def login() -> str:
    body = json.dumps({"username": ADMIN_USER, "password": ADMIN_PASS}).encode()
    return call("/api/admin/v1/auth/login", "POST", None, body)["data"]["tokens"]["accessToken"]


def unwrap(payload: dict) -> dict:
    return payload.get("data", payload) if isinstance(payload, dict) else {}


def list_web_accounts(token: str) -> list[dict]:
    """按 provider=grok_web 分页拉全量（服务端对 page_size 有上限，须按 total 翻页）。"""
    items: list[dict] = []
    page, total = 1, None
    while True:
        data = unwrap(call(f"/api/admin/v1/accounts?provider=grok_web&page={page}&page_size=50", token=token))
        batch = data.get("items") or data.get("list") or []
        if total is None:
            total = data.get("total")
            if total is None:
                total = len(batch)  # 非分页结构
            else:
                total = int(total)
        items.extend(batch)
        if not batch or len(items) >= total:
            break
        page += 1
        if page > 200:  # 防御
            break
    return items


def parse_cli(path: Path) -> list[tuple[int, str, str]]:
    """返回 [(行号1based, email, sso)]。"""
    rows: list[tuple[int, str, str]] = []
    for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        parts = line.split("----")
        if len(parts) < 3:
            print(f"[跳过] 第 {idx} 行格式不符", file=sys.stderr)
            continue
        rows.append((idx, parts[0].strip(), parts[2].strip()))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    token = login()
    pool = list_web_accounts(token)

    pool_emails: set[str] = set()
    for acc in pool:
        for key in ("email", "accountEmail", "name", "accountName"):
            value = str(acc.get(key) or "").strip()
            if "@" in value:
                pool_emails.add(value.lower())
    if pool and args.json is False:
        print("[debug] 列表字段样例:", sorted(pool[0].keys()))

    rows = parse_cli(CLI)
    in_pool, new_rows = [], []
    for idx, email, sso in rows:
        (in_pool if email.lower() in pool_emails else new_rows).append((idx, email, sso))

    duplicate_sso = len(rows) - len({sso for _, _, sso in rows})
    if args.json:
        print(json.dumps({
            "cli_lines": len(rows),
            "cli_duplicate_sso": duplicate_sso,
            "pool_web_total": len(pool),
            "in_pool": [{"line": i, "email": e} for i, e, _ in in_pool],
            "new": [{"line": i, "email": e, "sso": s} for i, e, s in new_rows],
        }, ensure_ascii=False, indent=2))
        return 0

    print(f"账本行数           : {len(rows)}（SSO 重复 {duplicate_sso}）")
    print(f"号池 grok_web 总数 : {len(pool)}")
    print(f"已对上号池         : {len(in_pool)}")
    print(f"尚未进号池         : {len(new_rows)}")
    if new_rows:
        print("\n-- 尚未进号池（行号 | 邮箱）--")
        for idx, email, _ in new_rows:
            print(f"{idx:>4}  {email}")
    if in_pool:
        first, last = in_pool[0], in_pool[-1]
        print(f"\n已导入的账本行号范围: {first[0]} ~ {last[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
