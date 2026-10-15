import { describe, expect, it } from "vitest";
import { personName } from "./personName";

describe("personName", () => {
  it("shows the person's own name as written", () => {
    expect(personName("  Aigerim  ", "Student")).toBe("Aigerim");
  });

  it("falls back to the reader's word when there is no name", () => {
    expect(personName(null, "Student")).toBe("Student");
    expect(personName(undefined, "Student")).toBe("Student");
    expect(personName("   ", "Student")).toBe("Student");
  });

  it("treats the server's old Russian placeholder as no name", () => {
    // Rows written before the server stopped inventing a name hold «Ученик»;
    // booking_cancellations keeps them, so this is not only a rollout gap.
    expect(personName("Ученик", "Student")).toBe("Student");
  });
});
