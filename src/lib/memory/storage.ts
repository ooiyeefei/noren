import { z } from "zod";
import {
  MAX_LABEL_LENGTH,
  MAX_RULES,
  MAX_TASTES,
  MAX_TRIP_ITEMS,
  MEMORY_STORAGE_KEY,
  MEMORY_VERSION,
  TASTE_STRENGTH_CAP,
} from "./constants";
import {
  emptyMemory,
  tidy,
  type Clock,
  type Memory,
  type Rule,
  type Taste,
  type TripItem,
} from "./model";

// Keeping the memory on the device. Browser storage can be missing, full, blocked or cleared, so
// every read and write sits in a try/catch and the page works without it. Nothing here leaves the
// device: the only thing sent anywhere is the snapshot a planner request builds (model.ts).

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's local storage, or null where it is missing or refuses (a private window, blocked data). */
export function browserStorage(
  source: () => Storage | undefined = () =>
    typeof window === "undefined" ? undefined : window.localStorage,
): KeyValueStore | null {
  try {
    const storage = source();
    if (storage === undefined) return null;
    // Some browsers hand back a storage object that throws on first use.
    const probe = `${MEMORY_STORAGE_KEY}.probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

const label = z
  .string()
  .min(1)
  .max(MAX_LABEL_LENGTH * 2);
const ruleSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["diet", "allergy", "mobility", "budget", "other"]),
  tag: z
    .string()
    .min(1)
    .max(MAX_LABEL_LENGTH + 10),
  label,
});
const tasteSchema = z.object({
  key: z.string().min(1).max(MAX_LABEL_LENGTH),
  label,
  told: z.boolean(),
  strength: z.number().min(0).max(TASTE_STRENGTH_CAP),
  updatedAt: z.number().int().min(0),
});
const itemSchema = z.object({
  id: z.string().min(1).max(60),
  label,
  slug: z.string().min(1).max(200).optional(),
  addedAt: z.number().int().min(0),
  kept: z.boolean(),
});

/** Keeps the valid entries of a list and drops the rest, so one bad entry does not lose the others. */
function valid<T>(schema: z.ZodType<T>, value: unknown, limit: number): T[] {
  return (Array.isArray(value) ? value : [])
    .flatMap((entry): T[] => {
      const parsed = schema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, limit);
}

/**
 * Reads what was stored. Anything unreadable gives an empty memory; a damaged entry is dropped on its
 * own. The result is tidied: faded tastes go and an earlier day's trip is wiped (unless kept).
 */
export function parseMemory(raw: string | null, clock: Clock): Memory {
  if (raw === null) return emptyMemory(clock);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return emptyMemory(clock);
  }
  if (typeof json !== "object" || json === null) return emptyMemory(clock);
  const data = json as Record<string, unknown>;
  if (data.version !== MEMORY_VERSION) return emptyMemory(clock);
  const trip = (typeof data.trip === "object" && data.trip !== null ? data.trip : {}) as Record<
    string,
    unknown
  >;
  const day =
    typeof trip.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(trip.day) ? trip.day : null;
  const memory: Memory = {
    version: MEMORY_VERSION,
    rules: valid<Rule>(ruleSchema, data.rules, MAX_RULES),
    tastes: valid<Taste>(tasteSchema, data.tastes, MAX_TASTES),
    trip: {
      // A trip with no readable day belongs to no day, so the first read wipes it.
      day: day ?? "1970-01-01",
      items: valid<TripItem>(itemSchema, trip.items, MAX_TRIP_ITEMS),
    },
  };
  return tidy(memory, clock);
}

export function serialiseMemory(memory: Memory): string {
  return JSON.stringify(memory);
}

export type MemoryStore = {
  get(): Memory;
  subscribe(listener: () => void): () => void;
  /** Applies a change, tidies, saves, and tells listeners. */
  update(change: (memory: Memory, clock: Clock) => Memory): void;
  /** Reads the device again: another tab changed it, the day turned, or the page came back to focus. */
  reload(): void;
  forgetAll(): void;
  /** False when the device will not keep the memory, so the page can say so. */
  canKeep(): boolean;
};

/**
 * The memory as a small external store. It reads the device on first use, so nothing happens at
 * import time or on the server, and it never throws: a failed write leaves the memory in the page
 * for as long as the page is open.
 */
export function createMemoryStore(options: {
  storage: () => KeyValueStore | null;
  clock: () => Clock;
}): MemoryStore {
  const listeners = new Set<() => void>();
  let storage: KeyValueStore | null | undefined;
  let current: Memory | undefined;
  let lastRaw: string | null = null;
  let keeps = true;

  const device = () => (storage === undefined ? (storage = options.storage()) : storage);
  const readRaw = (): string | null => {
    try {
      return device()?.getItem(MEMORY_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const notify = () => listeners.forEach((listener) => listener());
  const save = (memory: Memory) => {
    const raw = serialiseMemory(memory);
    try {
      const target = device();
      if (target === null) {
        keeps = false;
      } else {
        target.setItem(MEMORY_STORAGE_KEY, raw);
        keeps = true;
        lastRaw = raw;
      }
    } catch {
      keeps = false;
    }
  };
  const load = (): Memory => {
    lastRaw = readRaw();
    current = parseMemory(lastRaw, options.clock());
    keeps = device() !== null;
    return current;
  };

  return {
    get: () => current ?? load(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(change) {
      const clock = options.clock();
      const before = current ?? load();
      const after = tidy(change(before, clock), clock);
      if (after === before) return;
      current = after;
      save(after);
      notify();
    },
    reload() {
      const clock = options.clock();
      const raw = readRaw();
      const before = current;
      if (before !== undefined && raw === lastRaw) {
        // Nothing changed on the device; the day may have turned.
        const tidied = tidy(before, clock);
        if (tidied !== before) {
          current = tidied;
          save(tidied);
          notify();
        }
        return;
      }
      lastRaw = raw;
      current = parseMemory(raw, clock);
      notify();
    },
    forgetAll() {
      const empty = emptyMemory(options.clock());
      current = empty;
      try {
        device()?.removeItem(MEMORY_STORAGE_KEY);
        lastRaw = null;
      } catch {
        keeps = false;
      }
      notify();
    },
    canKeep: () => keeps,
  };
}
