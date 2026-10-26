import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMaterialFolderSizes, formatMaterialBytes } from "./materialStorage.ts";

test("formats known empty sizes as zero instead of a dash", () => {
  assert.equal(formatMaterialBytes(0), "0 B");
  assert.equal(formatMaterialBytes(null), "—");
  assert.equal(formatMaterialBytes(1536), "1.5 KB");
});

test("calculates folder size recursively", () => {
  const sizes = calculateMaterialFolderSizes([
    { id: "root", type: "folder" },
    { id: "nested", type: "folder", parent_id: "root" },
    { id: "one", type: "file", parent_id: "root", file_size: 1024 },
    { id: "two", type: "file", parent_id: "nested", file_size: 2048 },
    { id: "link", type: "link", parent_id: "root" },
  ]);

  assert.equal(sizes.get("root"), 3072);
  assert.equal(sizes.get("nested"), 2048);
});

test("empty folders have a known zero size", () => {
  const sizes = calculateMaterialFolderSizes([{ id: "empty", type: "folder" }]);
  assert.equal(sizes.get("empty"), 0);
});
