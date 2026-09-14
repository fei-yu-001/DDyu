#!/usr/bin/env python3
"""账号库盘点工具（只读）。

用途：快速看清 data/backend.db 里到底有多少账号、分别挂在哪个渠道、
各自具备哪些模型能力、出口节点和客户端密钥的配置情况。

安全性：本脚本只执行 SELECT，不会写入或修改数据库。

用法：
    python scripts/inspect_db.py [数据库路径]
默认数据库路径：data/backend.db（相对仓库根目录）
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "backend.db"


def table_names(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    return [row[0] for row in rows]


def has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (name,)
    ).fetchone()
    return row is not None


def count(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def section(title: str) -> None:
    print()
    print(f"== {title} " + "=" * max(0, 58 - len(title)))


def report_accounts(conn: sqlite3.Connection) -> None:
    section("账号（provider_accounts）")
    if not has_table(conn, "provider_accounts"):
        print("  表不存在，跳过。")
        return

    total = count(conn, "SELECT COUNT(*) FROM provider_accounts")
    print(f"  合计：{total}")

    print("\n  按渠道 / 状态：")
    rows = conn.execute(
        """
        SELECT provider, auth_status, enabled, COUNT(*)
        FROM provider_accounts
        GROUP BY provider, auth_status, enabled
        ORDER BY provider, auth_status, enabled DESC
        """
    ).fetchall()
    for provider, status, enabled, n in rows:
        flag = "启用" if enabled else "停用"
        print(f"    {provider:<14} {status:<16} {flag}  {n}")

    if has_table(conn, "web_account_profiles"):
        print("\n  Web 账号分层（web_account_profiles.tier）：")
        rows = conn.execute(
            "SELECT tier, COUNT(*) FROM web_account_profiles GROUP BY tier ORDER BY 2 DESC"
        ).fetchall()
        for tier, n in rows:
            print(f"    {tier:<16} {n}")
    else:
        print("\n  （无 web_account_profiles 表）")


def report_capabilities(conn: sqlite3.Connection) -> None:
    section("模型能力（account_model_capabilities）")
    if not has_table(conn, "account_model_capabilities"):
        print("  表不存在，跳过。")
        return
    rows = conn.execute(
        """
        SELECT c.upstream_model, a.provider, COUNT(*)
        FROM account_model_capabilities c
        JOIN provider_accounts a ON a.id = c.account_id
        GROUP BY c.upstream_model, a.provider
        ORDER BY 3 DESC, 1
        """
    ).fetchall()
    if not rows:
        print("  暂无记录。")
        return
    for model, provider, n in rows:
        print(f"  {model:<34} {provider:<14} {n}")


def report_egress(conn: sqlite3.Connection) -> None:
    section("出口节点（egress_nodes）")
    if not has_table(conn, "egress_nodes"):
        print("  表不存在，跳过。")
        return
    total = count(conn, "SELECT COUNT(*) FROM egress_nodes")
    enabled = count(conn, "SELECT COUNT(*) FROM egress_nodes WHERE enabled = 1")
    print(f"  合计 {total}，其中启用 {enabled}")
    rows = conn.execute(
        """
        SELECT scope, COUNT(*), SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END)
        FROM egress_nodes GROUP BY scope ORDER BY scope
        """
    ).fetchall()
    print("\n  按 scope：")
    for scope, n, on in rows:
        print(f"    {str(scope):<16} 共 {n}，启用 {on}")


def report_client_keys(conn: sqlite3.Connection) -> None:
    section("客户端密钥（client_keys）")
    if not has_table(conn, "client_keys"):
        print("  表不存在，跳过。")
        return
    rows = conn.execute(
        """
        SELECT name, prefix, enabled, rpm_limit, max_concurrent
        FROM client_keys ORDER BY id
        """
    ).fetchall()
    if not rows:
        print("  暂无记录。")
        return
    for name, prefix, enabled, rpm, concurrency in rows:
        flag = "启用" if enabled else "停用"
        print(f"  {name:<34} {prefix:<12} {flag}  RPM={rpm} 并发={concurrency}")


def report_media(conn: sqlite3.Connection) -> None:
    section("作品与任务")
    for table, label in (("media_assets", "作品"), ("media_jobs", "视频任务")):
        if has_table(conn, table):
            print(f"  {label}（{table}）：{count(conn, f'SELECT COUNT(*) FROM {table}')}")
        else:
            print(f"  {label}（{table}）：表不存在")


def main() -> int:
    db_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_DB
    if not db_path.exists():
        print(f"数据库不存在：{db_path}", file=sys.stderr)
        return 1

    print(f"数据库：{db_path}")
    print(f"大小：{db_path.stat().st_size / 1024 / 1024:.2f} MB")

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        print(f"\n表数量：{len(table_names(conn))}")
        report_accounts(conn)
        report_capabilities(conn)
        report_egress(conn)
        report_client_keys(conn)
        report_media(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
