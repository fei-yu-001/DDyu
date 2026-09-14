import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, ExternalLink, ImageUpscale, Images, Loader2, TvMinimal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateImage, type ImageResult } from "@/features/creative-console/creative-console-api";
import { composerClassName, imageAspectRatios, imageResolutions, type CreativePanelProps, CompactModelSelect, CompactSelect, LoadingResult, WelcomeState } from "@/features/creative-console/shared";

export function ImagePanel({ apiKey, model, modelOptions, onModelChange }: CreativePanelProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState("1");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1k");
  const [quality, setQuality] = useState<"low" | "medium">("medium");
  const [images, setImages] = useState<ImageResult[]>([]);
  const supportsQuality = model.toLowerCase().endsWith("grok-imagine-image-2.0");

  const mutation = useMutation({
    mutationFn: (request: Parameters<typeof generateImage>[0]) => generateImage(request),
    onSuccess: setImages,
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!apiKey || !model || !prompt.trim() || mutation.isPending) return;
    mutation.reset();
    mutation.mutate({ apiKey, model, prompt: prompt.trim(), count: Number(count), aspectRatio, resolution, quality: supportsQuality ? quality : undefined });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        <div className="flex min-h-full w-full flex-col justify-center px-3 sm:px-6">
          {images.length === 0 && !mutation.isPending ? <WelcomeState title={t("creativeConsole.welcomeImage")} /> : null}
          {mutation.isPending ? <LoadingResult text={t("creativeConsole.generatingImage")} /> : null}
          {images.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-live="polite">
              {images.map((image, index) => (
                <figure key={`${image.url}-${index}`} className="group min-w-0 overflow-hidden">
                  <img src={image.url} alt={t("creativeConsole.generatedImageAlt", { index: index + 1 })} className="aspect-square w-full rounded-xl bg-muted object-contain" loading="lazy" />
                  <figcaption className="flex min-w-0 items-center justify-between gap-2 py-1.5">
                    <span className="truncate text-xs text-muted-foreground">{t("creativeConsole.imageNumber", { index: index + 1 })}</span>
                    <Button variant="ghost" size="icon" asChild><a href={image.url} target="_blank" rel="noreferrer" aria-label={t("creativeConsole.open")}><ExternalLink /></a></Button>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <form className="w-full shrink-0 px-3 pb-2 sm:px-6 sm:pb-3" onSubmit={submit}>
        <div className={composerClassName}>
          <Textarea id="image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t("creativeConsole.imagePlaceholder")} className="min-h-24 resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0" />
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <CompactModelSelect value={model} models={modelOptions} onChange={onModelChange} />
              <CompactSelect value={count} options={["1", "2", "3", "4"]} onChange={setCount} ariaLabel={t("creativeConsole.count")} suffix="×" icon={<Images />} />
              <CompactSelect value={aspectRatio} options={imageAspectRatios} onChange={setAspectRatio} ariaLabel={t("creativeConsole.aspectRatio")} icon={<TvMinimal />} />
              <CompactSelect value={resolution} options={imageResolutions} onChange={setResolution} ariaLabel={t("creativeConsole.resolution")} icon={<ImageUpscale />} />
              {supportsQuality ? <CompactSelect value={quality} options={["low", "medium"]} onChange={(value) => setQuality(value as "low" | "medium")} ariaLabel={t("creativeConsole.quality")} /> : null}
            </div>
            <Button type="submit" size="icon" aria-label={t("creativeConsole.generateImage")} disabled={!apiKey || !model || !prompt.trim() || mutation.isPending}>{mutation.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}</Button>
          </div>
        </div>
        {mutation.isError ? <div className="mt-1 px-2 text-[11px] text-destructive">{mutation.error.message}</div> : null}
      </form>
    </div>
  );
}
