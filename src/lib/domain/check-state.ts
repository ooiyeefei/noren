// FR-030. Worked out when the page is shown rather than stored, so a confirmation goes stale on
// its own and no job has to rewrite rows. Nothing here counts confirmations (FR-015).
export const STALE_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

export type CheckState = "unconfirmed" | "confirmed" | "stale";

export function checkState(confirmedAt: number | undefined, now: number): CheckState {
  if (confirmedAt === undefined) return "unconfirmed";
  return now - confirmedAt > STALE_AFTER_MS ? "stale" : "confirmed";
}
