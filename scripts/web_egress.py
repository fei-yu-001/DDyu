#!/usr/bin/env python3
"""为 grok_web 配置 Resin 粘性出口节点（P1 生图前置③）。

背景：生图/图编/视频的主体请求走 scope=grok_web，生成结果的资源下载走
scope=grok_web_asset；后者可复用前者的节点（domain/egress/egress.go 的
SupportsScope）。因此本部署只需为 grok_web 建节点即可覆盖生图全链路。

Resin 是**账号级粘性**（sticky_ttl=7 天）：proxyURL 里的 {account} 占位符会被
grok2api 替换成账号的 EgressIdentity（Web 账号为 sso_<sha256(token)[:32]>），
Resin 据此为每个账号分配并长期保持一个稳定出口 IP。所以「1 个节点」不等于
「1 个出口 IP」，节点数不必等于账号数。

用法：
    # 只读盘点
    python scripts/web_egress.py list

    # 建/更新节点（dry-run 先看要做啥）
    python scripts/web_egress.py create --dry-run
    python scripts/web_egress.py create

    # 把全部启用的 Web 账号挂到该节点（mode=auto，必须显式）
    python scripts/web_egress.py assign --dry-run
    python scripts/web_egress.py assign

    # 连通性测试（真实经 Resin 出口）
    python scripts/web_egress.py test

    # 一步到位
    python scripts/web_egress.py all

令牌来源（按优先级）：
    --resin-token 参数  >  环境变量 RESIN_PROXY_TOKEN
Resin 的代理认证令牌不在代码里硬编码，避免随仓库泄露。

安全性：本脚本只调用管理接口，不直接写数据库；所有写操作都可用 --dry-run 预演。
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

NODE_NAME = "resin-web"
NODE_SCOPE = "grok_web"
RESIN_HOST = os.environ.get("RESIN_HOST", "127.0.0.1")
RESIN_PORT = os.environ.get("RESIN_PORT", "2260")
RESIN_PLATFORM = os.environ.get("RESIN_PLATFORM", "Default")


def load_admin(config_path: Path) -> tuple[str, str]:
    """从 config.yaml 的 bootstrapAdmin 段读取管理员账号，避免把口令写进脚本。"""
    user = os.environ.get("DDYU_ADMIN_USER", "")
    password = os.environ.get("DDYU_ADMIN_PASS", "")
    if user and password:
        return user, password
    try:
        text = config_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SystemExit(f"无法读取 {config_path}: {exc}") from exc
    match = re.search(r"^bootstrapAdmin:\s*$\n((?:[ \t]+.*\n?)*)", text, re.M)
    block = match.group(1) if match else ""
    for line in block.splitlines():
        key, _, value = line.strip().partition(":")
        value = value.strip().strip('"').strip("'")
        if key == "username" and not user:
            user = value
        elif key == "password" and not password:
            password = value
    if not user or not password:
        raise SystemExit("未能从 config.yaml 解析管理员账号；可用 DDYU_ADMIN_USER/DDYU_ADMIN_PASS 覆盖")
    return user, password


def api(method: str, path: str, token: str = "", body: dict | None = None,
        timeout: int = 60) -> tuple[int, str]:
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
    """管理接口外层有的返回 {data:...}，有的直接给数组/对象。"""
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


def login(user: str = "", password: str = "") -> str:
    if not user or not password:
        user, password = load_admin(CONFIG)
    code, raw = api("POST", "/api/admin/v1/auth/login", body={"username": user, "password": password}, timeout=20)
    if code != 200:
        hint = ""
        if code == 401:
            hint = ("（提示：bootstrapAdmin 只在库中尚无管理员时生效；迁移来的库须用既有管理员，"
                    "可用 DDYU_ADMIN_USER / DDYU_ADMIN_PASS 覆盖）")
        raise SystemExit(f"管理员登录失败 {code}: {raw[:300]}{hint}")
    data = unwrap(raw) or {}
    tokens = data.get("tokens") if isinstance(data, dict) else None
    token = ""
    if isinstance(tokens, dict):
        token = tokens.get("accessToken", "")
    if not token:
        raise SystemExit(f"登录响应中没有 accessToken: {raw[:300]}")
    return token


def list_nodes(token: str) -> list[dict]:
    code, raw = api("GET", "/api/admin/v1/egress-nodes", token)
    if code != 200:
        raise SystemExit(f"列出口节点失败 {code}: {raw[:300]}")
    return as_items(unwrap(raw))


def node_id_of(node: dict) -> str:
    for key in ("id", "ID"):
        if key in node:
            return str(node[key])
    return ""


def resin_proxy_url(resin_token: str) -> str:
    return (f"socks5h://{RESIN_PLATFORM}.{{account}}:{resin_token}"
            f"@{RESIN_HOST}:{RESIN_PORT}")


def web_account_ids(token: str) -> list[int]:
    """拉取全部启用中的 Web 账号 ID。

    注意：管理接口对 page_size 有服务端上限（实测给 200 只返回 20），所以必须按
    响应的 total 累计翻页，不能按「返回条数 < 请求条数」判断结束。
    """
    ids: list[int] = []
    page = 1
    page_size = 200
    fetched = 0
    while page <= 100:
        code, raw = api(
            "GET",
            f"/api/admin/v1/accounts?provider=grok_web&page={page}&page_size={page_size}",
            token,
        )
        if code != 200:
            raise SystemExit(f"拉取 Web 账号失败 {code}: {raw[:300]}")
        data = unwrap(raw)
        items = as_items(data)
        if not items:
            break
        fetched += len(items)
        for item in items:
            if item.get("enabled") is False:
                continue
            if str(item.get("authStatus") or item.get("auth_status") or "").lower() in {
                "reautherequired", "reauth_required", "disabled",
            }:
                continue
            raw_id = item.get("id") or item.get("ID")
            try:
                ids.append(int(raw_id))
            except (TypeError, ValueError):
                continue
        total = data.get("total") if isinstance(data, dict) else None
        if isinstance(total, int):
            if fetched >= total:
                break
        elif len(items) < page_size:
            break
        page += 1
    return sorted(set(ids))


def cmd_list(token: str, _args: argparse.Namespace) -> int:
    print(f"== 出口节点（{BASE}）==")
    for node in list_nodes(token):
        mark = "启用" if node.get("enabled") else "停用"
        print(f"  id={node_id_of(node):<6} scope={node.get('scope',''):<12} {mark} "
              f"name={node.get('name','')} exit_ip={node.get('exitIp') or node.get('exit_ip') or '-'}")
    print()
    print(f"== Web 账号（provider=grok_web，启用中）==")
    ids = web_account_ids(token)
    print(f"  合计 {len(ids)} 个：{ids}")
    return 0


def ensure_node(token: str, resin_token: str, dry_run: bool) -> str:
    url = resin_proxy_url(resin_token)
    existing = {node.get("name"): node for node in list_nodes(token)}
    payload = {"name": NODE_NAME, "scope": NODE_SCOPE, "enabled": True, "proxyURL": url}
    node = existing.get(NODE_NAME)
    if dry_run:
        action = "更新" if node else "创建"
        print(f"  [dry-run] 将{action}节点 {NODE_NAME} scope={NODE_SCOPE} "
              f"proxyURL=socks5h://{RESIN_PLATFORM}.{{account}}:***@{RESIN_HOST}:{RESIN_PORT}")
        return node_id_of(node) if node else ""
    if node:
        nid = node_id_of(node)
        code, raw = api("PUT", f"/api/admin/v1/egress-nodes/{nid}", token, payload)
        print(f"  [更新] {NODE_NAME} id={nid} -> {code}")
    else:
        code, raw = api("POST", "/api/admin/v1/egress-nodes", token, payload)
        print(f"  [创建] {NODE_NAME} -> {code}")
    if code not in (200, 201):
        raise SystemExit(f"写入节点失败: {raw[:400]}")
    data = unwrap(raw) or {}
    nid = node_id_of(data) if isinstance(data, dict) else ""
    return nid or node_id_of(node)


def cmd_create(token: str, args: argparse.Namespace) -> int:
    if not args.resin_token:
        raise SystemExit("缺少 Resin 代理令牌：传 --resin-token 或设置 RESIN_PROXY_TOKEN")
    print("== 配置 Web 出口节点 ==")
    nid = ensure_node(token, args.resin_token, args.dry_run)
    if nid:
        print(f"  节点 id={nid}")
    return 0


def cmd_assign(token: str, args: argparse.Namespace) -> int:
    if not args.resin_token and not args.dry_run:
        raise SystemExit("缺少 Resin 代理令牌：传 --resin-token 或设置 RESIN_PROXY_TOKEN")
    print("== 把 Web 账号挂到 Web 出口节点 ==")
    node = next((n for n in list_nodes(token) if n.get("name") == NODE_NAME), None)
    if not node and not args.dry_run:
        raise SystemExit(f"节点 {NODE_NAME} 不存在，请先执行 create")
    nid = node_id_of(node) if node else "<dry-run>"
    ids = web_account_ids(token)
    if not ids:
        raise SystemExit("没有可分配的 Web 账号")
    print(f"  节点 id={nid}，待分配账号 {len(ids)} 个")
    # ids 必须是字符串数组：handler 的 accountAssignmentRequest.IDs 类型为 []string，
    # 传整型数组会被 ShouldBindJSON 判为参数无效（400）。
    payload = {"provider": NODE_SCOPE, "ids": [str(value) for value in ids], "mode": "auto"}
    if args.dry_run:
        print(f"  [dry-run] POST /api/admin/v1/egress-nodes/{nid}/accounts {payload}")
        return 0
    code, raw = api("POST", f"/api/admin/v1/egress-nodes/{nid}/accounts", token, payload, timeout=180)
    print(f"  分配 -> {code}: {raw[:400]}")
    return 0 if code in (200, 201) else 1


def cmd_test(token: str, args: argparse.Namespace) -> int:
    print("== 出口连通性测试 ==")
    node = next((n for n in list_nodes(token) if n.get("name") == NODE_NAME), None)
    if not node:
        raise SystemExit(f"节点 {NODE_NAME} 不存在")
    nid = node_id_of(node)
    code, raw = api("POST", f"/api/admin/v1/egress-nodes/{nid}/test", token, timeout=120)
    print(f"  node {nid} -> {code}: {raw[:500]}")
    refreshed = next((n for n in list_nodes(token) if node_id_of(n) == nid), {})
    print(f"  health={refreshed.get('health')} probe_status={refreshed.get('probeStatus') or refreshed.get('probe_status')} "
          f"exit_ip={refreshed.get('exitIp') or refreshed.get('exit_ip')} "
          f"last_error={refreshed.get('lastError') or refreshed.get('last_error') or '-'}")
    return 0


def cmd_all(token: str, args: argparse.Namespace) -> int:
    for step in (cmd_create, cmd_assign, cmd_test):
        if step(token, args) != 0:
            return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["list", "create", "assign", "test", "all"])
    parser.add_argument("--dry-run", action="store_true", help="只打印将要执行的动作")
    parser.add_argument("--resin-token", default=os.environ.get("RESIN_PROXY_TOKEN", ""),
                        help="Resin 代理认证令牌（默认取 RESIN_PROXY_TOKEN）")
    parser.add_argument("--admin-user", default=os.environ.get("DDYU_ADMIN_USER", ""),
                        help="管理员用户名（默认取 DDYU_ADMIN_USER 或 config.yaml）")
    parser.add_argument("--admin-password", default=os.environ.get("DDYU_ADMIN_PASS", ""),
                        help="管理员口令（默认取 DDYU_ADMIN_PASS 或 config.yaml）")
    args = parser.parse_args(argv)

    token = login(args.admin_user, args.admin_password)
    print(f"[*] 已登录 {BASE}")
    handlers = {"list": cmd_list, "create": cmd_create, "assign": cmd_assign,
                "test": cmd_test, "all": cmd_all}
    return handlers[args.command](token, args)


if __name__ == "__main__":
    sys.exit(main())
