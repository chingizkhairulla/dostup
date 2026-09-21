import type { Product } from "@/hooks/useProducts";

export const PREVIEW_ROUTE = "/preview/product";

export type PreviewViewport = "phone" | "desktop";

// A fixed "device" box per viewport (matches a real phone's aspect ratio for
// phone mode) so the frame always scales as a whole rather than being cropped
// to whatever height its container happens to have.
export const PREVIEW_VIEWPORT_WIDTH: Record<PreviewViewport, number> = {
  phone: 390,
  desktop: 1280,
};

export const PREVIEW_VIEWPORT_HEIGHT: Record<PreviewViewport, number> = {
  phone: 844,
  desktop: 800,
};

/**
 * Scale factor that fits a device-sized box inside the available space on
 * both axes at once, so the whole "card" is always visible with no internal
 * scrolling of the frame itself. Never scales up past 1 (no upscaling blur),
 * and degrades to 1 if the container has no measurable size yet (e.g. before
 * first layout, or in a non-layout test environment).
 */
export function fitScale(
  availableWidth: number,
  availableHeight: number,
  deviceWidth: number,
  deviceHeight: number,
): number {
  if (availableWidth <= 0 || availableHeight <= 0) return 1;
  return Math.min(1, availableWidth / deviceWidth, availableHeight / deviceHeight);
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
