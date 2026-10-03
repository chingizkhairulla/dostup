import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Monitor, Smartphone } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  dataMessage,
  isPreviewMessage,
  PREVIEW_ROUTE,
  PREVIEW_TOP_GAP,
  PREVIEW_VIEWPORT,
  previewFrameMetrics,
  type PreviewFrameMetrics,
  type PreviewViewport,
} from "@/lib/productPreview";
import { cn } from "@/lib/utils";
import { EDITOR_HEADING_CLASS } from "@/components/creator/editorHeading";

type ProductPreviewPaneProps = {
  product: Product | null;
  /** Hides the desktop option where a desktop preview is not useful. */
  phoneOnly?: boolean;
  /** Rendered at the right end of the pane's top bar (the window's close control). */
  headerRight?: ReactNode;
  className?: string;
};

const ProductPreviewPane = ({
  product,
  phoneOnly = false,
  headerRight,
  className,
}: ProductPreviewPaneProps) => {
  const { t } = useLanguage();
  const [viewport, setViewport] = useState<PreviewViewport>("phone");
  const [metrics, setMetrics] = useState<PreviewFrameMetrics>(() =>
    previewFrameMetrics({ width: 0, height: 0 }, "phone"),
  );
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const productRef = useRef(product);
  productRef.current = product;

  const post = useCallback(() => {
    if (!readyRef.current) return;
    frameRef.current?.contentWindow?.postMessage(
      dataMessage(productRef.current),
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isPreviewMessage(event)) return;
      if (event.data.type !== "ready") return;
      if (event.source !== frameRef.current?.contentWindow) return;
      readyRef.current = true;
      post();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  useEffect(() => {
    post();
  }, [product, post]);

  // The frame is sized from the measured stage on both axes, so it fills the
  // pane and the page scrolls inside it like it would on a real device.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      setMetrics(
        previewFrameMetrics({ width: stage.clientWidth, height: stage.clientHeight }, viewport),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [viewport]);

  const options: Array<{ value: PreviewViewport; label: string; Icon: typeof Smartphone }> = [
    { value: "phone", label: t("previewPhone"), Icon: Smartphone },
    { value: "desktop", label: t("previewDesktop"), Icon: Monitor },
  ];

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      {/* Three columns so the viewport switch sits at the pane's true centre,
          whatever the widths of the heading and the close control beside it. */}
      <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border px-4">
        <span className={cn(EDITOR_HEADING_CLASS, "justify-self-start")}>{t("previewTab")}</span>
        <div className="justify-self-center">
          {!phoneOnly && (
            <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
              {options.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setViewport(value)}
                  aria-pressed={viewport === value}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
                    viewport === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-self-end">{headerRight}</div>
      </div>
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: PREVIEW_TOP_GAP,
            width: metrics.displayWidth,
            height: Math.max(metrics.frameHeight * metrics.scale, 0),
          }}
        >
          <iframe
            ref={frameRef}
            src={PREVIEW_ROUTE}
            title={t("previewTab")}
            className="rounded-t-xl border border-border bg-background shadow-lg"
            style={{
              width: PREVIEW_VIEWPORT[viewport].width,
              height: metrics.frameHeight,
              transform: `scale(${metrics.scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductPreviewPane;
