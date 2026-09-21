import { describe, expect, it } from "vitest";
import {
  dataMessage,
  fitScale,
  isPreviewMessage,
  PREVIEW_ROUTE,
  PREVIEW_VIEWPORT_HEIGHT,
  PREVIEW_VIEWPORT_WIDTH,
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
  it("uses a real phone width and a real desktop width", () => {
    expect(PREVIEW_VIEWPORT_WIDTH.phone).toBe(390);
    expect(PREVIEW_VIEWPORT_WIDTH.desktop).toBe(1280);
  });

  // The preview route deliberately sits outside /p/ so it bypasses the
  // middleware matcher and never collides with public product urls.
  it("does not live under the public product path", () => {
    expect(PREVIEW_ROUTE.startsWith("/p/")).toBe(false);
    expect(PREVIEW_ROUTE).toBe("/preview/product");
  });

  it("gives the phone viewport a real phone aspect ratio, not an arbitrary box", () => {
    const ratio = PREVIEW_VIEWPORT_WIDTH.phone / PREVIEW_VIEWPORT_HEIGHT.phone;
    // Roughly a modern phone (iPhone 14 is 390x844); this is a sanity bound,
    // not a pin to an exact device, so it survives minor future tuning.
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.55);
  });
});

// Regression coverage for the "only a rectangular strip is visible" bug: the
// old code scaled the frame by width alone and stretched height to 100% of
// whatever the ambient flex layout happened to provide, which could collapse
// to near zero. fitScale fits both axes at once so the whole device box is
// always shown.
describe("fitScale", () => {
  it("fits a portrait phone into a much wider, shorter pane by the height axis", () => {
    const scale = fitScale(1200, 500, 390, 844);
    expect(scale).toBeCloseTo(500 / 844, 5);
  });

  it("fits into a narrow, tall pane by the width axis", () => {
    const scale = fitScale(300, 2000, 390, 844);
    expect(scale).toBeCloseTo(300 / 390, 5);
  });

  it("never scales up past 1, even in a huge container", () => {
    const scale = fitScale(4000, 4000, 390, 844);
    expect(scale).toBe(1);
  });

  it("falls back to 1 when the container has no measurable size yet", () => {
    expect(fitScale(0, 500, 390, 844)).toBe(1);
    expect(fitScale(500, 0, 390, 844)).toBe(1);
    expect(fitScale(-10, 500, 390, 844)).toBe(1);
  });

  it("shrinks a real too-short case the way the reported bug did, but now fits instead of cropping", () => {
    // A dialog that only managed ~220px of height for the preview pane before
    // the height-chain fix. The old code would have rendered a 390x220 strip
    // requiring scroll; fitScale instead shrinks the whole 390x844 box down.
    const scale = fitScale(360, 220, 390, 844);
    expect(scale).toBeCloseTo(220 / 844, 5);
    expect(scale * 844).toBeLessThanOrEqual(220 + 1e-9);
    expect(scale * 390).toBeLessThanOrEqual(360 + 1e-9);
  });
});
