# -*- coding: utf-8 -*-
"""把 grok_bytao 账本（accounts_cli.txt）新增行导入 DDyu 号池（grok_web）。

对账逻辑内建：默认只导入「账本里有、号池里没有」的行，因此可重复执行（幂等）。

用法：
  python import_bytao_to_ddyu.py --dry-run                 # 只看会导哪些
  python import_bytao_to_ddyu.py --limit 3                 # 先导 3 个试水
  python import_bytao_to_ddyu.py --limit 40                # 继续导 40 个
  python import_bytao_to_ddyu.py --limit 0                 # 导入全部缺失（慎用）
  python import_bytao_to_ddyu.py --show-nodes              # 只看 grok_web 出口节点
  python import_bytao_to_ddyu.py --assign-only --limit 0    # 只补出口分配（不导入）

导入完成后默认会尝试把新账号按 mode=auto 分配到 grok_web 出口节点。
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
ADMIN_USER = "DDyu"
ADMIN_PASS = "DDyu-996"
CLI = Path(r"D:\work\amaze\grok_bytao\accounts_cli.txt")


def call(path: str, method: str = "GET", token: str | None = None, data: bytes | None = None,
         timeout: int = 60, headers: dict | None = None) -> dict:
    req_headers = {"Content-Type": "application/json"}
    if token:
        req_headers["Authorization"] = f"Bearer {token}"
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def login() -> str:
    body = json.dumps({"username": ADMIN_USER, "password": ADMIN_PASS}).encode()
    return call("/api/admin/v1/auth/login", "POST", None, body)["data"]["tokens"]["accessToken"]


def unwrap(payload: dict) -> dict:
    return payload.get("data", payload) if isinstance(payload, dict) else {}


def parse_cli(path: Path) -> list[tuple[int, str, str]]:
    rows: list[tuple[int, str, str]] = []
    for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        parts = line.split("----")
        if len(parts) < 3:
            continue
        rows.append((idx, parts[0].strip(), parts[2].strip()))
    return rows


def pool_emails(token: str) -> tuple[set[str], int]:
    """分页拉全 grok_web 账号，返回（邮箱集合，总数）。"""
    emails: set[str] = set()
    page, total = 1, None
    while True:
        data = unwrap(call(f"/api/admin/v1/accounts?provider=grok_web&page={page}&page_size=50", token=token))
        batch = data.get("items") or data.get("list") or []
        if total is None:
            total = int(data["total"]) if data.get("total") is not None else len(batch)
        for acc in batch:
            for key in ("email", "accountEmail", "name", "accountName"):
                value = str(acc.get(key) or "").strip()
                if "@" in value:
                    emails.add(value.lower())
        items = batch
        if not items or len(emails) >= max(total, len(emails)) or page > 200:
            break
        page += 1
    return emails, total


def list_web_accounts(token: str) -> list[dict]:
    items: list[dict] = []
    page, total = 1, None
    while True:
        data = unwrap(call(f"/api/admin/v1/accounts?provider=grok_web&page={page}&page_size=50", token=token))
        batch = data.get("items") or data.get("list") or []
        if total is None:
            total = int(data["total"]) if data.get("total") is not None else len(batch)
        items.extend(batch)
        if not batch or len(items) >= total or page > 200:
            break
        page += 1
    return items


def show_nodes(token: str) -> list[dict]:
    data = unwrap(call("/api/admin/v1/egress-nodes", token=token))
    nodes = data.get("items") or data.get("list") or data.get("nodes") or []
    web_nodes = []
    for node in nodes:
        scope = str(node.get("scope") or node.get("provider") or "")
        if "web" not in scope.lower():
            continue
        web_nodes.append(node)
        print(f"  node={node.get('id')} name={node.get('name')!r} scope={scope} "
              f"enabled={node.get('enabled')} accounts={node.get('accountCount', '?')}")
    return web_nodes


def import_batch(token: str, rows: list[tuple[int, str, str]], timeout: int = 1800) -> dict:
    accounts = [{"email": email, "name": email, "sso_token": sso} for _, email, sso in rows]
    payload = json.dumps({"provider": "grok_web", "accounts": accounts}, ensure_ascii=False).encode("utf-8")
    boundary = "----ddyuBytaoImport7a1c"
    buf = io.BytesIO()
    buf.write(f"--{boundary}\r\n".encode())
    buf.write(b'Content-Disposition: form-data; name="files"; filename="sso_batch.json"\r\n')
    buf.write(b"Content-Type: application/json\r\n\r\n")
    buf.write(payload)
    buf.write(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"{BASE}/api/admin/v1/accounts/web/import",
        data=buf.getvalue(),
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        method="POST",
    )
    result: dict = {}
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        event = ""
        for raw in resp:
            line = raw.decode("utf-8", "replace").rstrip("\r\n")
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                body = line[5:].strip()
                try:
                    parsed = json.loads(body) if body else {}
                except json.JSONDecodeError:
                    parsed = {"raw": body}
                if event == "complete":
                    result = parsed
                elif event == "error":
                    raise RuntimeError(f"导入失败: {parsed}")
                elif event == "progress":
                    done, total = parsed.get("completed"), parsed.get("total")
                    phase = parsed.get("phase") or ""
                    if total and (done == total or (isinstance(done, int) and done % 10 == 0)):
                        print(f"    [{phase}] {done}/{total} ({time.time() - t0:.0f}s)", flush=True)
    return result


def assign_egress(token: str, node_id: int, account_ids: list[int]) -> dict:
    payload = json.dumps({
        "provider": "grok_web",
        "ids": [str(i) for i in account_ids],
        "mode": "auto",
    }).encode()
    return unwrap(call(f"/api/admin/v1/egress-nodes/{node_id}/accounts", "POST", token, payload))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=3, help="本次最多导入 N 个缺失账号；0=全部缺失")
    parser.add_argument("--batch", type=int, default=40, help="单次请求导入条数")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--show-nodes", action="store_true")
    parser.add_argument("--dump-nodes", action="store_true", help="打印 grok_web 节点完整 JSON 后退出")
    parser.add_argument("--assign-only", action="store_true", help="跳过导入，只给池内无出口的账号补分配")
    parser.add_argument("--report", action="store_true", help="只打印不健康账号（authStatus != active）")
    parser.add_argument("--egress-node", type=int, default=0, help="出口节点 id；0=自动选择 grok_web 已启用节点")
    parser.add_argument("--no-assign", action="store_true")
    args = parser.parse_args()

    token = login()
    print("[*] 管理员登录成功")

    if args.report:
        pool = list_web_accounts(token)
        bad = [a for a in pool if str(a.get("authStatus") or "") != "active"]
        print(f"[*] grok_web 总数 {len(pool)}，不健康 {len(bad)}")
        for acc in bad:
            print(f"  id={acc.get('id')} email={acc.get('email')!r} status={acc.get('authStatus')} "
                  f"failureCount={acc.get('failureCount')} refreshFailureCount={acc.get('refreshFailureCount')} "
                  f"egress={acc.get('egressNodeId')} tier={acc.get('webTier')} "
                  f"cf={acc.get('cloudflareCookieConfigured')}")
        return 0

    if args.show_nodes:
        show_nodes(token)
        return 0

    if args.dump_nodes:
        data = unwrap(call("/api/admin/v1/egress-nodes", token=token))
        nodes = data.get("items") or data.get("list") or data.get("nodes") or []
        web = [n for n in nodes if "web" in str(n.get("scope") or n.get("provider") or "").lower()]
        print(json.dumps(web, ensure_ascii=False, indent=1))
        return 0

    emails, pool_total = pool_emails(token)
    print(f"[*] 号池 grok_web 总数: {pool_total}")

    rows = parse_cli(CLI)
    fresh = [(i, e, s) for i, e, s in rows if e.lower() not in emails]
    print(f"[*] 账本 {len(rows)} 行，其中尚未进号池 {len(fresh)} 行")

    if args.assign_only:
        args.limit = 0

    if args.limit and args.limit > 0:
        fresh = fresh[: args.limit]

    if not args.dry_run and fresh:
        total = len(fresh)
        done = 0
        for offset in range(0, total, args.batch):
            chunk = fresh[offset: offset + args.batch]
            first, last = chunk[0][0], chunk[-1][0]
            print(f"[*] 导入第 {first}~{last} 行（{len(chunk)} 个）...", flush=True)
            result = import_batch(token, chunk)
            print(f"    created={result.get('created')} updated={result.get('updated')} "
                  f"skipped={result.get('skipped')} failed={result.get('failed')} "
                  f"synced={result.get('synced')} syncFailed={result.get('syncFailed')}", flush=True)
            done += len(chunk)

    pool = list_web_accounts(token)
    print(f"[*] 导入后号池 grok_web 总数: {len(pool)}")

    if args.no_assign or args.dry_run:
        return 0

    nodes = [n for n in (unwrap(call("/api/admin/v1/egress-nodes", token=token))
                         .get("items") or []) if "web" in str(n.get("scope") or n.get("provider") or "").lower()
             and n.get("enabled")]
    if not nodes:
        print("[!] 没有已启用的 grok_web 出口节点，跳过出口分配")
        return 0
    node = nodes[0]
    if args.egress_node:
        node = next((n for n in nodes if int(n.get("id")) == args.egress_node), node)
    print(f"[*] 出口节点: id={node.get('id')} name={node.get('name')!r}")

    targets = []
    for acc in pool:
        if acc.get("egressNodeId") in (None, 0, ""):
            targets.append(int(acc["id"]))
    if not targets:
        print("[*] 所有 Web 账号都已有出口分配")
        return 0
    print(f"[*] 待分配出口的账号 {len(targets)} 个")
    for offset in range(0, len(targets), 100):
        chunk = targets[offset: offset + 100]
        assign_egress(token, int(node["id"]), chunk)
        print(f"    已分配 {min(offset + 100, len(targets))}/{len(targets)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
