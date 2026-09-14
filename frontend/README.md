# frontend

创意工坊（Studio）前端：React 19 + Vite + TypeScript + Tailwind + shadcn/ui，SPA 挂载在 `/studio`（basename）。
构建产物输出到 `dist/`，由 Go 后端从磁盘直接服务（`config.yaml` 的 `frontend.staticPath`），重新构建无需重启后端。

## 目录结构

```
src/
├── app/                  # 应用骨架：路由、外壳、鉴权边界、懒加载
│   ├── router.tsx        # 全部路由（匿名 / 公开 / 管理员三级边界）
│   ├── app-shell.tsx     # 顶部一级导航 + 侧边二级菜单 + 账号区
│   ├── auth-boundary.tsx # 登录态恢复与拦截
│   ├── deferred-pages.tsx# 各页面的 lazy 包装（路由级代码分割）
│   └── providers.tsx     # QueryClient / Theme / Toast 等 Provider
├── components/
│   └── ui/               # shadcn 基础组件（button、dialog、select…）
├── features/             # 每个菜单页一个文件夹：页面 + 页面私有组件 + 页面私有 API
│   ├── creative-console/ # 创作控制台（聊天 / 图片 / 图编 / 视频四个面板各自成文件）
│   ├── profile/          # 个人中心（账户信息、主题、语言、壁纸明显度）
│   ├── media/            # 图库 + 视频库
│   ├── accounts/         # 上游账号
│   ├── client-keys/      # 客户端密钥
│   ├── models/           # 模型路由
│   ├── settings/         # 系统设置
│   ├── dashboard/        # 仪表盘
│   ├── audits/           # 请求审计
│   ├── quality-guard/    # 质量守护
│   ├── docs/             # 接口文档
│   ├── auth/             # 登录页
│   └── system/           # 版本徽标等零碎系统件
├── shared/               # 跨 feature 的基础设施
│   ├── api/              # API 客户端（client.ts）+ 按域拆分的请求方法
│   ├── auth/             # 会话状态与 useAuth
│   ├── components/       # 跨页面通用件（PageHeader、SiteFooter…）
│   ├── config/           # 运行时配置读取
│   ├── hooks/            # 通用 hooks
│   ├── i18n/             # 文案：index.ts 组装，zh-CN/ 与 en/ 按功能域拆文件
│   └── lib/              # 纯工具（cn、background、clipboard…）
└── types/                # 运行时类型声明
```

## 约定

- **新增菜单页**：在 `features/<name>/` 下建 `<name>-page.tsx`（默认导出同名组件），
  在 `app/deferred-pages.tsx` 加 lazy 包装，在 `app/router.tsx` 对应边界下加路由。
  页面私有 API 放在本 feature 目录（如 `creative-console-api.ts`），跨页面复用的 API 放 `shared/api/`。
- **组件文件**：单文件尽量 200–400 行，硬上限 800 行；超限按"面板 / 子组件 / 纯逻辑"拆分
  （参考 `features/creative-console/`：page + 各 panel + chat-history + assistant-markup + shared）。
- **i18n**：文案按功能域拆在 `shared/i18n/zh-CN/<domain>.ts` 与 `shared/i18n/en/<domain>.ts`，
  导出形如 `export const <domain> = { <domain>: { ... } }`（注意外层要带域名包裹层），
  再在对应语言的 `index.ts` 里展开合并。新增页面文案同样开一个域文件。
- **主题 / 外观**：浅色主题显示壁纸背景（`.site-bg` 与博客 body），深色主题回退纯色；
  壁纸明显度存 `localStorage["ddyu:bg-prominence"]`（0–100，默认 70），
  通过 CSS 变量 `--bg-veil` 生效，个人中心可调节，博客侧由首屏脚本同步。
