import type { RegionTripSettings } from "./types";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function datePlusDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(date: string) {
  return WEEKDAYS[new Date(date).getUTCDay()]!;
}

export function calendarFor(
  calendar: RegionTripSettings["calendar"],
  date: string,
  states: readonly string[],
): { entries: { text: string; verified: boolean }[]; busy: boolean } {
  if (!calendar) return { entries: [], busy: false };
  const entries: { text: string; verified: boolean }[] = [];
  const inState = (listed: string[]) => states.some((state) => listed.includes(state));
  const during = ({ from, to }: { from: string; to: string }) => from <= date && date <= to;
  const add = (text: string | undefined, verified: boolean) => {
    if (text === undefined) return;
    if (!entries.some((entry) => entry.text === text && entry.verified === verified)) {
      entries.push({ text, verified });
    }
  };
  for (const holiday of calendar.publicHolidays) {
    if (holiday.date === date && (holiday.states === "all" || inState(holiday.states))) {
      add(holiday.name.en ?? Object.values(holiday.name)[0], holiday.verified);
    }
  }
  for (const holiday of calendar.schoolHolidays) {
    if (during(holiday) && inState(holiday.states)) add("School holidays", holiday.verified);
  }
  for (const period of calendar.fasting) {
    if (during(period)) add("Fasting month", period.verified);
  }
  const weekday = weekdayOf(date);
  for (const rest of calendar.weeklyRest) {
    if (rest.days.includes(weekday) && inState(rest.states)) {
      add("Weekly rest day", rest.verified);
    }
  }
  const busyDays = calendar.busyDays.filter((day) => day.date === date);
  for (const day of busyDays) add(day.why.en ?? Object.values(day.why)[0], day.verified);
  return { entries, busy: busyDays.length > 0 };
}
