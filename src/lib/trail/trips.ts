import type { Locale } from "@/lib/i18n";

// The pure rules behind a person's trail: the order of their places, the trips they fall into and
// the name of each trip. Nothing here counts or totals anything (principle I, FR-109).

/** A new trip starts when more than this many days pass between one stamp and the next. */
export const TRIP_GAP_DAYS = 3;

export type TrailPlaceOrder = {
  placeId: string;
  /** The date of the stamp, YYYY-MM-DD, in the region's offset. */
  stampDay: string;
  /** The earliest time of day known on that date, or null when only the day is known. */
  stampTime: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / DAY_MS);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/**
 * The order the footprints follow: by day, and within a day by the earliest time known. A check-in
 * keeps only its day (FR-105), so a place known by day alone goes before those with a time, and
 * ties break on the place id so the line never jumps between renders.
 */
export function orderTrail<T extends TrailPlaceOrder>(places: readonly T[]): T[] {
  return [...places].sort((a, b) => {
    if (a.stampDay !== b.stampDay) return a.stampDay < b.stampDay ? -1 : 1;
    if ((a.stampTime === null) !== (b.stampTime === null)) return a.stampTime === null ? -1 : 1;
    if (a.stampTime !== null && b.stampTime !== null && a.stampTime !== b.stampTime)
      return a.stampTime - b.stampTime;
    return a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0;
  });
}

export type Trip<T> = {
  /** Stable across renders: the first day and the place that opened the trip. */
  id: string;
  startDay: string;
  endDay: string;
  places: T[];
};

/** Splits places already in trail order into trips at every gap longer than `TRIP_GAP_DAYS`. */
export function groupTrips<T extends TrailPlaceOrder>(
  ordered: readonly T[],
  gapDays: number = TRIP_GAP_DAYS,
): Trip<T>[] {
  const trips: Trip<T>[] = [];
  for (const place of ordered) {
    const last = trips.at(-1);
    if (last && daysBetween(last.endDay, place.stampDay) <= gapDays) {
      last.places.push(place);
      last.endDay = place.stampDay;
    } else {
      trips.push({
        id: `${place.stampDay}-${place.placeId}`,
        startDay: place.stampDay,
        endDay: place.stampDay,
        places: [place],
      });
    }
  }
  return trips;
}

type Names = Readonly<Record<string, string>>;

function pick(names: Names, locale: Locale): string | undefined {
  return names[locale] ?? names.en ?? Object.values(names)[0];
}

/**
 * The area a trip is named for. When every place falls in one neighbourhood of the region it is that
 * neighbourhood. Otherwise, including places that fall in none, it is the region ("Nagasaki"),
 * because a trip across several neighbourhoods is a trip to the city.
 */
export function tripArea(
  places: readonly { areaNames: Names | null }[],
  region: Names,
  locale: Locale,
): string {
  const first = places[0]?.areaNames ?? null;
  const same =
    first !== null &&
    places.every(
      ({ areaNames }) => areaNames !== null && pick(areaNames, "en") === pick(first, "en"),
    );
  return (same ? pick(first, locale) : pick(region, locale)) ?? "";
}

function month(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(dayNumber(day) * DAY_MS));
}

/** A date as people read it, such as Oct 3, 2026, the same on every device. */
export function formatDay(day: string, locale: Locale): string {
  return fullDay(day, locale);
}

function fullDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(dayNumber(day) * DAY_MS));
}

/**
 * "Nagasaki · Oct 2026", from the area and the month the trip began. Two trips that would read the
 * same carry the day they began instead ("Nagasaki · Oct 3, 2026").
 */
export function tripLabels(
  trips: readonly Trip<{ areaNames: Names | null }>[],
  region: Names,
  locale: Locale,
): string[] {
  const plain = trips.map(
    (trip) => `${tripArea(trip.places, region, locale)} · ${month(trip.startDay, locale)}`,
  );
  return trips.map((trip, index) =>
    plain.filter((label) => label === plain[index]).length > 1
      ? `${tripArea(trip.places, region, locale)} · ${fullDay(trip.startDay, locale)}`
      : (plain[index] ?? ""),
  );
}
