import { Navigate, createBrowserRouter } from "react-router-dom";

import { AnonymousBoundary, AuthBoundary, PublicBoundary } from "@/app/auth-boundary";
import { DeferredAccountsPage, DeferredApiDocsPage, DeferredAppShell, DeferredClientKeysPage, DeferredCreativeConsolePage, DeferredDashboardPage, DeferredGalleryPage, DeferredModelsPage, DeferredProfilePage, DeferredQualityGuardPage, DeferredRequestAuditsPage, DeferredSettingsPage, DeferredVideoGalleryPage } from "@/app/deferred-pages";
import { LoginPage } from "@/features/auth/login-page";

export const router = createBrowserRouter([
  {
    element: <AnonymousBoundary />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    // 创意工坊对匿名开放：它用使用者自己的客户端密钥鉴权，不需要管理员登录态。
    element: <PublicBoundary />,
    children: [
      {
        element: <DeferredAppShell />,
        children: [
          { index: true, element: <Navigate to="/creative-console" replace /> },
          { path: "/creative-console", element: <DeferredCreativeConsolePage /> },
          { path: "/profile", element: <DeferredProfilePage /> },
        ],
      },
    ],
  },
  {
    // 管理端页面（号池维护）继续要求管理员会话。
    element: <AuthBoundary />,
    children: [
      {
        element: <DeferredAppShell />,
        children: [
          { index: true, element: <Navigate to="/creative-console" replace /> },
          { path: "/dashboard", element: <DeferredDashboardPage /> },
          { path: "/accounts", element: <DeferredAccountsPage /> },
          { path: "/models", element: <DeferredModelsPage /> },
          { path: "/creative-console", element: <DeferredCreativeConsolePage /> },
          { path: "/client-keys", element: <DeferredClientKeysPage /> },
          { path: "/gallery", element: <DeferredGalleryPage /> },
          { path: "/video-gallery", element: <DeferredVideoGalleryPage /> },
          { path: "/request-audits", element: <DeferredRequestAuditsPage /> },
          { path: "/quality-guard", element: <DeferredQualityGuardPage /> },
          { path: "/docs", element: <Navigate to="/docs/chat/completions" replace /> },
          { path: "/docs/:category/:endpoint", element: <DeferredApiDocsPage /> },
          { path: "/settings", element: <DeferredSettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/creative-console" replace /> },
], {
  // 创意工坊挂在 /studio 下：路由匹配与生成的链接都以此为基准。
  basename: "/studio",
});
