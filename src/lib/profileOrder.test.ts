import { expect, test } from "vitest";
import { profilesInSidebarOrder } from "./profileOrder";

function p(id: string, type: string, createdAt: string) {
  return { id, type, createdAt };
}

test("sidebar puts newest sellers under plus and buyer last", () => {
  const buyer = p("buyer", "buyer", "2026-01-01T00:00:00.000Z");
  const older = p("old-course", "creator", "2026-02-01T00:00:00.000Z");
  const newer = p("new-course", "creator", "2026-03-01T00:00:00.000Z");
  const school = p("school", "school", "2026-02-15T00:00:00.000Z");

  const ordered = profilesInSidebarOrder([buyer, older, school, newer]);
  expect(ordered.map((row) => row.id)).toEqual([
    "new-course",
    "school",
    "old-course",
    "buyer",
  ]);
});
