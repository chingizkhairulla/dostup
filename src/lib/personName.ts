/**
 * Placeholders the server used to write instead of a missing name. manage-bookings
 * stored «Ученик» in booking_cancellations.user_name (a NOT NULL column) and
 * returned it from list_reschedule_requests; those rows stay in the database,
 * so a Russian word would keep reaching English and Kazakh screens unless it
 * is read as "no name". It is matched, never shown.
 */
const PLACEHOLDER_NAMES = new Set(["Ученик"]);

/** A person's name as written, or `fallback` (already in the reader's language) when there is none. */
export function personName(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim() ?? "";
  return trimmed && !PLACEHOLDER_NAMES.has(trimmed) ? trimmed : fallback;
}
