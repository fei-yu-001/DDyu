# DDyu 个人站 · 部署手册（P7）

> 目标形态：**一台常开的 Linux 机器**（家中小主机 / NAS / VPS 均可）跑单二进制 + systemd，
> 入站走 **Cloudflare Tunnel**（免公网 IP、自动 HTTPS），出站仍走**本机 Resin 代理池**。

---

## 0. 为什么必须是「单机 + 本机 Resin」

号池的价值全在「**账号 ↔ 稳定出口 IP**」：Resin 的粘性键是账号级（`sticky_ttl` 默认 7 天），
站点与 Resin 分离部署会额外引入一段不受控的网络路径。因此：

- ✅ 站点与 Resin **同机**，Resin 监听 `127.0.0.1:2260`，站点通过 `socks5h://…@127.0.0.1:2260` 出站；
- ❌ 不能用 Cloudflare Workers / Vercel 这类无法指定出站 IP 的载体。

> 当前开发机（Windows）已按同一拓扑验证通过（`scripts/web_egress.py` 建的 `resin-web` 节点 id=27）。

---

## 1. 前置条件

| 项 | 要求 |
|---|---|
| 机器 | Linux x86_64，常开；建议 ≥2 核 / 2 GB 内存 / 磁盘按媒体量预留 |
| Resin | 与站点同机的 Resin 发行版，监听 `127.0.0.1:2260`，并已导入订阅、平台可路由节点 > 0 |
| 域名 | `ddyu.online` 已在 Cloudflare 托管 |
| 账号库 | `data/backend.db` **必须与 `config.yaml` 的 `secrets.credentialEncryptionKey` 成对迁移**，换 key 即 246 账号全部报废 |

---

## 2. 构建 Linux 产物

```bash
cd DDyu/backend
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" \
  -o ../dist/ddyu-site ./cmd/grok2api
```

前端产物单独构建后一并搬运（后端会托管静态文件）：

```bash
cd DDyu/frontend && pnpm install --frozen-lockfile && pnpm build   # 产出 dist/
```

> ⚠️ Windows 上那个 `ddyu-site.exe`（86 MB）不能上生产，必须交叉编译。

---

## 3. 目录布局与搬运

```
/opt/ddyu/
├── ddyu-site                     # 二进制（chmod +x）
├── config.yaml                   # 权限 600，含加密密钥
├── frontend-dist/                # 前端构建产物（frontend/dist）
├── deploy/                       # 本目录（含备份脚本）
└── data/
    ├── backend.db                # 账号库（从开发机成对搬过来）
    └── media/                    # 作品文件（可选，历史作品）
/var/lib/ddyu/quality-guard/      # 质量守护运行时目录（systemd 里注入）
/var/log/ddyu/                    # 日志
```

```bash
sudo useradd -r -s /usr/sbin/nologin ddyu
sudo mkdir -p /opt/ddyu /var/lib/ddyu/quality-guard /var/log/ddyu
sudo chown -R ddyu:ddyu /opt/ddyu /var/lib/ddyu /var/log/ddyu
# 从开发机搬运（示例）
rsync -a dist/ddyu-site config.yaml frontend/dist/ server:/opt/ddyu/
rsync -a data/backend.db server:/opt/ddyu/data/
```

---

## 4. 生产化配置改动（`config.yaml`）

| 键 | 改成 | 说明 |
|---|---|---|
| `server.listen` | `0.0.0.0:8000` | 默认是 `127.0.0.1:8000`，反代/隧道要能连 |
| `server.trustedProxies` | 反代或隧道的本机地址 | **禁止 `0.0.0.0/0`**，否则 `X-Forwarded-For` 可被伪造 |
| `auth.secureCookies` | `true` | HTTPS 下必须为 true；本地 http 调试时管理员 Cookie 会表现为「不生效」，属预期 |
| `server.swaggerEnabled` | `false` | 公网不暴露接口文档 |
| `frontend.staticPath` | `/opt/ddyu/frontend-dist` | 前端产物路径 |

`provider.web` 的 Statsig 签名 / clearance 模式**不在 YAML 里**（字段是 `yaml:"-"`），
请用管理接口确认（当前生产库值：`statsigMode=url`、`clearanceMode=manual`）：

```bash
curl -s -X PUT http://127.0.0.1:8000/api/admin/v1/settings -H "Authorization: Bearer <token>" …
# 更简单：直接用 scripts/set_media_capacity.py 同款「先 GET 再整体 PUT」的方式改，避免误伤其它字段
```

---

## 5. systemd

```bash
sudo cp deploy/systemd/ddyu-site.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ddyu-site
systemctl status ddyu-site --no-pager
curl -s http://127.0.0.1:8000/healthz        # {"ok":true}
```

