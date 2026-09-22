import type { Product } from "@/hooks/useProducts";

export const PREVIEW_ROUTE = "/preview/product";

export type PreviewViewport = "phone" | "desktop";

/** Gap between the pane's top bar and the frame, in screen pixels. */
export const PREVIEW_TOP_GAP = 16;

/**
 * Each viewport renders at a **real** device width and is then scaled to the
 * target share of the pane. Rendering at the target width instead would give
 * the page a viewport no device has, and would make the text smaller rather
 * than larger — the opposite of an enlarged preview.
 *
 * `stageFraction` and the caps come from the reference design: the phone card
 * is about half the pane wide, the desktop card nearly all of it, and a desktop
 * page is never magnified past its natural size.
 */
export const PREVIEW_VIEWPORT: Record<
  PreviewViewport,
  {
    width: number;
    fallbackHeight: number;
    stageFraction: number;
    maxScale: number;
    /**
     * Keeps the frame at least life size when the pane can fit it. Only the
     * phone wants this: in its own preview tab the pane is barely wider than a
     * phone, and taking half of it would render the card at half life size.
     * The desktop frame is always a downscale, so a floor would just stretch it.
     */
    atLeastLifeSize: boolean;
  }
> = {
  phone: { width: 390, fallbackHeight: 844, stageFraction: 0.5, maxScale: 1.5, atLeastLifeSize: true },
  desktop: { width: 1280, fallbackHeight: 800, stageFraction: 0.94, maxScale: 1, atLeastLifeSize: false },
};

export type PreviewFrameMetrics = {
  /** CSS transform scale applied to the frame. */
  scale: number;
  /** How wide the frame appears on screen, in pixels. */
  displayWidth: number;
  /** The frame's own height in CSS pixels, before scaling. */
  frameHeight: number;
};

/**
 * Sizes the preview frame for a measured stage. The frame fills the stage's
 * height so the page inside scrolls, exactly like a real device.
 *
 * Every value is an explicit pixel number derived from a measurement: a height
 * inherited from the surrounding layout is what once collapsed the preview into
 * an unreadable strip. When the stage has no measurable size yet, a usable
 * device-sized frame is returned rather than a zero-sized one.
 */
export function previewFrameMetrics(
  stage: { width: number; height: number },
  viewport: PreviewViewport,
): PreviewFrameMetrics {
  const device = PREVIEW_VIEWPORT[viewport];

  if (stage.width <= 0 || stage.height <= 0) {
    return { scale: 1, displayWidth: device.width, frameHeight: device.fallbackHeight };
  }

  let target = stage.width * device.stageFraction;
  if (device.atLeastLifeSize) {
    target = Math.max(target, Math.min(device.width, stage.width));
  }

  const scale = Math.min(target / device.width, device.maxScale);
  const available = Math.max(stage.height - PREVIEW_TOP_GAP, 1);

  return {
    scale,
    displayWidth: scale * device.width,
    frameHeight: available / scale,
  };
}

type PreviewReadyMessage = { source: "dostup-preview"; type: "ready" };
type PreviewDataMessage = {
  source: "dostup-preview";
  type: "data";
  product: Product | null;
};

export type PreviewMessage = PreviewReadyMessage | PreviewDataMessage;

export function isPreviewMessage(event: MessageEvent): event is MessageEvent<PreviewMessage> {
  if (event.origin !== window.location.origin) return false;
  const data = event.data as PreviewMessage | undefined;
  return Boolean(data && typeof data === "object" && data.source === "dostup-preview");
}

export function readyMessage(): PreviewReadyMessage {
  return { source: "dostup-preview", type: "ready" };
}

export function dataMessage(product: Product | null): PreviewDataMessage {
  return { source: "dostup-preview", type: "data", product };
}
