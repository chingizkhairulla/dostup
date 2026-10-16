import { test } from "node:test";
import assert from "node:assert/strict";
import { getLessonCycleMinutes, sendSlotsDroppingMissingColumns, splitIntoLessons } from "./timeSlots.ts";

test("lesson cycle rounds up to whole hours", () => {
  assert.equal(getLessonCycleMinutes(30), 60);
  assert.equal(getLessonCycleMinutes(50), 60);
  assert.equal(getLessonCycleMinutes(60), 60);
  assert.equal(getLessonCycleMinutes(90), 120);
  assert.equal(getLessonCycleMinutes(120), 120);
});

test("lessons start every cycle and leave a break until the next hour", () => {
  // 14:00–18:00 block, minutes from block start
  assert.deepEqual(splitIntoLessons(0, 240, 60), [
    { start: 0, end: 60 }, { start: 60, end: 120 }, { start: 120, end: 180 }, { start: 180, end: 240 },
  ]);
  assert.deepEqual(splitIntoLessons(0, 180, 50), [
    { start: 0, end: 50 }, { start: 60, end: 110 }, { start: 120, end: 170 },
  ]);
  assert.deepEqual(splitIntoLessons(0, 240, 90), [{ start: 0, end: 90 }, { start: 120, end: 210 }]);
  // the last lesson is cut by the block end
  assert.deepEqual(splitIntoLessons(0, 30, 60), [{ start: 0, end: 30 }]);
});

test("a missing optional column is dropped and the save retried", async () => {
  const sent: Record<string, unknown>[][] = [];
  const result = await sendSlotsDroppingMissingColumns(
    [{ date: "2026-10-13", start_time: "14:00:00", description: "x", title: "y" }],
    async (slots) => {
      sent.push(slots);
      if ("description" in slots[0]) throw new Error("Could not find the 'description' column of 'time_slots' in the schema cache");
      return "ok";
    }
  );
  assert.equal(result, "ok");
  assert.deepEqual(sent[1], [{ date: "2026-10-13", start_time: "14:00:00", title: "y" }]);
});

test("other errors are not swallowed", async () => {
  await assert.rejects(
    sendSlotsDroppingMissingColumns([{ date: "d" }], async () => { throw new Error("Forbidden"); }),
    /Forbidden/
  );
});
