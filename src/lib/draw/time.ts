// Dates in the region's own time. Japan has no daylight saving, so a fixed offset is enough.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The date in the region as YYYY-MM-DD, for `offsetHours` from UTC (9 for Japan). */
export function localDay(nowMs: number, offsetHours: number): string {
  return new Date(nowMs + offsetHours * HOUR_MS).toISOString().slice(0, 10);
}

/** 1 for Monday up to 7 for Sunday, in the region's time. */
export function isoWeekday(nowMs: number, offsetHours: number): number {
  const day = new Date(nowMs + offsetHours * HOUR_MS).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The ISO week in the region's time, such as "2026-W46". Weeks sort correctly as plain text, which
 * the ledger's clean-up relies on.
 */
export function isoWeekKey(nowMs: number, offsetHours: number): string {
  const local = new Date(nowMs + offsetHours * HOUR_MS);
  // The Thursday of this week decides which year the week belongs to.
  const thursday = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
      (4 - isoWeekday(nowMs, offsetHours)) * DAY_MS,
  );
  const year = thursday.getUTCFullYear();
  const dayOfYear = (thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1;
  return `${year}-W${String(Math.ceil(dayOfYear / 7)).padStart(2, "0")}`;
}

/** The week before the one that holds `nowMs`. */
export function previousWeekKey(nowMs: number, offsetHours: number): string {
  return isoWeekKey(nowMs - 7 * DAY_MS, offsetHours);
}

/**
 * Suggestions in the last 7 days, worked out from two weekly counts. The last 7 days are the
 * days of this week so far plus the tail end of last week, so last week counts for the part of it
 * that is still inside the window (on a Monday, 6 of its 7 days; on a Sunday, none). This assumes
 * suggestions were spread evenly through last week.
 */
export function recentSuggestions(
  counts: { thisWeek: number; lastWeek: number },
  weekday: number,
): number {
  const stillInside = (7 - weekday) / 7;
  return counts.thisWeek + counts.lastWeek * stillInside;
}
