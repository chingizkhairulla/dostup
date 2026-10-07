import { useEffect, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
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
  /** White window instead of the dark one — for documents such as payment receipts. */
  light?: boolean;
}

/**
 * Near-fullscreen window for a photo, video or PDF. The page behind is blurred and a strip
 * around the window stays free, so a tap anywhere outside it closes the viewer — as does
 * the single "Done" button in the bottom-right corner.
 */
const MediaViewer = ({ items, index, onIndexChange, actions, light = false }: Props) => {
  const { t } = useLanguage();
  const open = index !== null && !!items[index];
  const item = open ? items[index!] : null;
  const many = items.length > 1;

  const step = (delta: number) => {
    if (index === null || !many) return;
    onIndexChange((index + delta + items.length) % items.length);
  };

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed z-[60] flex flex-col overflow-hidden rounded-2xl shadow-2xl outline-none",
            light ? "bg-white" : "bg-neutral-950",
            // The margins are the tap-to-close area; the bottom one clears the phone's home bar.
            "left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
            "sm:left-8 sm:right-8 sm:top-8 sm:bottom-8 lg:left-16 lg:right-16",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{item?.name || t("mediaViewerTitle")}</DialogPrimitive.Title>

          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {item?.kind === "image" && (
              <img src={item.url} alt={item.name ?? ""} className="max-h-full max-w-full object-contain" />
            )}
            {item?.kind === "video" && (
              <video
                key={item.url}
                src={item.url}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full bg-black"
              />
            )}
            {item?.kind === "pdf" && (
              <iframe src={item.url} title={item.name ?? "PDF"} className="h-full w-full bg-white" />
            )}

            {many && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={t("mediaViewerPrev")}
                  className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={t("mediaViewerNext")}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center justify-end gap-2 border-t px-3 py-3",
              light ? "border-neutral-200 bg-white" : "border-white/10 bg-neutral-950",
            )}
          >
            {many && index !== null && (
              <span className={cn("mr-auto text-xs tabular-nums", light ? "text-neutral-500" : "text-white/60")}>
                {index + 1} / {items.length}
              </span>
            )}
            {actions}
            <DialogPrimitive.Close asChild>
              <Button className="h-10 min-w-24 rounded-full px-5">{t("mediaViewerDone")}</Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default MediaViewer;
