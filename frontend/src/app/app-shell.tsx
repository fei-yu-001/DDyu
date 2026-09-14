import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Heart, Image, KeyRound, Languages, LogIn, LogOut, Menu, Monitor, Moon, MoreHorizontal, Settings, Sparkles, Sun, User, Users, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/shared/auth/use-auth";
import { SiteFooter } from "@/shared/components/site-footer";
import { applyBgProminence, readBgProminence } from "@/shared/lib/background";
import { cn } from "@/shared/lib/cn";
import { CurrentVersionLabel } from "@/features/system/version-update";

// 导航已按个人站定位收窄：站点主体是创意工坊（对匿名开放，用客户端密钥鉴权），
// 其余五项是站主维护号池用的管理页，只在管理员会话下显示。
// 概览（dashboard）、请求审计、质量守护不再作为入口暴露。
type NavigationItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };

const navigation: NavigationItem[] = [
  { href: "/creative-console", label: "nav.creativeConsole", icon: Sparkles },
  { href: "/gallery", label: "nav.gallery", icon: Image, adminOnly: true },
  { href: "/video-gallery", label: "nav.videoGallery", icon: Video, adminOnly: true },
  { href: "/accounts", label: "nav.accounts", icon: Users, adminOnly: true },
  { href: "/client-keys", label: "nav.clientKeys", icon: KeyRound, adminOnly: true },
  { href: "/models", label: "nav.models", icon: Box, adminOnly: true },
  { href: "/story", label: "nav.story", icon: Heart, adminOnly: true },
];

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { admin, logout, changePassword, status } = useAuth();
  const authenticated = status === "authenticated";
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => authenticated || !item.adminOnly),
    [authenticated],
  );
  const location = useLocation();
  const { setTheme } = useTheme();

  // 壁纸明显度：进入工坊时应用访客在个人中心保存的值（博客侧由首屏脚本应用）。
  useEffect(() => {
    applyBgProminence(readBgProminence());
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isMediaWorkspace = ["/creative-console", "/gallery", "/video-gallery"].includes(location.pathname);

  const passwordSchema = z.object({
    currentPassword: z.string().min(1, t("errors.required")),
    newPassword: z.string().min(8, t("errors.minPassword")),
  });
  type PasswordForm = z.infer<typeof passwordSchema>;
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  async function submitPassword(values: PasswordForm): Promise<void> {
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success(t("auth.passwordUpdated"));
      passwordForm.reset();
      setPasswordOpen(false);
      await logout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
    }
  }

  function navigationLinks(): ReactNode {
    return visibleNavigation.map(({ href, label, icon: Icon }) =>
      // /story 是博客侧的站级页面（与 SPA basename 无关），用普通锚点整页跳转。
      href === "/story" ? (
        <a
          key={href}
          href="/story/"
          onClick={() => setMobileOpen(false)}
          className="group flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-normal text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground"
        >
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Icon className="size-4 text-muted-foreground" fill="none" strokeWidth={1.8} />
          </span>
          {t(label)}
        </a>
      ) : (
      <NavLink
        key={href}
        to={href}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) => cn(
          "group flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-normal text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground",
          isActive && "bg-secondary/60 text-foreground",
        )}
      >
        {({ isActive }) => (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center">
              <Icon className={cn("size-4 text-muted-foreground", isActive && "text-foreground")} fill={isActive ? "currentColor" : "none"} fillOpacity={isActive ? 0.14 : 0} strokeWidth={1.8} />
            </span>
            {t(label)}
          </>
        )}
      </NavLink>
      ),
    );
  }

  // 顶部一级站点导航，与博客头部一致（首页 / 关于 / 创意工坊）；桌面端在头部正中。
  // 博客在 / 与 /about/，是与 SPA（basename=/studio）独立的静态站，
  // 必须用普通锚点整页跳转；创意工坊在 SPA 内，用 Link 客户端跳转。
  function topLinks(): ReactNode {
    return (
      <>
        <a href="/" className="rounded-md px-2.5 py-1.5 text-sm font-normal text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground lg:text-xl">{t("nav.home")}</a>
        <a href="/about/" className="rounded-md px-2.5 py-1.5 text-sm font-normal text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground lg:text-xl">{t("nav.about")}</a>
        <Link to="/creative-console" className="rounded-md bg-foreground/10 px-2.5 py-1.5 text-sm font-semibold text-foreground lg:text-xl">{t("nav.studio")}</Link>
      </>
    );
  }

  const navigationContent = (
    <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 pb-2" aria-label={t("shell.navigation")}>
      <div className="space-y-1">{navigationLinks()}</div>
    </nav>
  );

  const accountControl = (
    <div className="flex h-9 items-center gap-1 px-2.5">
      <span className="min-w-0 flex-1 truncate text-xs font-normal capitalize text-muted-foreground">{authenticated ? admin?.username : t("nav.guest")}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("common.actions")}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-56 p-1.5">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="h-8"><Sun />{t("shell.appearance")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => setTheme("light")}><Sun />{t("shell.light")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}><Moon />{t("shell.dark")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}><Monitor />{t("shell.system")}</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="h-8"><Languages />{t("shell.language")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => void i18n.changeLanguage("zh-CN")}>简体中文</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void i18n.changeLanguage("en")}>English</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {authenticated ? (
            <>
              <DropdownMenuItem className="h-8" onClick={() => setPasswordOpen(true)}><KeyRound />{t("auth.changePassword")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="h-8" onClick={() => void logout()}><LogOut />{t("auth.signOut")}</DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="h-8" asChild><Link to="/login">{t("auth.signIn")}</Link></DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {authenticated ? (
        <NavLink
          to="/settings"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => cn("flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground", isActive && "bg-secondary/60 text-foreground")}
          aria-label={t("nav.settings")}
        >
          <Settings className="size-4" strokeWidth={1.8} />
        </NavLink>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="relative mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-2 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="size-8 lg:hidden" aria-label={t("shell.openNavigation")}><Menu className="size-4" /></Button></SheetTrigger>
              <SheetContent side="left" className="flex h-dvh max-h-dvh w-72 flex-col gap-0 overflow-hidden bg-sidebar px-3 py-4 [&>button]:right-2 [&>button]:top-3.5 [&>button]:flex [&>button]:size-7 [&>button]:items-center [&>button]:justify-center">
                <SheetHeader className="h-7 shrink-0 px-2.5 text-left">
                  <SheetTitle className="flex h-7 items-center text-base">{t("appName")}</SheetTitle>
                  <SheetDescription className="sr-only">{t("shell.navigation")}</SheetDescription>
                </SheetHeader>
                <nav className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-2" aria-label={t("shell.navigation")}>
                  <div className="space-y-1">{navigationLinks()}</div>
                </nav>
                <div className="relative z-10 mt-3 shrink-0 border-t border-sidebar-border/60 bg-sidebar pt-3">{accountControl}</div>
              </SheetContent>
            </Sheet>
            <Link to="/creative-console" className="flex min-w-0 items-baseline gap-2 text-base font-semibold text-foreground lg:text-xl">
              <span className="truncate">{t("appName")}</span>
              <CurrentVersionLabel />
            </Link>
          </div>
          {/* 桌面端：三个链接在头部正中（绝对定位居中，不受左侧 logo 宽度影响） */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 text-xl lg:flex" aria-label={t("shell.navigation")}>
            {topLinks()}
          </nav>
          <div className="flex items-center gap-1">
            <nav className="flex items-center gap-1 text-sm lg:hidden" aria-label={t("shell.navigation")}>
              {topLinks()}
            </nav>
            {/* 我们的故事（仅管理员可见）：我俩头像并排、标签在下方居中；点任一头像都进日记页；移动端在侧边栏里 */}
            {authenticated ? (
              <a href="/story/" className="hidden flex-col items-center gap-1 lg:flex" title={t("nav.story")}>
                <span className="flex items-center gap-1.5">
                  <img
                    src={`${import.meta.env.BASE_URL}qiqi-avatar.jpg`}
                    alt={t("profile.qiqiName")}
                    className="size-7 rounded-full object-cover ring-1 ring-foreground/10"
                  />
                  <img
                    src={`${import.meta.env.BASE_URL}feige-avatar.jpg`}
                    alt={t("profile.feigeName")}
                    className="size-7 rounded-full object-cover ring-1 ring-foreground/10"
                  />
                </span>
                <span className="text-[10px] leading-none text-muted-foreground">{t("nav.story")}</span>
              </a>
            ) : null}
            {/* 设置齿轮：外观 / 语言 / 个人中心 / 参数调节 / 改密 / 退出（访客只有外观 / 语言 / 登录） */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-0.5 size-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("nav.settings")}>
                  <Settings className="size-4" strokeWidth={1.8} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1.5">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8"><Sun />{t("shell.appearance")}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setTheme("light")}><Sun />{t("shell.light")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}><Moon />{t("shell.dark")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}><Monitor />{t("shell.system")}</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8"><Languages />{t("shell.language")}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => void i18n.changeLanguage("zh-CN")}>简体中文</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void i18n.changeLanguage("en")}>English</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {authenticated ? (
                  <>
                    <DropdownMenuItem className="h-8" asChild><Link to="/profile"><User />{t("profile.title")}</Link></DropdownMenuItem>
                    <DropdownMenuItem className="h-8" asChild><Link to="/settings"><Settings />{t("nav.tuneParams")}</Link></DropdownMenuItem>
                    <DropdownMenuItem className="h-8" onClick={() => setPasswordOpen(true)}><KeyRound />{t("auth.changePassword")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="h-8" onClick={() => void logout()}><LogOut />{t("auth.signOut")}</DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="h-8" asChild><Link to="/login"><LogIn />{t("auth.signIn")}</Link></DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <aside className="hidden w-[288px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
          {navigationContent}
          <div className="relative z-10 mt-4 shrink-0 bg-sidebar pt-4">{accountControl}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className={cn("site-bg mx-auto w-full max-w-[1280px] flex-1 px-5 sm:px-8", isMediaWorkspace ? "pt-8 pb-0 lg:pt-20" : "py-8 lg:py-20")}>
            <Outlet />
          </main>
          {!isMediaWorkspace ? <SiteFooter /> : null}
        </div>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("auth.changePassword")}</DialogTitle><DialogDescription>{admin?.username}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={passwordForm.handleSubmit(submitPassword)}>
            <div className="space-y-2"><Label htmlFor="current-password">{t("auth.currentPassword")}</Label><Input id="current-password" type="password" autoComplete="current-password" {...passwordForm.register("currentPassword")} />{passwordForm.formState.errors.currentPassword ? <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p> : null}</div>
            <div className="space-y-2"><Label htmlFor="new-password">{t("auth.newPassword")}</Label><Input id="new-password" type="password" autoComplete="new-password" {...passwordForm.register("newPassword")} />{passwordForm.formState.errors.newPassword ? <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p> : null}</div>
            <DialogFooter><Button type="button" variant="secondary" size="sm" onClick={() => setPasswordOpen(false)}>{t("common.cancel")}</Button><Button type="submit" size="sm" disabled={passwordForm.formState.isSubmitting}>{t("common.save")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
