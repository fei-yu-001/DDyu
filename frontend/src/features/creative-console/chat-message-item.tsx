import { useMemo, type KeyboardEvent } from "react";
import { BrainCircuit, CheckCircle2, Globe, Loader2, Pencil, RefreshCw, Square, Trash2, TriangleAlert, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { renderAssistantMarkup } from "@/features/creative-console/assistant-markup";
import type { ChatToolActivity } from "@/features/creative-console/creative-console-api";
import type { ConversationMessage } from "@/features/creative-console/chat-history";
import { XSocialIcon } from "@/features/creative-console/shared";
import { cn } from "@/shared/lib/cn";

export function ChatMessageItem({
  message,
  loading = false,
  busy = false,
  editing = false,
  editDraft = "",
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditKeyDown,
  onRegenerate,
  onStop,
  onDelete,
}: {
  message: ConversationMessage;
  loading?: boolean;
  busy?: boolean;
  editing?: boolean;
  editDraft?: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRegenerate: () => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const canStop = loading && !editing;
  const canRegenerate = !isUser && !editing && (!busy || loading);
  const canEdit = !loading && !busy;
  const canDelete = !loading && !busy && !editing;
  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageContent className={cn(!isUser && "w-full max-w-full")}>
        {!isUser && message.reasoning ? (
          <div className="w-full rounded-xl bg-secondary/45 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground/75"><BrainCircuit className="size-3.5" />{t("creativeConsole.thinkingProcess")}</div>
            <div className="whitespace-pre-wrap break-words leading-5">{message.reasoning}</div>
          </div>
        ) : null}
        {!isUser && message.tools?.length ? (
          <div className="flex w-full flex-col gap-1.5">
            {message.tools.map((tool) => <ToolActivityItem key={tool.id} tool={tool} />)}
          </div>
        ) : null}
        {editing ? (
          <div className={cn("w-full space-y-2", isUser ? "max-w-full" : "")}>
            <Textarea
              value={editDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              onKeyDown={onEditKeyDown}
              className="min-h-24 resize-y bg-background/70 text-sm"
              autoFocus
              aria-label={t("creativeConsole.editMessage")}
            />
            {!isUser ? (
              <p className="text-[11px] leading-4 text-muted-foreground">{t("creativeConsole.localEditNote")}</p>
            ) : null}
            <div className={cn("flex items-center gap-2", isUser && "justify-end")}>
              <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>{t("creativeConsole.cancelEdit")}</Button>
              <Button type="button" size="sm" onClick={onSaveEdit} disabled={!editDraft.trim()}>
                {isUser ? t("creativeConsole.saveAndRegenerate") : t("creativeConsole.saveEdit")}
              </Button>
            </div>
          </div>
        ) : message.content || isUser ? (
          isUser ? (
            <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-sm leading-6">{message.content}</div>
          ) : <AssistantContent content={message.content} />
        ) : null}
        {loading ? <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><Spinner />{t("creativeConsole.streaming")}</div> : null}
        {!editing && (canStop || canRegenerate || canEdit || canDelete) ? (
          <MessageFooter className="gap-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/message:opacity-100 [@media(hover:hover)]:group-focus-within/message:opacity-100">
            {canStop ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full" aria-label={t("creativeConsole.stopGenerating")} onClick={onStop}>
                    <Square className="size-3.5 fill-current" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("creativeConsole.stopGenerating")}</TooltipContent>
              </Tooltip>
            ) : null}
            {canRegenerate ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full" aria-label={t("creativeConsole.regenerate")} onClick={onRegenerate}>
                    <RefreshCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("creativeConsole.regenerate")}</TooltipContent>
              </Tooltip>
            ) : null}
            {canEdit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full" aria-label={t("creativeConsole.editMessage")} onClick={onStartEdit}>
                    <Pencil className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("creativeConsole.editMessage")}</TooltipContent>
              </Tooltip>
            ) : null}
            {canDelete ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full text-destructive hover:text-destructive" aria-label={t("creativeConsole.deleteMessage")} onClick={onDelete}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("creativeConsole.deleteMessage")}</TooltipContent>
              </Tooltip>
            ) : null}
          </MessageFooter>
        ) : null}
      </MessageContent>
    </Message>
  );
}


function AssistantContent({ content }: { content: string }) {
  const renderedHTML = useMemo(() => renderAssistantMarkup(content), [content]);
  if (!renderedHTML) return <div className="w-full whitespace-pre-wrap break-words py-1 text-sm leading-6">{content}</div>;
  return (
    <div
      className="w-full break-words py-1 text-sm leading-6 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-border [&_img]:my-3 [&_img]:max-h-[32rem] [&_img]:max-w-full [&_img]:rounded-xl [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-secondary [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: renderedHTML }}
    />
  );
}


function ToolActivityItem({ tool }: { tool: ChatToolActivity }) {
  const { t } = useTranslation();
  const isWebSearch = tool.name === "web_search" || tool.type === "web_search_call";
  const isXSearch = tool.name === "x_search" || tool.type === "x_search_call";
  const label = isWebSearch
    ? t("creativeConsole.toolNames.webSearch")
    : isXSearch
      ? t("creativeConsole.toolNames.xSearch")
      : tool.name;
  const statusLabel = t(`creativeConsole.toolStatus.${tool.status}`);
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-xl bg-secondary/45 px-3 py-2.5 text-xs">
      <span className="mt-0.5 text-muted-foreground">
        {isWebSearch ? <Globe className="size-3.5" /> : isXSearch ? <XSocialIcon className="size-3.5" /> : <Wrench className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{t("creativeConsole.toolCall")} · {label}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
            {tool.status === "in_progress" ? <Loader2 className="size-3 animate-spin" /> : tool.status === "failed" ? <TriangleAlert className="size-3 text-destructive" /> : <CheckCircle2 className="size-3" />}
            {statusLabel}
          </span>
        </div>
        {tool.detail ? <div className="mt-1 line-clamp-2 break-all leading-5 text-muted-foreground" title={tool.detail}>{tool.detail}</div> : null}
      </div>
    </div>
  );
}

