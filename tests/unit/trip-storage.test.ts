import { expect, it, vi } from "vitest";
import {
  createTripStore,
  deleteTrip,
  parseTrips,
  recordChange,
  storedPartySchema,
  storedTravellerSchema,
  storedTripSchema,
  TRIP_STORAGE_KEY,
  undoLastChange,
} from "@/lib/trip/storage";

const traveller = {
  key: "t1",
  label: "Demo Mum",
  ageBand: "older",
  rules: ["quiet"],
  likes: ["history"],
  skips: [],
};
const party = storedPartySchema.parse({
  id: "party",
  name: "Demo family",
  kept: false,
  travellers: [traveller],
});
const trip = storedTripSchema.parse({
  id: "trip",
  regionId: "malaysia-west",
  start: "kl",
  end: "ipoh",
  days: 2,
  purpose: "Demo weekend",
  partyId: party.id,
  pins: [],
  changes: [],
  status: "planning",
  seed: "seed",
  plan: { days: [], unmet: [], done: ["d1.open1"] },
});
const data = { version: 1 as const, parties: [party], trips: [trip] };

function device() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

it("has only the specified traveller fields", () => {
  expect(Object.keys(storedTravellerSchema.shape).sort()).toEqual(
    ["key", "label", "ageBand", "rules", "likes", "skips", "rests", "days"].sort(),
  );
  for (const field of ["name", "diagnosis", "birthday", "notes"])
    expect(storedTravellerSchema.safeParse({ ...traveller, [field]: "private" }).success).toBe(
      false,
    );
});

it("recovers good trips and parties separately after damaged entries", () => {
  expect(
    parseTrips(
      JSON.stringify({
        ...data,
        trips: [{ ...trip, plan: { days: ["bad"] } }, trip],
        parties: [{ ...party, travellers: [{ name: "bad" }] }, party],
      }),
    ),
  ).toEqual(data);
  expect(parseTrips(JSON.stringify({ ...data, trips: [{ broken: true }] })).parties).toEqual([
    party,
  ]);
  for (const raw of ["broken", null, '{"version":2}']) expect(parseTrips(raw).trips).toEqual([]);
});

it("enforces the caps on records and their contents", () => {
  const many = Array.from({ length: 13 }, (_, i) => String(i));
  const loaded = parseTrips(
    JSON.stringify({
      version: 1,
      trips: many.map((id) => ({ ...trip, id })),
      parties: many.map((id) => ({ ...party, kept: true, id })),
    }),
  );
  expect(loaded.trips).toHaveLength(12);
  expect(loaded.parties).toHaveLength(6);
  for (const extra of [
    { label: "x".repeat(41) },
    { rules: Array(9).fill("quiet") },
    { likes: Array(9).fill("history") },
    { skips: Array(5).fill("history") },
    { ageBand: "unknown" },
  ])
    expect(storedTravellerSchema.safeParse({ ...traveller, ...extra }).success).toBe(false);
  expect(
    storedPartySchema.safeParse({ ...party, travellers: Array(9).fill(traveller) }).success,
  ).toBe(false);
  const pin = { id: "p", day: 1, minutes: 1, pin: { lat: 0, lng: 0 }, label: "Demo pin" };
  for (const extra of [
    { days: 8 },
    { purpose: "x".repeat(281) },
    { pins: Array(13).fill(pin) },
    { status: "other" },
  ])
    expect(storedTripSchema.safeParse({ ...trip, ...extra }).success).toBe(false);
});

it("retains 60 changes and restores the previous plan, seed and marks across reload", () => {
  const change = { at: 1, saidAs: "Demo change", ops: [], moved: [] };
  const start = { ...trip, changes: Array.from({ length: 60 }, (_, at) => ({ ...change, at })) };
  const changed = recordChange(
    start,
    {
      plan: { days: [], unmet: [], moved: [] },
      seed: "new",
      avoid: ["place"],
      status: "under_way",
    },
    { ...change, at: 60 },
  );
  const saved = parseTrips(JSON.stringify({ ...data, trips: [changed] })).trips[0]!;
  expect(saved.changes.map((c) => c.at)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  const undone = undoLastChange(saved);
  expect(undone).toMatchObject({ plan: trip.plan, seed: "seed", status: "planning", avoid: [] });
  expect(undone.previous).toBeUndefined();
  expect(undoLastChange(undone)).toBe(undone);
});

it("notifies subscribers and preserves snapshot identity between edits and unchanged reloads", () => {
  const target = device();
  const store = createTripStore({ storage: () => target });
  const initial = store.get();
  const listener = vi.fn();
  const stop = store.subscribe(listener);
  store.reload();
  expect(store.get()).toBe(initial);
  store.update(() => data);
  const edited = store.get();
  store.reload();
  expect(store.get()).toBe(edited);
  expect(listener).toHaveBeenCalledTimes(1);
  target.setItem(
    TRIP_STORAGE_KEY,
    JSON.stringify({ ...data, trips: [{ ...trip, purpose: "new" }] }),
  );
  store.reload();
  expect(store.get().trips[0]?.purpose).toBe("new");
  stop();
  store.update((before) => deleteTrip(before, trip.id));
  expect(listener).toHaveBeenCalledTimes(2);
  expect(JSON.parse(target.getItem(TRIP_STORAGE_KEY)!)).toEqual({
    version: 1,
    parties: [],
    trips: [],
  });
});

it("keeps a reusable party and a party still used by another trip", () => {
  expect(
    deleteTrip({ ...data, parties: [{ ...party, kept: true }] }, trip.id).parties,
  ).toHaveLength(1);
  expect(deleteTrip({ ...data, trips: [trip, { ...trip, id: "two" }] }, trip.id).parties).toEqual([
    party,
  ]);
});

it("continues in page memory when storage is absent, blocked, or full", () => {
  const throws = () => {
    throw new Error("unavailable");
  };
  for (const storage of [
    () => null,
    throws,
    () => ({ ...device(), getItem: throws, setItem: throws }),
    () => ({ ...device(), setItem: throws }),
  ]) {
    const store = createTripStore({ storage });
    store.update(() => data);
    store.reload();
    expect(store.get()).toEqual(data);
    expect(store.canKeep()).toBe(false);
  }
});
