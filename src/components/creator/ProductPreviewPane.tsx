import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  dataMessage,
  fitScale,
  isPreviewMessage,
  PREVIEW_ROUTE,
  PREVIEW_VIEWPORT_HEIGHT,
  PREVIEW_VIEWPORT_WIDTH,
  type PreviewViewport,
} from "@/lib/productPreview";
import { cn } from "@/lib/utils";

type ProductPreviewPaneProps = {
  product: Product | null;
  /** Hides the desktop option where a desktop preview is not useful. */
  phoneOnly?: boolean;
  className?: string;
};

const ProductPreviewPane = ({ product, phoneOnly = false, className }: ProductPreviewPaneProps) => {
  const { t } = useLanguage();
  const [viewport, setViewport] = useState<PreviewViewport>("phone");
  const [scale, setScale] = useState(1);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const productRef = useRef(product);
  productRef.current = product;

  const width = PREVIEW_VIEWPORT_WIDTH[viewport];
  const height = PREVIEW_VIEWPORT_HEIGHT[viewport];

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

  // Scale the whole device box to fit the pane on both axes, so the full
  // "card" is always visible instead of being cropped to a short strip.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      setScale(fitScale(stage.clientWidth, stage.clientHeight, width, height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [width, height]);

  const options: Array<{ value: PreviewViewport; label: string; Icon: typeof Smartphone }> = [
    { value: "phone", label: t("previewPhone"), Icon: Smartphone },
    { value: "desktop", label: t("previewDesktop"), Icon: Monitor },
  ];

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {!phoneOnly && (
        <div className="flex shrink-0 justify-center">
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
        </div>
      )}
      <div
        ref={stageRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted/30 p-3"
      >
        <div
          style={{
            width: width * scale,
            height: height * scale,
          }}
        >
          <iframe
            ref={frameRef}
            src={PREVIEW_ROUTE}
            title={t("previewTab")}
            className="rounded-lg border border-border bg-background shadow-lg"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductPreviewPane;
