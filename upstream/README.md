# upstream/

fork 上游（chenyme/grok2api + lij768423-svg/grok2api）遗留的 Docker 部署物料。

本项目实际部署路径是 `deploy/`（systemd + Cloudflare Tunnel），不使用 Docker，
这些文件不被 `scripts/`、`Makefile`、`deploy/` 或后端代码引用，2026-09-13 从仓库根归档到此。

- `AI_GROK2API_INSTALL.md` — 上游 fork 的一键安装说明（docker compose 路径）
- `Dockerfile` / `Dockerfile.derived` / `docker-compose.yml` / `docker/entrypoint.sh` — 上游 Docker 构建物料
- `tools/egress-quality-guard/` — Python quality guard sidecar（已废弃：质量闸门改为后端进程内实现，见 `backend/internal/transport/http/egress/`）
