import type { Locale } from "@/lib/i18n";

export { STALE_AFTER_MS, checkState, type CheckState } from "@/lib/domain/check-state";

/** UTC, like the story footnotes, so a date reads the same on every device. */
export function checkDate(milliseconds: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(
    milliseconds,
  );
}
