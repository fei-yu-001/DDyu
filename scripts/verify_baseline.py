#!/usr/bin/env python3
"""账号库基线校验（只读）。

用途：迁移、备份还原或改配置之后，快速确认账号库没有被动坏。
预期基线：194 个 grok_build + 52 个 grok_web，且 **0 个 grok_console**
（Console 渠道已经从本项目剥离）。

安全性：本脚本只执行 SELECT，不会写入或修改数据库。
校验不通过时以非零退出码结束，方便接入部署脚本。

用法：
    python scripts/verify_baseline.py [数据库路径]
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "backend.db"

EXPECTED_PROVIDERS = {
    "grok_build": 194,
    "grok_web": 52,
}
FORBIDDEN_PROVIDERS = ("grok_console",)
REQUIRED_TABLES = (
    "provider_accounts",
    "account_credentials",
    "egress_nodes",
    "client_keys",
    "media_assets",
)


def main() -> int:
    db_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_DB
    if not db_path.exists():
        print(f"[失败] 数据库不存在：{db_path}")
        return 1

    failures: list[str] = []
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        print(f"数据库：{db_path}")

        # 1. 关键表齐备
        for table in REQUIRED_TABLES:
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                (table,),
            ).fetchone()
            if row is None:
                failures.append(f"缺少关键表：{table}")
        if not failures:
            print(f"[通过] {len(REQUIRED_TABLES)} 张关键表齐备")

        # 2. 渠道分布
        rows = conn.execute(
            "SELECT provider, COUNT(*) FROM provider_accounts GROUP BY provider"
        ).fetchall()
        actual = {provider: n for provider, n in rows}
        print("\n渠道分布：")
        for provider, n in sorted(actual.items()):
            print(f"  {provider:<14} {n}")

        for provider, expected in EXPECTED_PROVIDERS.items():
            got = actual.get(provider, 0)
            if got != expected:
                failures.append(
                    f"{provider} 账号数 {got}，预期 {expected}"
                    "（如果是主动增删账号，请同步更新本脚本的基线）"
                )

        for provider in FORBIDDEN_PROVIDERS:
            got = actual.get(provider, 0)
            if got:
                failures.append(
                    f"存在 {got} 个 {provider} 账号，但该渠道已从本项目剥离"
                )

        # 3. 凭据密文完整性
        encrypted = conn.execute(
            """
            SELECT COUNT(*) FROM account_credentials
            WHERE encrypted_primary IS NULL OR encrypted_primary = ''
            """
        ).fetchone()[0]
        if encrypted:
            failures.append(
                f"{encrypted} 条凭据缺少 encrypted_primary 密文"
                "（通常是 credentialEncryptionKey 不匹配导致的，账号将无法使用）"
            )
        else:
            print("\n[通过] 全部凭据都具有 encrypted_primary 密文")

        # 4. Console 残留（模型路由与能力）
        for table in ("model_routes", "account_model_capabilities"):
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                (table,),
            ).fetchone()
            if row is None:
                continue
            columns = {
                item[1] for item in conn.execute(f"PRAGMA table_info({table})").fetchall()
            }
            conditions = []
            if "provider" in columns:
                conditions.append("provider = 'grok_console'")
            if "upstream_model" in columns:
                conditions.append("upstream_model LIKE 'grok-console%'")
            if not conditions:
                continue
            leaked = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE " + " OR ".join(conditions)
            ).fetchone()[0]
            if leaked:
                print(
                    f"[提示] {table} 中仍有 {leaked} 条 Console 残留记录"
                    "（应用启动时会把 Console 模型路由覆盖为空，属正常现象）"
                )
    finally:
        conn.close()

    print()
    if failures:
        print("校验未通过：")
        for item in failures:
            print(f"  - {item}")
        return 1

    print("校验通过：账号库符合预期基线。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
