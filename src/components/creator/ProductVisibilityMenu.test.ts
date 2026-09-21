import { describe, expect, it } from "vitest";
import { visibilityState } from "@/components/creator/ProductVisibilityMenu";

// Two flags, three states. `is_active: false` kills the link entirely; a paused
// product stays reachable by link and shows the author's message instead.
describe("visibilityState", () => {
  it("reports a published product", () => {
    expect(visibilityState({ is_active: true, is_paused: false })).toBe("published");
  });

  it("reports a paused product", () => {
    expect(visibilityState({ is_active: true, is_paused: true })).toBe("paused");
  });

  it("reports a private product", () => {
    expect(visibilityState({ is_active: false, is_paused: false })).toBe("private");
  });

  it("treats private as winning over paused, since a dead link cannot show a message", () => {
    expect(visibilityState({ is_active: false, is_paused: true })).toBe("private");
  });

  it("treats a missing is_active as published, matching the column's not-null contract", () => {
    expect(visibilityState({})).toBe("published");
    expect(visibilityState({ is_paused: true })).toBe("paused");
  });
});
