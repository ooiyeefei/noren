import { z } from "zod";
import type { KeyValueStore } from "../memory/storage";
import {
  becauseSchema,
  changeOpSchema,
  partySnapshotSchema,
  pinSchema,
  placeSchema,
  ruleSchema,
  travellerSchema,
  tripRequestSchema,
} from "./request";
import type { Plan } from "./types";

export const TRIP_STORAGE_KEY = "noren.trips.v1";
const id = z.string().min(1);
const nonnegative = z.number().nonnegative();
export const storedTravellerSchema = travellerSchema.extend({ label: z.string().max(40) });
export const storedPartySchema = z
  .strictObject({
    id,
    // What the organiser calls the party ("Family"), not anyone's name.
    name: z.string().max(40),
    kept: z.boolean(),
    travellers: z.array(storedTravellerSchema).max(8),
    limits: partySnapshotSchema.shape.limits.partial().optional(),
    meals: partySnapshotSchema.shape.meals.partial().optional(),
    fullness: partySnapshotSchema.shape.fullness.optional(),
    needs: partySnapshotSchema.shape.needs.default([]),
  })
  .refine((p) => new Set(p.travellers.map((t) => t.key)).size === p.travellers.length)
  .refine((p) =>
    p.needs.every((n) => n.who?.every((k) => p.travellers.some((t) => t.key === k)) ?? true),
  );

const request = tripRequestSchema.shape;
const time = partySnapshotSchema.shape.meals.shape.lunch;
const moved = z.array(
  z.strictObject({
    slot: id,
    was: z.string().optional(),
    now: z.string().optional(),
    why: z.string(),
  }),
);
const check = z.discriminatedUnion("verdict", [
  z.strictObject({
    rule: ruleSchema,
    verdict: z.literal("met"),
    restsOn: z.strictObject({
      kind: z.enum(["member", "owner", "post"]),
      factId: id.optional(),
    }),
  }),
  z.strictObject({
    rule: ruleSchema,
    verdict: z.literal("not_known"),
    reason: z.enum(["no_record", "too_old", "not_recorded_here"]),
  }),
]);
const item = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("drive"),
    from: id,
    to: id,
    minutes: nonnegative,
    kilometres: nonnegative,
    estimated: z.literal(true),
  }),
  z.strictObject({
    kind: z.literal("rest"),
    at: time,
    minutes: nonnegative,
    why: z.enum(["stretch", "after_lunch", "need", "meal"]),
  }),
  z.strictObject({
    kind: z.literal("stop"),
    slot: id,
    at: time,
    minutes: nonnegative,
    place: placeSchema,
    because: becauseSchema,
    legBefore: z
      .strictObject({ how: z.enum(["walk", "drive"]), minutes: nonnegative, metres: nonnegative })
      .optional(),
    confirmed: z.boolean(),
    hasStory: z.boolean(),
    checks: z.array(check),
  }),
]);
const storedPlanSchema = z.strictObject({
  days: z
    .array(
      z.strictObject({
        index: request.days,
        date: request.startDate,
        weekday: z.string().optional(),
        calendar: z.array(
          z.strictObject({
            text: z.string(),
            verified: z.boolean(),
          }),
        ),
        night: id.optional(),
        items: z.array(item),
        driveMinutes: nonnegative,
        notes: z.array(z.string()),
      }),
    )
    .max(7),
  unmet: z.array(
    z.strictObject({
      what: z.enum(["route", "rule", "stretch", "dayDrive", "rest", "turn", "change"]),
      day: request.days.optional(),
      slot: id.optional(),
      detail: z.string(),
      choices: z.array(z.string()),
    }),
  ),
  moved: moved.optional(),
  done: z.array(id).default([]),
  skipped: z.array(id).default([]),
});

const changeSchema = z.strictObject({
  at: z.number().int().nonnegative(),
  saidAs: z.string().max(700),
  ops: z.array(changeOpSchema).max(20),
  moved,
});
const storedPins = z.array(pinSchema.extend({ label: z.string().max(80) })).max(12);
const planningState = z.strictObject({
  plan: storedPlanSchema,
  seed: id,
  avoid: z.array(id).max(60),
  pins: storedPins,
  nights: request.nights,
  status: z.enum(["planning", "under_way", "finished"]),
});

export const storedTripSchema = planningState.extend({
  id,
  regionId: id,
  start: z.string(),
  end: z.string(),
  days: request.days,
  startDate: request.startDate,
  via: request.via,
  purpose: z.string().max(280),
  partyId: id,
  plan: storedPlanSchema.optional(),
  seed: id.optional(),
  avoid: planningState.shape.avoid.default([]),
  previous: planningState.optional(),
  changes: z.array(changeSchema).transform((history) => history.slice(-60)),
  shareCode: z.string().length(24).optional(),
});