要点（都已写进 unit 文件）：

- `Environment=GROK2API_QUALITY_GUARD_DIR=…` **必须存在**，否则启动即失败；
- `CPUAffinity=` 绑核，避免与同机跑模型的进程抢 CPU；
- `Restart=always`：Resin 未就绪时允许自愈重试。

---

## 6. 入站：Cloudflare Tunnel（推荐）

```bash
cloudflared tunnel login
cloudflared tunnel create ddyu-site          # 记下 UUID
sudo cp deploy/cloudflared/config.yml /etc/cloudflared/config.yml
sudo sed -i 's/REPLACE_WITH_TUNNEL_UUID/<你的 UUID>/g' /etc/cloudflared/config.yml
sudo cloudflared service install
sudo systemctl enable --now cloudflared
cloudflared tunnel route dns ddyu-site ddyu.online
```

**不需要**再开 Nginx：Tunnel 直接回源 `127.0.0.1:8000`。
若坚持「Nginx 直接对外 + Let's Encrypt」，用 `deploy/nginx/ddyu.online.conf`
（注意 `proxy_buffering off` —— 否则 SSE 流式对话会失效）。

---

## 7. 备份

```bash
sudo install -m 700 deploy/backup.sh /opt/ddyu/deploy/backup.sh
# 每 6 小时一次
echo '0 */6 * * * /opt/ddyu/deploy/backup.sh >> /var/log/ddyu/backup.log 2>&1' | sudo tee /etc/cron.d/ddyu-backup
```

备份内容：`backend.db`（SQLite `.backup` 一致性快照）+ `config.yaml`（含加密密钥）+ `data/media/`。
**`backend.db` 与 `config.yaml` 必须一起备份、一起恢复。**

---

## 8. 上线前安全清单

| # | 项 | 措施 |
|---|---|---|
| 1 | 管理员口令 | **必须改**：当前沿用旧实例口令（`config.yaml` 的 `bootstrapAdmin` 只在空库时生效，改它没用，请登录后台改密） |
| 2 | 登录入口 | 用 Cloudflare Access 或 Nginx IP 白名单再包一层 |
| 3 | 客户端密钥 | 一人一 key，设 RPM / 并发 / 额度 / 模型白名单（管理端「客户端密钥」页） |
| 4 | `credentialEncryptionKey` | 强随机、不入 Git、与库一起备份 |
| 5 | `trustedProxies` | 精确填反代地址 |
| 6 | `auth.secureCookies` | 保持 `true` |
| 7 | `server.swaggerEnabled` | 保持 `false` |
| 8 | 媒体容量 | 已从 1 GiB/80% 调到 **20 GiB/90%**（回收水位 18 GiB）；长期运行请按磁盘调整，脚本 `scripts/set_media_capacity.py` |
| 9 | 作品读取 | 已加鉴权（管理员会话 / 短期签名 / 客户端密钥，见 `docs/开发文档.md` 文末「改动时间线」的 P3 条目） |
| 10 | 域名低调 | 不对外宣传；号池价值全在账号上 |

---

## 9. 已知限制（部署前须知）

1. **视频当前不可用**：`POST /v1/videos/generations` 返回
   `503 upstream_model_unavailable`（"当前账号池不支持该模型"）。视频路由存在
   （`Web/grok-imagine-video`），但当前 52 个 Web 账号都是 `basic` 层，
   无法调度该能力；图生视频/编辑/延长还会被 Web 适配器明确拒绝
   （`Grok Web 当前仅支持文本生视频`）。要开通视频需补充支持视频的账号层级。
2. **Web 账号不参与凭据刷新**：`account_credentials.last_refresh_at` 对 52 个 Web 账号为空属正常
   （Web 走 SSO + Cloudflare clearance，没有 refresh token 轮换）；194 个 Build 账号刷新正常。
3. **Resin 必须常驻同机**：Tunnel 只解决入站；出站永远走本机 Resin。
4. **管理员 access Cookie 的 path 收敛在 `/api/admin/v1`**：新增页面若要读取作品，
   请使用接口返回的**带签名 URL**（详见 P3 记录），不要指望 Cookie。

---

## 10. 回滚

```bash
sudo systemctl stop ddyu-site
sudo cp /var/backups/ddyu/<时间戳>/backend.db /opt/ddyu/data/backend.db
sudo cp /var/backups/ddyu/<时间戳>/config.yaml /opt/ddyu/config.yaml
sudo chown ddyu:ddyu /opt/ddyu/data/backend.db
sudo systemctl start ddyu-site
```

> 注意：`backend.db` 与 `config.yaml` 必须来自**同一份**备份，否则凭据解不开。
