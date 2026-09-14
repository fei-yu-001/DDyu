import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, ImagePlus, KeyRound, MessageSquareText, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/features/creative-console/chat-panel";
import { listClientModels, type ClientModel } from "@/features/creative-console/creative-console-api";
import { ImageEditPanel } from "@/features/creative-console/image-edit-panel";
import { ImagePanel } from "@/features/creative-console/image-panel";
import { VideoPanel } from "@/features/creative-console/video-panel";
import { type CreativeMode, type CreativePanelProps, InlineError, RetryableError } from "@/features/creative-console/shared";
import { PageHeader } from "@/shared/components/page-header";
import { cn } from "@/shared/lib/cn";


// 客户端密钥自持：密钥只保存在使用者自己的浏览器里，创意工坊因此不需要管理员登录态。
const clientKeyStorageKey = "grok2api:studio:client-key";

function readStoredClientKey(): string {
  try {
    return (window.localStorage.getItem(clientKeyStorageKey) ?? "").trim();
  } catch {
    return "";
  }
}

function maskClientKey(value: string): string {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}


// 聊天记录等本地状态按密钥隔离，但不要把密钥明文写进 localStorage 的键名里，
// 因此用一段非可逆摘要作为作用域标识。
function clientKeyScope(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function CreativeConsolePage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CreativeMode>("chat");
  const [clientKey, setClientKey] = useState(readStoredClientKey);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyEditing, setKeyEditing] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Record<CreativeMode, string>>({ chat: "", image: "", image_edit: "", video: "" });
  const [chatToolbarElement, setChatToolbarElement] = useState<HTMLDivElement | null>(null);

  // 模型列表直接走 /v1/models（客户端密钥鉴权），不再依赖管理端接口，
  // 因此创意工坊无需管理员登录态即可使用。
  const modelsQuery = useQuery({
    queryKey: ["creative-console", "client-models", clientKey],
    queryFn: ({ signal }) => listClientModels({ apiKey: clientKey, signal }),
    enabled: Boolean(clientKey),
    retry: false,
    staleTime: 60_000,
  });

  const modelGroups = useMemo(() => {
    const models = modelsQuery.data ?? [];
    const pick = (...capabilities: string[]): ClientModel[] =>
      models.filter((model) => capabilities.includes(model.capability));
    return {
      chat: pick("chat", "responses"),
      image: pick("image"),
      image_edit: pick("image_edit"),
      video: pick("video"),
    };
  }, [modelsQuery.data]);

  const effectiveModels = useMemo<Record<CreativeMode, string>>(() => {
    const resolve = (group: ClientModel[], selected: string): string =>
      group.some((model) => model.id === selected) ? selected : group[0]?.id ?? "";
    return {
      chat: resolve(modelGroups.chat, selectedModels.chat),
      image: resolve(modelGroups.image, selectedModels.image),
      image_edit: resolve(modelGroups.image_edit, selectedModels.image_edit),
      video: resolve(modelGroups.video, selectedModels.video),
    };
  }, [modelGroups, selectedModels]);

  const apiKey = clientKey;
  const keyScope = apiKey ? clientKeyScope(apiKey) : "anonymous";

  function applyClientKey(): void {
    const next = keyDraft.trim();
    setClientKey(next);
    setKeyEditing(false);
    setKeyDraft("");
    try {
      if (next) window.localStorage.setItem(clientKeyStorageKey, next);
      else window.localStorage.removeItem(clientKeyStorageKey);
    } catch {
      // 隐私模式下 localStorage 不可用：密钥仅对本次会话有效。
    }
  }

  function clearClientKey(): void {
    setClientKey("");
    setKeyDraft("");
    setKeyEditing(true);
    try {
      window.localStorage.removeItem(clientKeyStorageKey);
    } catch {
      // 同上，忽略。
    }
  }

  function panelProps(panelMode: CreativeMode): CreativePanelProps {
    return {
      apiKey,
      model: effectiveModels[panelMode],
      modelOptions: modelGroups[panelMode],
      onModelChange: (model) => setSelectedModels((current) => ({ ...current, [panelMode]: model })),
    };
  }

  const showKeyForm = keyEditing || !apiKey;

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-[36rem] flex-col gap-5 overflow-hidden">
      <PageHeader title={t("creativeConsole.title")} description={t("creativeConsole.description")} />

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-9 shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={mode} onValueChange={(value) => setMode(value as CreativeMode)}>
            <TabsList className="h-9 w-full rounded-full bg-secondary/50 p-1 lg:w-auto">
              <TabsTrigger className="flex-1 gap-1.5 rounded-full px-3 lg:min-w-20 [&_svg]:size-3.5" value="chat"><MessageSquareText />{t("creativeConsole.modes.chat")}</TabsTrigger>
              <TabsTrigger className="flex-1 gap-1.5 rounded-full px-3 lg:min-w-20 [&_svg]:size-3.5" value="image"><ImageIcon />{t("creativeConsole.modes.image")}</TabsTrigger>
              <TabsTrigger className="flex-1 gap-1.5 rounded-full px-3 lg:min-w-20 [&_svg]:size-3.5" value="image_edit"><ImagePlus />{t("creativeConsole.modes.imageEdit")}</TabsTrigger>
              <TabsTrigger className="flex-1 gap-1.5 rounded-full px-3 lg:min-w-20 [&_svg]:size-3.5" value="video"><Video />{t("creativeConsole.modes.video")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex min-w-0 items-center gap-2">
            {showKeyForm ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 lg:w-96 lg:flex-none">
                <Input
                  id="creative-key"
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    applyClientKey();
                  }}
                  placeholder={t("creativeConsole.keyPlaceholder")}
                  aria-label={t("creativeConsole.clientKey")}
                  className="min-w-0 flex-1 bg-secondary/55 font-mono text-xs"
                />
                <Button type="button" size="sm" className="shrink-0" disabled={!keyDraft.trim()} onClick={applyClientKey}>{t("creativeConsole.useKey")}</Button>
                {apiKey ? <Button type="button" size="icon" variant="ghost" className="shrink-0" aria-label={t("creativeConsole.cancelKeyEdit")} onClick={() => { setKeyEditing(false); setKeyDraft(""); }}><X /></Button> : null}
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-secondary/55 py-1 pl-2.5 pr-1">
                <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={t("creativeConsole.clientKeyStored")}>{maskClientKey(apiKey)}</span>
                <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[11px]" onClick={() => { setKeyDraft(""); setKeyEditing(true); }}>{t("creativeConsole.changeKey")}</Button>
                <Button type="button" size="icon" variant="ghost" className="size-6 shrink-0" aria-label={t("creativeConsole.clearKey")} onClick={clearClientKey}><X /></Button>
              </div>
            )}
            <div ref={setChatToolbarElement} className={cn("items-center gap-1", mode === "chat" ? "flex" : "hidden")} />
          </div>
        </div>

        <div className="shrink-0 space-y-2 px-3">
          {!apiKey ? <InlineError message={t("creativeConsole.errors.noKey")} /> : null}
          {modelsQuery.isError ? <RetryableError message={modelsQuery.error.message} onRetry={() => void modelsQuery.refetch()} /> : null}
        </div>

        <div className="min-h-0 flex-1">
          <div className="h-full" hidden={mode !== "chat"}><ChatPanel key={keyScope} storageScope={keyScope} toolbarElement={chatToolbarElement} {...panelProps("chat")} /></div>
          <div className="h-full" hidden={mode !== "image"}><ImagePanel {...panelProps("image")} /></div>
          <div className="h-full" hidden={mode !== "image_edit"}><ImageEditPanel {...panelProps("image_edit")} /></div>
          <div className="h-full" hidden={mode !== "video"}><VideoPanel {...panelProps("video")} /></div>
        </div>
      </section>
    </div>
  );
}
