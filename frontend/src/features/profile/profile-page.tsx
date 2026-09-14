import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/shared/auth/use-auth";
import { PageHeader } from "@/shared/components/page-header";
import { applyBgProminence, readBgProminence, storeBgProminence } from "@/shared/lib/background";
import { cn } from "@/shared/lib/cn";

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { admin, logout, status } = useAuth();
  const authenticated = status === "authenticated";
  const [prominence, setProminence] = useState(readBgProminence);

  function updateProminence(value: number): void {
    setProminence(value);
    storeBgProminence(value);
    applyBgProminence(value);
  }

  const themeOptions = [
    { value: "light", label: t("shell.light"), icon: Sun },
    { value: "dark", label: t("shell.dark"), icon: Moon },
    { value: "system", label: t("shell.system"), icon: Monitor },
  ] as const;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={t("profile.title")} description={t("profile.description")} />

      <section className="rounded-2xl bg-secondary/45 p-5 ring-1 ring-transparent">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-lg font-semibold text-foreground">
            {admin?.username?.charAt(0) ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{authenticated ? admin?.username : t("nav.guest")}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{authenticated ? t("profile.roleAdmin") : t("profile.roleGuest")}</div>
          </div>
          {authenticated ? (
            <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => void logout()}>
              <LogOut className="size-3.5" />{t("auth.signOut")}
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" asChild>
              <Link to="/login">{t("auth.signIn")}</Link>
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-secondary/45 p-5 ring-1 ring-transparent">
        <div className="flex items-start gap-4">
          <img
            src={`${import.meta.env.BASE_URL}qiqi-avatar.jpg`}
            alt={t("profile.qiqiName")}
            className="size-16 shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("profile.qiqiName")}</div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("profile.qiqiIntro")}</p>
            {authenticated ? (
              <a href="/story/" className="mt-2 inline-flex items-center text-xs font-medium text-foreground underline underline-offset-4 transition-opacity hover:opacity-70">
                {t("profile.storyLink")}
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-secondary/45 p-5 ring-1 ring-transparent">
        <div className="text-sm font-medium">{t("shell.appearance")}</div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t("shell.light")} / {t("shell.dark")} / {t("shell.system")}</div>
          <div className="flex flex-wrap gap-1.5">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={theme === value ? "default" : "secondary"}
                size="sm"
                className="gap-1.5"
                onClick={() => setTheme(value)}
              >
                <Icon className="size-3.5" />{label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t("shell.language")}</div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant={i18n.language === "zh-CN" ? "default" : "secondary"} size="sm" onClick={() => void i18n.changeLanguage("zh-CN")}>简体中文</Button>
            <Button type="button" variant={i18n.language === "en" ? "default" : "secondary"} size="sm" onClick={() => void i18n.changeLanguage("en")}>English</Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("profile.wallpaper")}</span>
            <span className="tabular-nums text-muted-foreground">{prominence}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={prominence}
            onChange={(event) => updateProminence(Number(event.target.value))}
            className={cn("w-full accent-primary")}
            aria-label={t("profile.wallpaper")}
          />
          <p className="text-xs leading-5 text-muted-foreground">{t("profile.wallpaperDescription")}</p>
        </div>
      </section>
    </div>
  );
}