export type StoredParty = z.infer<typeof storedPartySchema>;
export type StoredTrip = z.infer<typeof storedTripSchema>;
export type TripChange = z.infer<typeof changeSchema>;
export type TripData = { version: 1; parties: StoredParty[]; trips: StoredTrip[] };

function empty(): TripData {
  return { version: 1, parties: [], trips: [] };
}

const envelope = z.object({ version: z.literal(1), parties: z.unknown(), trips: z.unknown() });
function entries<T extends { id: string }>(schema: z.ZodType<T>, input: unknown): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  if (!Array.isArray(input)) return result;
  for (const entry of input) {
    const parsed = schema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    result.push(parsed.data);
  }
  return result;
}

export function parseTrips(raw: string | null): TripData {
  if (!raw) return empty();
  try {
    const data = envelope.parse(JSON.parse(raw));
    const trips = entries(storedTripSchema, data.trips).slice(0, 12);
    let kept = 0;
    const parties = entries(storedPartySchema, data.parties).filter((p) => !p.kept || ++kept <= 6);
    return { version: 1, parties, trips };
  } catch {
    return empty();
  }
}

/** Discard the trip's private party when no other trip uses it. */
export function deleteTrip(data: TripData, id: string): TripData {
  const target = data.trips.find((t) => t.id === id);
  if (!target) return data;
  const trips = data.trips.filter((t) => t.id !== id);
  const parties = data.parties.filter(
    (p) => p.id !== target.partyId || p.kept || trips.some((t) => t.partyId === p.id),
  );
  return { ...data, trips, parties };
}

export function recordChange(
  trip: StoredTrip,
  next: {
    plan: Plan & Partial<Pick<NonNullable<StoredTrip["plan"]>, "done" | "skipped">>;
  } & Partial<Pick<StoredTrip, "seed" | "avoid" | "pins" | "nights" | "status">>,
  change: TripChange,
): StoredTrip {
  if (!trip.seed || !trip.plan) throw new Error("missing_plan");
  const { plan, seed, avoid, pins, nights, status } = trip;
  return storedTripSchema.parse({
    ...trip,
    ...next,
    seed: next.seed ?? seed,
    plan: { done: plan.done, skipped: plan.skipped, ...next.plan },
    previous: { plan, seed, avoid, pins, nights, status },
    changes: [...trip.changes, change],
  });
}

export function undoLastChange(trip: StoredTrip): StoredTrip {
  const { previous, ...rest } = trip;
  return previous
    ? { ...rest, ...previous, nights: previous.nights, changes: trip.changes.slice(0, -1) }
    : trip;
}

function localDevice() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function createTripStore(options: { storage?: () => KeyValueStore | null } = {}) {
  const listeners = new Set<() => void>();
  const storage = options.storage ?? localDevice;
  let current: TripData | undefined;
  let lastRaw: string | null = null;
  let keeps = true;

  const serverSnapshot = empty();

  function read(): boolean {
    const before = current;
    try {
      const device = storage();
      if (!device) {
        keeps = false;
        return false;
      }
      const raw = device.getItem(TRIP_STORAGE_KEY);
      if (current && raw === lastRaw) return true;
      current = parseTrips(raw);
      lastRaw = raw;
      keeps = true;
    } catch {
      keeps = false;
      return false;
    }
    if (before) listeners.forEach((listener) => listener());
    return true;
  }
  function get() {
    if (!current) read();
    return (current ??= empty());
  }
  function update(change: (data: TripData) => TripData) {
    // Read the latest write from another tab before applying this edit.
    const readable = read();
    const before = (current ??= empty());
    const after = change(before);
    if (after === before) return;
    if (after.trips.length > 12 || after.parties.filter((p) => p.kept).length > 6)
      throw new Error("trip_store_limit");
    // Reject invalid edits before replacing good data. Recovery on read is per entry.
    const parties = after.parties.map((p) => storedPartySchema.parse(p));
    const trips = after.trips.map((t) => storedTripSchema.parse(t));
    if (
      new Set(parties.map((p) => p.id)).size !== parties.length ||
      new Set(trips.map((t) => t.id)).size !== trips.length
    )
      throw new Error("duplicate_id");
    current = { version: 1, parties, trips };
    const raw = JSON.stringify(current);
    try {
      const device = readable ? storage() : null;
      if (device) {
        device.setItem(TRIP_STORAGE_KEY, raw);
        lastRaw = raw;
      }
      keeps = !!device;
    } catch {
      keeps = false;
    }
    listeners.forEach((listener) => listener());
  }
  return {
    get,
    getServerSnapshot: () => serverSnapshot,
    reload: () => {
      read();
    },
    update,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    canKeep: () => {
      get();
      return keeps;
    },
  };
}
