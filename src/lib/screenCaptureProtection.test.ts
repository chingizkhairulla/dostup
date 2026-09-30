import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireScreenCaptureProtection,
  captureStateFromEventDetail,
  isScreenCaptureProtectionBridge,
  readScreenCaptureState,
  releaseScreenCaptureProtection,
} from "./screenCaptureProtection.ts";

test("capture event accepts a boolean detail", () => {
  assert.equal(captureStateFromEventDetail(true), true);
  assert.equal(captureStateFromEventDetail(false), false);
});

test("capture event accepts an object detail from a native bridge", () => {
  assert.equal(captureStateFromEventDetail({ isCaptured: true }), true);
  assert.equal(captureStateFromEventDetail({ isCaptured: false }), false);
});

test("malformed capture events are ignored", () => {
  assert.equal(captureStateFromEventDetail(null), null);
  assert.equal(captureStateFromEventDetail({ isCaptured: "yes" }), null);
  assert.equal(captureStateFromEventDetail({ captured: true }), null);
});

test("a bridge must provide setProtected", () => {
  assert.equal(isScreenCaptureProtectionBridge(null), false);
  assert.equal(isScreenCaptureProtectionBridge({}), false);
  assert.equal(
    isScreenCaptureProtectionBridge({ setProtected: () => undefined }),
    true,
  );
});

test("capture state reader rejects malformed native values", async () => {
  await assert.rejects(
    readScreenCaptureState({
      setProtected: () => undefined,
      isCaptured: (() => "false") as unknown as () => boolean,
    }),
    TypeError,
  );
});

test("native protection is enabled and disabled through a lease", async () => {
  const transitions: boolean[] = [];
  const bridge = {
    setProtected: (enabled: boolean) => {
      transitions.push(enabled);
    },
  };

  await acquireScreenCaptureProtection(bridge);
  await releaseScreenCaptureProtection(bridge);

  assert.deepEqual(transitions, [true, false]);
});
