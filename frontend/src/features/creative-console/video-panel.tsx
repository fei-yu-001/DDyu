import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, AudioLines, Clock3, ExternalLink, ImagePlus, Images, ImageUpscale, Loader2, TvMinimal, Upload, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createVideo, editVideo, extendVideo, getVideo, importClientInput, uploadClientInput, type ClientModel, type VideoStatus } from "@/features/creative-console/creative-console-api";
import { composerClassName, videoAspectRatios, videoResolutions, type CreativePanelProps, CompactModelSelect, CompactSelect, InlineError, LoadingResult, MetaItem, RetryableError, WelcomeState, validDuration } from "@/features/creative-console/shared";
import { cn } from "@/shared/lib/cn";

type VideoAction = "generate" | "edit" | "extend";
const videoDurations = ["6", "10", "15"] as const;
const videoExtendDurations = ["2", "4", "6", "8", "10"] as const;
// Web 渠道不支持参考音（web/video.go:253-255），且 Console 语音链路已随裁剪下线，
// 因此不再请求已删除的 /v1/tts/voices（会 404 并拖住页面加载），仅保留内置音色占位。
const builtinReferenceVoices: Array<{ voiceId: string; name: string }> = [
  { voiceId: "eve", name: "Eve" },
  { voiceId: "ara", name: "Ara" },
];

