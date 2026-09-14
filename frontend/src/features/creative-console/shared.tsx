import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ClientModel } from "@/features/creative-console/creative-console-api";
import { cn } from "@/shared/lib/cn";

export type CreativeMode = "chat" | "image" | "image_edit" | "video";

export type CreativePanelProps = {
  apiKey: string;
  model: string;
  modelOptions: ClientModel[];
  onModelChange: (model: string) => void;
};

export const imageAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export const videoAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export const imageResolutions = ["1k", "2k"] as const;
export const videoResolutions = ["480p", "720p", "1080p"] as const;
export const composerClassName = "overflow-hidden rounded-2xl bg-secondary/45 ring-1 ring-transparent transition-colors focus-within:bg-secondary/60 focus-within:ring-ring";

let fallbackMessageID = 0;

export function createCreativeMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  fallbackMessageID += 1;
  return `creative-${Date.now().toString(36)}-${fallbackMessageID.toString(36)}`;
}

export function createCreativeCacheKey(): string {
  return `creative-console-${createCreativeMessageId()}`;
}

export function currentTimestamp(): number {
  return Date.now();
}

export function validDuration(value: string): boolean {
  const duration = Number(value);
  return Number.isInteger(duration) && duration >= 1 && duration <= 15;
}

export function WelcomeState({ title }: { title: string }) {
  return (
    <div className="flex min-h-[20rem] items-center justify-center px-6 text-center">
      <h2 className="max-w-2xl text-xl font-medium tracking-tight text-muted-foreground sm:text-2xl">{title}</h2>
    </div>
  );
}

export function LoadingResult({ text }: { text: string }) {
  return <div className="flex min-h-[20rem] items-center justify-center gap-3 text-xs text-muted-foreground"><Spinner className="size-5" />{text}</div>;
}

export function InlineError({ message }: { message: string }) {
  return <div role="alert" className="rounded-md bg-destructive/8 px-3 py-2 text-xs leading-5 text-destructive">{message}</div>;
}

export function RetryableError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md bg-destructive/8 px-3 py-2 text-xs leading-5 text-destructive sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      <Button type="button" variant="ghost" size="sm" className="self-start text-destructive hover:text-destructive sm:self-auto" onClick={onRetry}>
        <RefreshCw />{t("common.retry")}
      </Button>
    </div>
  );
}

export function MetaItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 py-2"><div className="mb-1 text-[11px] text-muted-foreground">{label}</div><div className={cn("truncate text-xs", mono && "font-mono")} title={value}>{value}</div></div>;
}

export function CompactModelSelect({ value, models, onChange }: { value: string; models: ClientModel[]; onChange: (model: string) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange} disabled={models.length === 0}>
      <SelectTrigger className="h-8 w-auto max-w-56 gap-1 border-0 bg-transparent px-2 shadow-none hover:bg-secondary/70 focus:bg-secondary/70 focus:ring-0" aria-label={t("creativeConsole.model")}>
        <SelectValue placeholder={models.length === 0 ? t("creativeConsole.noModels") : t("creativeConsole.selectModel")} />
      </SelectTrigger>
      <SelectContent>{models.map((item) => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function CompactSelect({ value, options, onChange, ariaLabel, suffix, icon }: { value: string; options: readonly string[]; onChange: (value: string) => void; ariaLabel: string; suffix?: string; icon?: ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent px-2 shadow-none hover:bg-secondary/70 focus:bg-secondary/70 focus:ring-0 [&>svg]:size-3.5 [&>svg]:shrink-0" aria-label={ariaLabel}>
        {icon}<SelectValue />
      </SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}{suffix}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function CompactIconSelect({ value, options, onChange, ariaLabel, icon, active = false, disabled = false }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; ariaLabel: string; icon: ReactNode; active?: boolean; disabled?: boolean }) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? ariaLabel;
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger className={cn("h-8 w-auto min-w-8 gap-1 bg-transparent px-2 shadow-none hover:bg-secondary/70 focus:bg-secondary/70 focus:ring-0", active && "bg-secondary/70 text-foreground")} aria-label={`${ariaLabel}: ${selectedLabel}`}>
            <span className="flex items-center [&_svg]:size-3.5">{icon}</span>
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent>{ariaLabel} · {selectedLabel}</TooltipContent>
      </Tooltip>
      <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function XSocialIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
