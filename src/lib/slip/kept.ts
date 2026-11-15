import type { Slip } from "@/lib/walk/types";

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
    return Array.isArray(parsed) ? tidy(parsed.filter(isKept)) : [];
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
  const next: KeptSlip = { ...entry, opened: (entry.opened ?? false) || before?.opened === true };
  return tidy([...list.filter((kept) => !sameSlip(kept, entry)), next]);
}

/** Marks one slip's seal as open. */
export function markOpened(
  list: readonly KeptSlip[],
  key: Pick<KeptSlip, "day" | "neighbourhoodId">,
): KeptSlip[] {
  return list.map((kept) => (sameSlip(kept, key) ? { ...kept, opened: true } : kept));
}

/** The browser's localStorage, or null where reaching for it throws. Only the slips use it. */
export function browserStorage(): StoragePort | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
