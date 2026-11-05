type Reach = { checkInMetres: number; accuracyAllowanceMetres: number };

/**
 * FR-104: the phone's reported error can help a person reach a place, up to the allowance, so a
 * reading from inside a shop still passes and a wild reading cannot reach across a neighbourhood.
 */
export function withinReach(distance: number, accuracy: number, reach: Reach): boolean {
  return distance - Math.min(accuracy, reach.accuracyAllowanceMetres) <= reach.checkInMetres;
}

/** The date in a region's offset from UTC, as `YYYY-MM-DD`. It is all a visit keeps of the time. */
export function dayAt(now: number, utcOffsetHours: number): string {
  return new Date(now + utcOffsetHours * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A stored day as the UTC midnight of that date, which is how the app formats a date. */
export function dayToTime(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}
