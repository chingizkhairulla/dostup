import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeNavOrder } from "./navOrder.ts";

const DEFAULTS = ["search", "home", "announcements", "schedule", "materials", "notifications"] as const;

test("no saved order gives the default order", () => {
  assert.deepEqual(mergeNavOrder(null, DEFAULTS), [...DEFAULTS]);
  assert.deepEqual(mergeNavOrder([], DEFAULTS), [...DEFAULTS]);
});

test("a new section lands right after its neighbour in a saved order", () => {
  assert.deepEqual(
    mergeNavOrder(["search", "home", "schedule", "materials", "notifications"], DEFAULTS),
    ["search", "home", "announcements", "schedule", "materials", "notifications"],
  );
  assert.deepEqual(
    mergeNavOrder(["materials", "home", "search", "schedule", "notifications"], DEFAULTS),
    ["materials", "home", "announcements", "search", "schedule", "notifications"],
  );
});

test("unknown and repeated keys are dropped", () => {
  assert.deepEqual(
    mergeNavOrder(["home", "old", "home", "search", 42], ["search", "home"] as const),
    ["home", "search"],
  );
});