export function VideoPanel({ apiKey, model, modelOptions, onModelChange }: CreativePanelProps) {
  const { t } = useTranslation();
  const [action, setAction] = useState<VideoAction>("generate");
  const [prompt, setPrompt] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [imageFileID, setImageFileID] = useState("");
  const [referenceURL, setReferenceURL] = useState("");
  const [referenceFileID, setReferenceFileID] = useState("");
  const [referenceVoiceId, setReferenceVoiceId] = useState("");
  const [sourceVideoURL, setSourceVideoURL] = useState("");
  const [sourceVideoFileID, setSourceVideoFileID] = useState("");
  const [duration, setDuration] = useState("6");
  const [extendDuration, setExtendDuration] = useState("6");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [job, setJob] = useState<{ requestId: string; apiKey: string } | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageSelectionVersionRef = useRef(0);
  const referenceSelectionVersionRef = useRef(0);
  const videoSelectionVersionRef = useRef(0);

  const generateModels = useMemo(() => modelOptions.filter((item) => item.capability === "video"), [modelOptions]);
  // 视频编辑/延长需要 Console 路由（grok-imagine-video），该渠道已随裁剪剥离，且当前
  // 号池只有 Web 渠道（Web 仅支持文本生视频）。因此不提供候选模型，按钮保持禁用，
  // 真被调用时后端也会返回明确的中文错误。
  const editModels = useMemo<ClientModel[]>(() => [], []);
  const activeModels = action === "generate" ? generateModels : editModels;
  const activeModel = activeModels.some((item) => item.id === model)
    ? model
    : activeModels[0]?.id ?? "";

  useEffect(() => {
    if (activeModel && activeModel !== model) onModelChange(activeModel);
  }, [activeModel, model, onModelChange]);

  const hasFirstFrame = Boolean(imageURL.trim() || imageFileID);
  const hasReferenceImage = Boolean(referenceURL.trim() || referenceFileID);
  const hasReferenceAudio = Boolean(referenceVoiceId.trim());
  const isReferenceMode = hasReferenceImage || hasReferenceAudio;
  const generateResolutions = isReferenceMode ? videoResolutions.filter((item) => item !== "1080p") : videoResolutions;
  const selectedVideoResolution = isReferenceMode && resolution === "1080p" ? "720p" : resolution;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!apiKey || !activeModel) throw new Error(t("creativeConsole.errors.noModels"));
      if (action === "generate") {
        let nextImageURL = imageURL.trim() || undefined;
        let nextImageFileID = imageFileID || undefined;
        let nextReferenceURL = referenceURL.trim() || undefined;
        let nextReferenceFileID = referenceFileID || undefined;
        let nextReferenceVoice = referenceVoiceId.trim() || undefined;
        if (nextImageFileID || nextImageURL) {
          nextReferenceURL = undefined;
          nextReferenceFileID = undefined;
          nextReferenceVoice = undefined;
        }
        if (!nextImageFileID && nextImageURL && /^https?:\/\//i.test(nextImageURL)) {
          const staged = await importClientInput(apiKey, nextImageURL);
          nextImageURL = undefined;
          nextImageFileID = staged.fileId;
        }
        if (!nextReferenceFileID && nextReferenceURL && /^https?:\/\//i.test(nextReferenceURL)) {
          const staged = await importClientInput(apiKey, nextReferenceURL);
          nextReferenceURL = undefined;
          nextReferenceFileID = staged.fileId;
        }
        return createVideo({
          apiKey,
          model: activeModel,
          prompt: prompt.trim(),
          imageURL: nextImageURL,
          imageFileID: nextImageFileID,
          referenceImages: nextReferenceFileID
            ? [{ fileId: nextReferenceFileID }]
            : nextReferenceURL
              ? [{ url: nextReferenceURL }]
              : undefined,
          referenceVoiceIds: nextReferenceVoice ? [nextReferenceVoice] : undefined,
          duration: Number(duration),
          aspectRatio,
          resolution: selectedVideoResolution,
        });
      }
      const videoURL = sourceVideoURL.trim() || undefined;
      const videoFileID = sourceVideoFileID || undefined;
      if (!videoURL && !videoFileID) throw new Error(t("creativeConsole.errors.noSourceVideo"));
      if (action === "edit") {
        return editVideo({ apiKey, model: activeModel, prompt: prompt.trim(), videoURL, videoFileID });
      }
      return extendVideo({
        apiKey,
        model: activeModel,
        prompt: prompt.trim(),
        videoURL,
        videoFileID,
        duration: Number(extendDuration),
      });
    },
    onSuccess: (requestId) => setJob({ requestId, apiKey }),
  });

  // 本地媒体进入有 TTL 的隐藏临时区；视频任务只持久化短 file_id，不写入图库或公开 URL。
  const uploadMutation = useMutation({
    mutationFn: async ({ file, kind, selectionVersion }: { file: File; kind: "image" | "reference"; selectionVersion: number }) => {
      if (file.type && !file.type.startsWith("image/")) throw new Error(t("creativeConsole.errors.invalidImage"));
      const input = await uploadClientInput(apiKey, file);
      if (input.kind !== "image") throw new Error(t("creativeConsole.errors.invalidImage"));
      return { ...input, kind, selectionVersion };
    },
    onSuccess: (input) => {
      if (input.kind === "image") {
        if (input.selectionVersion !== imageSelectionVersionRef.current) return;
        setImageFileID(input.fileId);
        setImageURL("");
        setReferenceURL("");
        setReferenceFileID("");
        setReferenceVoiceId("");
        return;
      }
      if (input.selectionVersion !== referenceSelectionVersionRef.current) return;
      setReferenceFileID(input.fileId);
      setReferenceURL("");
      setImageURL("");
      setImageFileID("");
    },
  });

  const videoUploadMutation = useMutation({
    mutationFn: async ({ file }: { file: File; selectionVersion: number }) => {
      if (file.type && !file.type.startsWith("video/")) throw new Error(t("creativeConsole.errors.invalidVideo"));
      const input = await uploadClientInput(apiKey, file);
      if (input.kind !== "video") throw new Error(t("creativeConsole.errors.invalidVideo"));
      return input;
    },
    onSuccess: (input, request) => {
      if (request.selectionVersion !== videoSelectionVersionRef.current) return;
      setSourceVideoFileID(input.fileId);
      setSourceVideoURL("");
    },
  });

  const statusQuery = useQuery({
    queryKey: ["creative-console", "video", job?.requestId],
    queryFn: ({ signal }) => getVideo({ apiKey: job!.apiKey, requestId: job!.requestId, signal }),
    enabled: Boolean(job),
    refetchInterval: (query) => query.state.data?.status === "pending" ? 3_000 : false,
    retry: 2,
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!apiKey || !activeModel || createMutation.isPending || uploadMutation.isPending || videoUploadMutation.isPending) return;
    if (action === "generate") {
      if ((!prompt.trim() && !hasFirstFrame && !isReferenceMode) || !validDuration(duration)) return;
      if (isReferenceMode && !prompt.trim()) return;
    } else {
      if (!prompt.trim() || (!sourceVideoURL.trim() && !sourceVideoFileID)) return;
      if (action === "extend") {
        const value = Number(extendDuration);
        if (!Number.isFinite(value) || value < 2 || value > 10) return;
      }
    }
    setJob(null);
    createMutation.reset();
    createMutation.mutate();
  }

  const placeholder = action === "generate"
    ? t("creativeConsole.videoPlaceholder")
    : action === "edit"
      ? t("creativeConsole.videoEditPlaceholder")
      : t("creativeConsole.videoExtendPlaceholder");
  const welcome = action === "generate"
    ? t("creativeConsole.welcomeVideo")
    : action === "edit"
      ? t("creativeConsole.welcomeVideoEdit")
      : t("creativeConsole.welcomeVideoExtend");
  const submitLabel = action === "generate"
    ? t("creativeConsole.generateVideo")
    : action === "edit"
      ? t("creativeConsole.editVideo")
      : t("creativeConsole.extendVideo");
  const canSubmit = Boolean(apiKey && activeModel && !createMutation.isPending && !uploadMutation.isPending && !videoUploadMutation.isPending
    && (action === "generate"
      ? ((prompt.trim() || hasFirstFrame || isReferenceMode) && (!isReferenceMode || prompt.trim()) && validDuration(duration) && !(hasFirstFrame && isReferenceMode))
      : prompt.trim() && (sourceVideoURL.trim() || sourceVideoFileID) && (action !== "extend" || (Number(extendDuration) >= 2 && Number(extendDuration) <= 10))));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        <div className="flex min-h-full w-full flex-col justify-center px-3 sm:px-6">
          {!job && !createMutation.isPending ? <WelcomeState title={welcome} /> : null}
          {createMutation.isPending ? <LoadingResult text={t("creativeConsole.submittingVideo")} /> : null}
          {job ? (
            <VideoResult
              requestId={job.requestId}
              status={statusQuery.data}
              loading={statusQuery.isPending || statusQuery.isFetching}
              error={statusQuery.isError ? statusQuery.error.message : ""}
              onRetry={() => void statusQuery.refetch()}
            />
          ) : null}
        </div>
      </div>

      <form className="w-full shrink-0 px-3 pb-2 sm:px-6 sm:pb-3" onSubmit={submit}>
        <div className={composerClassName}>
          <div className="flex flex-wrap items-center gap-1 px-3 pt-3">
            {([
              ["generate", t("creativeConsole.videoActions.generate")],
              ["edit", t("creativeConsole.videoActions.edit")],
              ["extend", t("creativeConsole.videoActions.extend")],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-7 rounded-full px-3 text-xs font-normal", action === value && "bg-secondary/70 text-foreground")}
                onClick={() => {
                  setAction(value);
                  setJob(null);
                  createMutation.reset();
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <Textarea id="video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={placeholder} className="min-h-24 resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0" />
          <div className="flex items-center justify-between gap-3 px-3 pb-3">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              <CompactModelSelect value={activeModel} models={activeModels} onChange={onModelChange} />
              {action === "generate" ? (
                <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className={cn("h-8 gap-1.5 px-2 font-normal", hasFirstFrame && "bg-secondary/70 text-foreground")} aria-label={t("creativeConsole.firstFrameImage")} disabled={isReferenceMode}>
                      <ImagePlus />{hasFirstFrame ? t("creativeConsole.firstFrameImageAdded") : t("creativeConsole.firstFrameImageShort")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-3">
                    <div className="mb-2 text-xs font-medium">{t("creativeConsole.firstFrameImage")}</div>
                    <div className="flex items-center gap-2">
                      <Input id="video-image" type="url" value={imageURL} onChange={(event) => { imageSelectionVersionRef.current += 1; referenceSelectionVersionRef.current += 1; setImageURL(event.target.value); setImageFileID(""); setReferenceURL(""); setReferenceFileID(""); setReferenceVoiceId(""); }} placeholder={imageFileID ? t("creativeConsole.firstFrameImageAdded") : "https://..."} aria-label={t("creativeConsole.firstFrameImage")} />
                      {hasFirstFrame ? <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t("creativeConsole.clearFirstFrameImage")} onClick={() => { imageSelectionVersionRef.current += 1; setImageURL(""); setImageFileID(""); }}><X /></Button> : null}
                    </div>
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          const selectionVersion = imageSelectionVersionRef.current + 1;
                          imageSelectionVersionRef.current = selectionVersion;
                          referenceSelectionVersionRef.current += 1;
                          setImageURL("");
                          setImageFileID("");
                          setReferenceURL("");
                          setReferenceFileID("");
                          setReferenceVoiceId("");
                          uploadMutation.reset();
                          uploadMutation.mutate({ file, kind: "image", selectionVersion });
                        }
                        event.target.value = "";
                      }}
                    />
                    <Button type="button" variant="secondary" size="sm" className="mt-2 w-full" disabled={uploadMutation.isPending} onClick={() => imageFileInputRef.current?.click()}>
                      {uploadMutation.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                      {t("creativeConsole.uploadImage")}
                    </Button>
                    {uploadMutation.isError ? <p className="mt-1 text-[11px] text-destructive">{uploadMutation.error.message}</p> : null}
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className={cn("h-8 gap-1.5 px-2 font-normal", hasReferenceImage && "bg-secondary/70 text-foreground")} aria-label={t("creativeConsole.referenceImage")} disabled={hasFirstFrame}>
                      <Images />{hasReferenceImage ? t("creativeConsole.referenceImageAdded") : t("creativeConsole.referenceImageShort")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-3">
                    <div className="mb-2 text-xs font-medium">{t("creativeConsole.referenceImage")}</div>
                    <div className="flex items-center gap-2">
                      <Input id="video-reference" type="url" value={referenceURL} onChange={(event) => { referenceSelectionVersionRef.current += 1; imageSelectionVersionRef.current += 1; setReferenceURL(event.target.value); setReferenceFileID(""); setImageURL(""); setImageFileID(""); }} placeholder={referenceFileID ? t("creativeConsole.referenceImageAdded") : "https://..."} aria-label={t("creativeConsole.referenceImage")} />
                      {hasReferenceImage ? <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t("creativeConsole.clearReferenceImage")} onClick={() => { referenceSelectionVersionRef.current += 1; setReferenceURL(""); setReferenceFileID(""); }}><X /></Button> : null}
                    </div>
                    <input
                      ref={referenceFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          const selectionVersion = referenceSelectionVersionRef.current + 1;
                          referenceSelectionVersionRef.current = selectionVersion;
                          imageSelectionVersionRef.current += 1;
                          setReferenceURL("");
                          setReferenceFileID("");
                          setImageURL("");
                          setImageFileID("");
                          uploadMutation.reset();
                          uploadMutation.mutate({ file, kind: "reference", selectionVersion });
                        }
                        event.target.value = "";
                      }}
                    />
                    <Button type="button" variant="secondary" size="sm" className="mt-2 w-full" disabled={uploadMutation.isPending} onClick={() => referenceFileInputRef.current?.click()}>
                      {uploadMutation.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                      {t("creativeConsole.uploadImage")}
                    </Button>
                    {uploadMutation.isError ? <p className="mt-1 text-[11px] text-destructive">{uploadMutation.error.message}</p> : null}
                  </PopoverContent>
                </Popover>
                <Select value={referenceVoiceId || "__none__"} onValueChange={(value) => { setReferenceVoiceId(value === "__none__" ? "" : value); if (value !== "__none__") { imageSelectionVersionRef.current += 1; setImageURL(""); setImageFileID(""); } }} disabled={hasFirstFrame}>
                  <SelectTrigger className={cn("h-8 w-auto gap-1.5 border-0 bg-transparent px-2 shadow-none", hasReferenceAudio && "bg-secondary/70")} aria-label={t("creativeConsole.referenceVoice")}>
                    <AudioLines className="size-3.5" />
                    <SelectValue placeholder={t("creativeConsole.referenceVoiceShort")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("creativeConsole.referenceVoiceNone")}</SelectItem>
                    {builtinReferenceVoices.map((voice) => (
                      <SelectItem key={voice.voiceId} value={voice.voiceId}>{voice.name || voice.voiceId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className={cn("h-8 gap-1.5 px-2 font-normal", (sourceVideoURL || sourceVideoFileID) && "bg-secondary/70 text-foreground")} aria-label={t("creativeConsole.sourceVideo")}>
                      <Video />{sourceVideoURL || sourceVideoFileID ? t("creativeConsole.sourceVideoAdded") : t("creativeConsole.sourceVideoShort")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-3">
                    <div className="mb-2 text-xs font-medium">{t("creativeConsole.sourceVideo")}</div>
                    <div className="flex items-center gap-2">
                      <Input id="video-source" type="url" value={sourceVideoURL} onChange={(event) => { videoSelectionVersionRef.current += 1; setSourceVideoURL(event.target.value); setSourceVideoFileID(""); }} placeholder={sourceVideoFileID ? t("creativeConsole.sourceVideoAdded") : "https://..."} aria-label={t("creativeConsole.sourceVideo")} />
                      {sourceVideoURL || sourceVideoFileID ? <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t("creativeConsole.clearSourceVideo")} onClick={() => { videoSelectionVersionRef.current += 1; setSourceVideoURL(""); setSourceVideoFileID(""); }}><X /></Button> : null}
                    </div>
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          const selectionVersion = videoSelectionVersionRef.current + 1;
                          videoSelectionVersionRef.current = selectionVersion;
                          setSourceVideoURL("");
                          setSourceVideoFileID("");
                          videoUploadMutation.reset();
                          videoUploadMutation.mutate({ file, selectionVersion });
                        }
                        event.target.value = "";
                      }}
                    />
                    <Button type="button" variant="secondary" size="sm" className="mt-2 w-full" disabled={videoUploadMutation.isPending} onClick={() => videoFileInputRef.current?.click()}>
                      {videoUploadMutation.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                      {t("creativeConsole.uploadVideo")}
                    </Button>
                    {videoUploadMutation.isError ? <p className="mt-1 text-[11px] text-destructive">{videoUploadMutation.error.message}</p> : null}
                  </PopoverContent>
                </Popover>
              )}
              {action === "generate" ? (
                <>
                  <CompactSelect value={duration} options={videoDurations} onChange={setDuration} ariaLabel={t("creativeConsole.duration")} suffix="s" icon={<Clock3 />} />
                  <CompactSelect value={aspectRatio} options={videoAspectRatios} onChange={setAspectRatio} ariaLabel={t("creativeConsole.aspectRatio")} icon={<TvMinimal />} />
                  <CompactSelect value={selectedVideoResolution} options={generateResolutions} onChange={setResolution} ariaLabel={t("creativeConsole.resolution")} icon={<ImageUpscale />} />
                </>
              ) : null}
              {action === "extend" ? (
                <CompactSelect value={extendDuration} options={videoExtendDurations} onChange={setExtendDuration} ariaLabel={t("creativeConsole.extendDuration")} suffix="s" icon={<Clock3 />} />
              ) : null}
            </div>
            <Button type="submit" size="icon" aria-label={submitLabel} disabled={!canSubmit}>
              {createMutation.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
        </div>
        {createMutation.isError ? <div className="mt-1 px-2 text-[11px] text-destructive">{createMutation.error.message}</div> : null}
      </form>
    </div>
  );
}

function VideoResult({ requestId, status, loading, error, onRetry }: { requestId: string; status?: VideoStatus; loading: boolean; error: string; onRetry: () => void }) {
  const { t } = useTranslation();
  const progress = status?.progress ?? 0;
  return (
    <div className="w-full space-y-4" aria-live="polite">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetaItem label={t("creativeConsole.requestId")} value={requestId} mono />
        <MetaItem label={t("creativeConsole.status")} value={status ? t(`creativeConsole.videoStatus.${status.status}`) : t("common.loading")} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{t("creativeConsole.progress")}</span><span className="tabular-nums">{progress}%</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
      </div>
      {loading && status?.status !== "done" && status?.status !== "failed" ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner />{t("creativeConsole.pollingVideo")}</div> : null}
      {error ? <RetryableError message={error} onRetry={onRetry} /> : null}
      {status?.status === "failed" ? <InlineError message={status.error?.message || t("creativeConsole.errors.videoFailed")} /> : null}
      {status?.status === "done" && status.video ? (
        <div className="space-y-3">
          <video src={status.video.url} controls preload="metadata" className="max-h-[60vh] w-full rounded-2xl bg-black shadow-sm" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{status.video.duration ? t("creativeConsole.videoDuration", { count: status.video.duration }) : ""}</span>
            <Button variant="secondary" size="sm" asChild><a href={status.video.url} target="_blank" rel="noreferrer"><ExternalLink />{t("creativeConsole.openVideo")}</a></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
