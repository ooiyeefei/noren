/**
 * The plain rules of automatic posting to Instagram, apart from Convex and the network so they can
 * be tested alone: the daily pacing, and how old the access token is.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Japan has no daylight saving time, so one fixed offset is exact. */
const JST_OFFSET_MS = 9 * HOUR_MS;

/** The start of the Japan-time day that `now` falls in, as a time in milliseconds. */
export function jstDayStart(now: number): number {
  return Math.floor((now + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
}

/** The Japan-time hour, 0 to 23. */
export function jstHour(now: number): number {
  return Math.floor((now - jstDayStart(now)) / HOUR_MS);
}

export type AutoPostSchedule = { perDay: number; hourJst: number };

/**
 * How many more posts may be started now. Without a schedule an approved post goes out at once, with at most
 * `burst` in flight together (callers pass the in-flight count then). With one, nothing starts before the set hour, and no more than
 * `perDay` start in a Japan-time day (`startedToday` counts posted and in-flight ones).
 */
export function slotsAvailable(
  schedule: AutoPostSchedule | undefined,
  now: number,
  startedToday: number,
  burst = 5,
): number {
  if (schedule === undefined) return Math.max(0, burst - startedToday);
  if (jstHour(now) < schedule.hourJst) return 0;
  return Math.max(0, schedule.perDay - startedToday);
}

/** The long-lived Instagram token is valid for 60 days from when it was made or last refreshed. */
export const TOKEN_LIFETIME_DAYS = 60;
/** A steward is warned when this many days or fewer are left. */
export const TOKEN_WARN_DAYS = 14;

/** Whole days left on a token first seen at `firstSeenAt`; negative once it has run out. */
export function tokenDaysLeft(firstSeenAt: number, now: number): number {
  return TOKEN_LIFETIME_DAYS - Math.floor((now - firstSeenAt) / DAY_MS);
}

/** A steward-facing reason for each way a post can fail, as a stable code. */
export const FAILURE_CODES = [
  "not_configured",
  "token_invalid",
  "rate_limited",
  "image_rejected",
  "container_error",
  "container_expired",
  "timeout",
  "api_error",
  "network",
  "switch_off",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/** Codes worth another automatic try; the others need a steward (or the owner) first. */
export function isRetryable(code: FailureCode): boolean {
  return code === "timeout" || code === "api_error" || code === "network";
}

/** Pause before automatic try number `attempt` (1-based): 5, 20, 80 minutes. */
export function retryDelayMs(attempt: number): number {
  return 5 * 60 * 1000 * 4 ** Math.max(0, attempt - 1);
}
export const MAX_ATTEMPTS = 3;
