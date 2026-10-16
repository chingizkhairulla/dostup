// A lesson always starts on a whole hour counted from the block start:
// 50 min → 50 lesson + 10 break, 90 min → 90 lesson + 30 break.
export const getLessonCycleMinutes = (duration: number): number =>
  Math.max(60, Math.ceil(Math.max(1, duration) / 60) * 60);

// Splits [startMin, endMin) into lessons. The last lesson is cut short if the block ends earlier.
export const splitIntoLessons = (
  startMin: number,
  endMin: number,
  duration: number
): { start: number; end: number }[] => {
  const cycle = getLessonCycleMinutes(duration);
  const lessons: { start: number; end: number }[] = [];
  for (let cur = startMin; cur < endMin; cur += cycle) {
    lessons.push({ start: cur, end: Math.min(cur + duration, endMin) });
  }
  return lessons;
};

const MISSING_COLUMN_RE = /Could not find the '([^']+)' column of 'time_slots'/;

// Inserts slots and, if the database has not got an optional column yet
// (migration not applied), retries without that column instead of failing the whole save.
export async function sendSlotsDroppingMissingColumns<T>(
  slots: Record<string, unknown>[],
  send: (slots: Record<string, unknown>[]) => Promise<T>
): Promise<T> {
  let current = slots;
  const dropped = new Set<string>();
  for (;;) {
    try {
      return await send(current);
    } catch (error) {
      const column = MISSING_COLUMN_RE.exec(error instanceof Error ? error.message : String(error))?.[1];
      if (!column || dropped.has(column) || column === "date" || column === "start_time") throw error;
      dropped.add(column);
      console.warn(`time_slots has no "${column}" column, saving slots without it`);
      current = current.map(({ [column]: _omit, ...rest }) => rest);
    }
  }
}
