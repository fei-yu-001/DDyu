#!/usr/bin/env bash
# DDyu 个人站 · 备份脚本（账号库 + 媒体 + 配置）
#
# 为什么单独写：
#   data/backend.db 里是 246 个账号的加密凭据，与 config.yaml 的
#   secrets.credentialEncryptionKey **成对绑定**；只备份其中一个等于没备份。
#   另外 SQLite 必须用 `.backup`（而不是直接 cp）才能拿到一致快照。
#
# 建议：systemd timer 或 crontab 每 6 小时跑一次
#   crontab: 0 */6 * * * /opt/ddyu/deploy/backup.sh >> /var/log/ddyu/backup.log 2>&1
#
# 用法：
#   APP_DIR=/opt/ddyu BACKUP_DIR=/var/backups/ddyu KEEP=14 ./backup.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ddyu}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ddyu}"
KEEP="${KEEP:-14}"                       # 保留最近多少份
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/${STAMP}"

mkdir -p "${TARGET}"

# 1) SQLite 一致性快照（不要用 cp：WAL 模式下会拷到半截状态）
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${APP_DIR}/data/backend.db" ".backup '${TARGET}/backend.db'"
else
  # 没有 sqlite3 时退化为「停服后拷贝」，但必须显式提示
  echo "[!] 未找到 sqlite3，改用文件拷贝；请确认服务已停止以避免不一致快照" >&2
  cp "${APP_DIR}/data/backend.db" "${TARGET}/backend.db"
fi

# 2) 配置（含加密密钥，权限收紧）
install -m 600 "${APP_DIR}/config.yaml" "${TARGET}/config.yaml"

# 3) 媒体作品（增量同步，避免每份全量）
if [ -d "${APP_DIR}/data/media" ]; then
  rsync -a --delete "${APP_DIR}/data/media/" "${TARGET}/media/"
fi

# 4) 质量守护运行时状态（若启用）
if [ -d "${APP_DIR}/data/quality-guard" ]; then
  rsync -a "${APP_DIR}/data/quality-guard/" "${TARGET}/quality-guard/"
fi

# 5) 校验与轮转
( cd "${TARGET}" && sha256sum backend.db config.yaml > SHA256SUMS )
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn | awk 'NR>'"${KEEP}"' {print $2}' | xargs -r rm -rf

echo "[+] 备份完成：${TARGET}（保留最近 ${KEEP} 份）"
