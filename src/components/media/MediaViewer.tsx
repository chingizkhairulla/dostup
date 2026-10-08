import { useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { loadWholeVideo, takeLoadedVideo } from "@/lib/videoPreload";
import { cn } from "@/lib/utils";

export interface ViewerItem {
  kind: "image" | "video" | "pdf";
  url: string;
  name?: string;
}

interface Props {
  items: ViewerItem[];
  /** Open item; null keeps the viewer closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Buttons placed before "Done" (e.g. a download button for receipts). */
  actions?: ReactNode;
  /** White window instead of the dark one. */
  light?: boolean;
}

/** Width of a dot plus the gap after it, for the sliding orange one. */
const DOT_STEP_PX = 12;

/**
 * Fullscreen window for a photo, video or PDF. The bar under the picture holds the arrows on
 * the left, a dot per item in the middle (the orange one is on screen) and "Done" on the right.
 * A tap on the empty space around the picture closes it too.
 */
const MediaViewer = ({ items, index, onIndexChange, actions, light = false }: Props) => {
  const { t } = useLanguage();
  const open = index !== null && !!items[index];
  const item = open ? items[index!] : null;
  const many = items.length > 1;

  const go = (next: number) => {
    if (index === null || next < 0 || next >= items.length || next === index) return;
    onIndexChange(next);
  };

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index! + 1);
      if (e.key === "ArrowLeft") go(index! - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const arrowClass = cn(
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all disabled:pointer-events-none disabled:opacity-20",
    light
      ? "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      : "text-white/70 hover:bg-white/10 hover:text-white",
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-0 z-[60] flex flex-col overflow-hidden outline-none",
            light ? "bg-white" : "bg-neutral-950",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{item?.name || t("mediaViewerTitle")}</DialogPrimitive.Title>

          {/* A tap on the empty space around the picture closes the viewer. */}
          <div
            className={cn(
              "relative flex min-h-0 flex-1 items-center justify-center pt-[env(safe-area-inset-top)]",
              light ? "bg-white" : "bg-neutral-950",
            )}
            onClick={(e) => e.target === e.currentTarget && onIndexChange(null)}
          >
            {item?.kind === "image" && (
              <img src={item.url} alt={item.name ?? ""} className="max-h-full max-w-full object-contain" />
            )}
            {item?.kind === "video" && <WholeVideo key={item.url} url={item.url} light={light} />}
            {item?.kind === "pdf" && (
              <iframe src={item.url} title={item.name ?? "PDF"} className="h-full w-full bg-white" />
            )}
          </div>

          <div
            className={cn(
              "relative flex shrink-0 items-center gap-2 border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              light ? "border-neutral-200 bg-white" : "border-white/10 bg-neutral-950",
            )}
          >
            {many && index !== null && (
              <>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => go(index - 1)}
                    disabled={index === 0}
                    aria-label={t("mediaViewerPrev")}
                    title={t("mediaViewerPrev")}
                    className={arrowClass}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(index + 1)}
                    disabled={index === items.length - 1}
                    aria-label={t("mediaViewerNext")}
                    title={t("mediaViewerNext")}
                    className={arrowClass}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                {/* Dots in the middle of the bar, as under the FAQ cards; the orange one slides to the open item. */}
                <div className="pointer-events-none absolute inset-x-0 top-3 flex h-10 items-center justify-center">
                  <div className="pointer-events-auto relative flex items-center gap-1.5">
                    {items.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => go(i)}
                        aria-label={t("mediaViewerItem", { index: i + 1, count: items.length })}
                        aria-current={i === index}
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                          light
                            ? "bg-neutral-300 hover:bg-neutral-400"
                            : "bg-white/30 hover:bg-white/50",
                        )}
                      />
                    ))}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary transition-[left] duration-200 ease-out"
                      style={{ left: index * DOT_STEP_PX }}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              {actions}
              <DialogPrimitive.Close asChild>
                <Button className="h-10 min-w-24 rounded-full px-5">{t("mediaViewerDone")}</Button>
              </DialogPrimitive.Close>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/**
 * A video plays only once all of it is on the device, so it never stops halfway to buffer.
 * While it downloads, its first frame shows with the percentage over it. When the file cannot
 * be fetched whole (storage without CORS, or a huge file) the browser streams it instead and
 * playback waits until the browser expects to reach the end without pausing.
 */
const WholeVideo = ({ url, light }: { url: string; light: boolean }) => {
  const { t } = useLanguage();
  const [local, setLocal] = useState(() => takeLoadedVideo(url));
  const [progress, setProgress] = useState<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const autoStarted = useRef(false);
  const videoClass = cn("max-h-full max-w-full", !light && "bg-black");

  useEffect(() => {
    if (local) return;
    const controller = new AbortController();
    loadWholeVideo(url, (f) => setProgress(f === null ? null : Math.round(f * 100)), controller.signal)
      .then(setLocal)
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.warn("Video could not be loaded whole, streaming it", e);
        setProgress(null);
        setStreaming(true);
      });
    return () => controller.abort();
  }, [url, local]);

  if (local) {
    return <video src={local} controls autoPlay playsInline className={videoClass} />;
  }

  if (streaming) {
    const showBuffered = (video: HTMLVideoElement) => {
      if (!video.duration || !video.buffered.length) return;
      setProgress(Math.min(100, Math.round((video.buffered.end(video.buffered.length - 1) / video.duration) * 100)));
    };
    return (
      <>
        <video
          src={url}
          controls
          preload="auto"
          playsInline
          onProgress={(e) => showBuffered(e.currentTarget)}
          onCanPlayThrough={(e) => {
            if (autoStarted.current) return;
            autoStarted.current = true;
            // Blocked autoplay just leaves the play button for a tap.
            void e.currentTarget.play().catch(() => undefined);
          }}
          onPlaying={() => setStreamStarted(true)}
          className={videoClass}
        />
        {!streamStarted && <LoadingRing progress={progress} label={t("mediaViewerVideoLoading")} />}
      </>
    );
  }

  return (
    <>
      {/* The first frame, until the whole file is here. */}
      <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className={videoClass} />
      <LoadingRing progress={progress} label={t("mediaViewerVideoLoading")} />
    </>
  );
};

/** Download progress over the middle of the picture; clicks pass through it. */
const LoadingRing = ({ progress, label }: { progress: number | null; label: string }) => {
  const circumference = 2 * Math.PI * 20;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status" aria-label={label}>
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white">
        {progress === null ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <>
            <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress / 100)}
                className="stroke-primary transition-[stroke-dashoffset] duration-200"
              />
            </svg>
            <span className="text-xs font-semibold tabular-nums">{progress}%</span>
          </>
        )}
      </div>
    </div>
  );
};

export default MediaViewer;
