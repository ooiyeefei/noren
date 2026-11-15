import type { Slip, ThreadStop } from "@/lib/walk/types";
import { THREAD_STOPS } from "./thread";

// Kept slips: the day's drawn slips and whether each seal is open, on this device only. Nothing here
// reaches Noren. The functions are pure over a list or an injected storage port, and none throws:
// storage can be missing or refuse (private windows, blocked site data), and the page works anyway.

export const KEPT_KEY = "noren.slips.v1";
export const KEPT_MAX = 7;

/** The part of the browser's Storage that is used. */
export type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type KeptSlip = {
  /** The date in the region's time, YYYY-MM-DD. */
  day: string;
  /** The neighbourhood the slip was drawn for; null for the whole region. */
  neighbourhoodId: string | null;
  opened: boolean;
  /**
   * How many of the slip's two further doors are open, in order (0, 1 or 2). Absent in slips kept
   * before "three doors" existed, which reads as none. Read it with doorsOf.
   */
  doors?: number;
  slip: Slip;
};

export const sameSlip = (a: KeptSlip, b: Pick<KeptSlip, "day" | "neighbourhoodId">) =>
  a.day === b.day && a.neighbourhoodId === b.neighbourhoodId;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function isKept(value: unknown): value is KeptSlip {
  if (!isRecord(value) || !isRecord(value.slip) || !isRecord(value.slip.place)) return false;
  const { place } = value.slip;
  const pin = place.pin;
  return (
    typeof value.day === "string" &&
    (value.neighbourhoodId === null || typeof value.neighbourhoodId === "string") &&
    typeof value.opened === "boolean" &&
    typeof place.slug === "string" &&
    Array.isArray(place.names) &&
    typeof place.hasStory === "boolean" &&
    isRecord(pin) &&
    typeof pin.lat === "number" &&
    typeof pin.lng === "number"
  );
}

const isPlace = (place: unknown): boolean =>
  isRecord(place) &&
  typeof place.slug === "string" &&
  Array.isArray(place.names) &&
  typeof place.hasStory === "boolean" &&
  isRecord(place.pin) &&
  typeof place.pin.lat === "number" &&
  typeof place.pin.lng === "number";

/** The thread as stored, only if it is exactly the two well-formed doors a slip carries. */
function validThread(value: unknown): ThreadStop[] | undefined {
  if (!Array.isArray(value) || value.length !== THREAD_STOPS) return undefined;
  const sound = value.every(
    (stop) =>
      isRecord(stop) &&
      (stop.via === "carried" || stop.via === "draw") &&
      isPlace(stop.place) &&
      isRecord(stop.question) &&
      typeof stop.question.kind === "string" &&
      (stop.via === "draw" ||
        (isRecord(stop.carried) &&
          typeof stop.carried.askedBy === "string" &&
          isRecord(stop.carried.from) &&
          typeof stop.carried.from.slug === "string" &&
          Array.isArray(stop.carried.from.names))),
  );
  return sound ? (value as ThreadStop[]) : undefined;
}

/** A stored entry made safe to show: a malformed thread or door count is dropped, never thrown on. */
function tidied(kept: KeptSlip): KeptSlip {
  const { doors, slip, ...rest } = kept;
  const { thread, ...slipRest } = slip;
  const sound = validThread(thread);
  const count =
    typeof doors === "number" && Number.isFinite(doors)
      ? Math.max(0, Math.min(THREAD_STOPS, Math.floor(doors)))
      : 0;
  return {
    ...rest,
    ...(count > 0 ? { doors: count } : {}),
    slip: sound === undefined ? slipRest : { ...slipRest, thread: sound },
  };
}

/** How many of a kept slip's further doors are open: 0, 1 or 2, and never more than it has. */
export function doorsOf(kept: Pick<KeptSlip, "doors" | "slip">): number {
  const stops = Array.isArray(kept.slip?.thread) ? kept.slip.thread.length : 0;
  const count =
    typeof kept.doors === "number" && Number.isFinite(kept.doors) ? Math.floor(kept.doors) : 0;
  return Math.max(0, Math.min(count, THREAD_STOPS, stops));
}

/** The thread is tied: both further doors are open. */
export const isTied = (kept: Pick<KeptSlip, "doors" | "slip">): boolean =>
  doorsOf(kept) === THREAD_STOPS;

/** Newest day first; at most KEPT_MAX. */
function tidy(list: readonly KeptSlip[]): KeptSlip[] {
  return [...list]
    .sort(
      (a, b) =>
        b.day.localeCompare(a.day) ||
        (a.neighbourhoodId ?? "").localeCompare(b.neighbourhoodId ?? ""),
    )
    .slice(0, KEPT_MAX);
}

/** The kept slips on this device; an empty list when there are none or storage cannot be read. */
export function loadKept(port: StoragePort | null): KeptSlip[] {
  if (port === null) return [];
  try {
    const raw = port.getItem(KEPT_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? tidy(parsed.filter(isKept).map(tidied)) : [];
  } catch {
    return [];
  }
}

/** Tries to write the list; says whether it did. A page that cannot write keeps its list in memory. */
export function saveKept(port: StoragePort | null, list: readonly KeptSlip[]): boolean {
  if (port === null) return false;
  try {
    port.setItem(KEPT_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Forgets every kept slip on this device; says whether storage let it. */
export function clearKept(port: StoragePort | null): boolean {
  if (port === null) return false;
  try {
    port.removeItem(KEPT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds the day's slip. The same day and neighbourhood replaces what was kept (a seal that was open
 * stays open); only the newest seven days are kept.
 */
export function keepSlip(
  list: readonly KeptSlip[],
  entry: Omit<KeptSlip, "opened"> & { opened?: boolean },
): KeptSlip[] {
  const before = list.find((kept) => sameSlip(kept, entry));
  // Re-drawing the same day's slip keeps the larger count of open doors. The doors themselves can
  // change during a day (someone carries a new question), so once a further door is open here the
  // kept thread stays: an open door must be the one this person opened.
  const doors = Math.max(entry.doors ?? 0, before?.doors ?? 0);
  const keepThread = before !== undefined && doorsOf(before) > 0 && doorsOf(before) >= doors;
  const next: KeptSlip = {
    ...entry,
    ...(keepThread ? { slip: { ...entry.slip, thread: before.slip.thread! } } : {}),
    opened: (entry.opened ?? false) || before?.opened === true,
    ...(doors > 0 ? { doors } : {}),
  };
  return tidy([...list.filter((kept) => !sameSlip(kept, entry)), next]);
}

/** Marks one slip's seal as open. */
export function markOpened(
  list: readonly KeptSlip[],
  key: Pick<KeptSlip, "day" | "neighbourhoodId">,
): KeptSlip[] {
  return list.map((kept) => (sameSlip(kept, key) ? { ...kept, opened: true } : kept));
}

/**
 * Opens further door `door` (1 or 2) of one slip. A door opens only after the one before it, and the
 * first only once the slip's own seal is open; anything else leaves the list as it is.
 */
export function openDoor(
  list: readonly KeptSlip[],
  key: Pick<KeptSlip, "day" | "neighbourhoodId">,
  door: number,
): KeptSlip[] {
  return list.map((kept) =>
    sameSlip(kept, key) && kept.opened && door === doorsOf(kept) + 1 && door <= THREAD_STOPS
      ? { ...kept, doors: door }
      : kept,
  );
}

/** The browser's localStorage, or null where reaching for it throws. Only the slips use it. */
export function browserStorage(): StoragePort | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
