import { describe, expect, it } from "vitest";
import {
  dataMessage,
  isPreviewMessage,
  PREVIEW_ROUTE,
  PREVIEW_TOP_GAP,
  PREVIEW_VIEWPORT,
  previewFrameMetrics,
  readyMessage,
} from "@/lib/productPreview";

function messageEvent(data: unknown, origin = window.location.origin) {
  return { data, origin } as MessageEvent;
}

describe("preview message contract", () => {
  it("accepts its own messages from the same origin", () => {
    expect(isPreviewMessage(messageEvent(readyMessage()))).toBe(true);
    expect(isPreviewMessage(messageEvent(dataMessage(null)))).toBe(true);
  });

  it("rejects messages from another origin", () => {
    expect(isPreviewMessage(messageEvent(readyMessage(), "https://evil.example"))).toBe(false);
  });

  it("ignores unrelated messages on the same origin", () => {
    expect(isPreviewMessage(messageEvent({ type: "ready" }))).toBe(false);
    expect(isPreviewMessage(messageEvent({ source: "other-app", type: "data" }))).toBe(false);
    expect(isPreviewMessage(messageEvent("hello"))).toBe(false);
    expect(isPreviewMessage(messageEvent(null))).toBe(false);
  });
});

describe("preview viewports", () => {
  it("renders the phone at a real phone viewport, not an invented width", () => {
    expect(PREVIEW_VIEWPORT.phone.width).toBe(390);
  });

  it("renders the desktop at a real desktop viewport", () => {
    expect(PREVIEW_VIEWPORT.desktop.width).toBe(1280);
  });

  // The preview route deliberately sits outside /p/ so it bypasses the
  // middleware matcher and never collides with public product urls.
  it("does not live under the public product path", () => {
    expect(PREVIEW_ROUTE.startsWith("/p/")).toBe(false);
    expect(PREVIEW_ROUTE).toBe("/preview/product");
  });
});

// Measured against the reference photos: the phone card is about half the pane
// wide, the desktop card nearly the full pane, and both reach its bottom edge
// with the page scrolling inside.
describe("previewFrameMetrics", () => {
  const stage = { width: 967, height: 780 };

  it("shows the phone at about half the pane width", () => {
    const m = previewFrameMetrics(stage, "phone");
    expect(m.displayWidth).toBeGreaterThan(stage.width * 0.45);
    expect(m.displayWidth).toBeLessThan(stage.width * 0.55);
  });

  it("enlarges the phone rather than shrinking it", () => {
    const m = previewFrameMetrics(stage, "phone");
    expect(m.scale).toBeGreaterThan(1);
    expect(m.displayWidth).toBeGreaterThan(PREVIEW_VIEWPORT.phone.width);
  });

  it("shows the desktop at nearly the full pane width", () => {
    const m = previewFrameMetrics(stage, "desktop");
    expect(m.displayWidth).toBeGreaterThan(stage.width * 0.9);
    expect(m.displayWidth).toBeLessThanOrEqual(stage.width);
  });

  it("keeps the frame and its scale in agreement", () => {
    for (const viewport of ["phone", "desktop"] as const) {
      const m = previewFrameMetrics(stage, viewport);
      expect(m.displayWidth).toBeCloseTo(m.scale * PREVIEW_VIEWPORT[viewport].width, 5);
    }
  });

  // The frame must reach the bottom of the stage: its own height is the
  // remaining space divided by the scale, so scaling lands it exactly there.
  it("derives a frame height that fills the stage once scaled", () => {
    for (const viewport of ["phone", "desktop"] as const) {
      const m = previewFrameMetrics(stage, viewport);
      expect(m.frameHeight * m.scale).toBeCloseTo(stage.height - PREVIEW_TOP_GAP, 5);
    }
  });

  it("gives the phone a frame taller than a phone screen, so the page can scroll", () => {
    const m = previewFrameMetrics(stage, "phone");
    expect(m.frameHeight).toBeGreaterThan(400);
  });

  it("never magnifies the phone past the cap on a very wide pane", () => {
    const m = previewFrameMetrics({ width: 4000, height: 900 }, "phone");
    expect(m.scale).toBe(PREVIEW_VIEWPORT.phone.maxScale);
    expect(m.displayWidth).toBeLessThanOrEqual(4000);
  });

  it("never magnifies the desktop at all", () => {
    const m = previewFrameMetrics({ width: 4000, height: 900 }, "desktop");
    expect(m.scale).toBeLessThanOrEqual(1);
  });

  it("shrinks to fit a narrow pane instead of overflowing it", () => {
    for (const viewport of ["phone", "desktop"] as const) {
      const m = previewFrameMetrics({ width: 320, height: 500 }, viewport);
      expect(m.displayWidth).toBeLessThanOrEqual(320);
    }
  });

  // Round-1 lesson: a height that depends on the surrounding layout collapsed to
  // a scrollable sliver. Before the stage can be measured there must still be a
  // usable frame, never a zero or negative one.
  it("falls back to a usable frame when the stage cannot be measured yet", () => {
    for (const stageSize of [
      { width: 0, height: 0 },
      { width: 0, height: 500 },
      { width: 500, height: 0 },
      { width: -10, height: 500 },
    ]) {
      const m = previewFrameMetrics(stageSize, "phone");
      expect(m.scale).toBe(1);
      expect(m.displayWidth).toBe(PREVIEW_VIEWPORT.phone.width);
      expect(m.frameHeight).toBeGreaterThan(0);
    }
  });
});

// Found by screenshotting the phone layout: "half the pane" is only right for a
// wide pane. In the phone's own preview tab the pane is barely wider than a
// phone, and half of it rendered the card at 46 % — half life size and unreadable.
describe("previewFrameMetrics on a narrow pane", () => {
  const narrow = { width: 358, height: 600 };

  it("fills the pane with the phone instead of shrinking it to half", () => {
    const m = previewFrameMetrics(narrow, "phone");

    expect(m.displayWidth).toBeGreaterThan(narrow.width * 0.9);
    expect(m.displayWidth).toBeLessThanOrEqual(narrow.width);
  });

  it("still never shows the phone below life size when the pane has room", () => {
    const m = previewFrameMetrics({ width: 520, height: 600 }, "phone");

    expect(m.displayWidth).toBeGreaterThanOrEqual(PREVIEW_VIEWPORT.phone.width);
  });

  it("keeps the desktop preview at its share of the pane, not stretched to fill", () => {
    const m = previewFrameMetrics({ width: 966, height: 600 }, "desktop");

    expect(m.displayWidth).toBeLessThan(966);
    expect(m.displayWidth).toBeGreaterThan(966 * 0.9);
  });
});
