import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/shared/auth/use-auth";

export function AuthBoundary() {
  const { status, retryRestore } = useAuth();
  const location = useLocation();

  if (status === "restoring") {
    return <RestoringScreen />;
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (status === "unavailable") {
    return <SessionUnavailableScreen onRetry={retryRestore} />;
  }

  return <Outlet />;
}

// PublicBoundary 用于匿名也能访问的页面（创意工坊）：它用使用者自己的客户端密钥
// 鉴权，不依赖管理员登录态。这里只在会话恢复期间显示占位，避免首屏闪烁。
export function PublicBoundary() {
  const { status } = useAuth();
  if (status === "restoring") {
    return <RestoringScreen />;
  }
  return <Outlet />;
}

export function AnonymousBoundary() {
  const { status, retryRestore } = useAuth();
  if (status === "restoring") {
    return <RestoringScreen />;
  }
  if (status === "unavailable") {
    return <SessionUnavailableScreen onRetry={retryRestore} />;
  }
  return status === "authenticated" ? <Navigate to="/creative-console" replace /> : <Outlet />;
}

function RestoringScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner className="size-5" />
    </div>
  );
}

function SessionUnavailableScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-medium">{t("auth.sessionUnavailable")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.sessionUnavailableDescription")}</p>
        <Button size="sm" className="mt-5" onClick={() => void onRetry()}>{t("auth.retrySession")}</Button>
      </div>
    </div>
  );
}
