/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { STALE_AFTER_MS } from "../src/lib/domain/check-state";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addPerson, addPlace, newBackend, type Backend } from "../tests/convex/fixtures";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
});
afterEach(() => vi.restoreAllMocks());

const SHINCHI = { lat: 32.7415, lng: 129.8755 };
const DEJIMA = { lat: 32.7437, lng: 129.8728 };
const FAR_AWAY = { lat: 32.9, lng: 129.75 };
const NOW = Date.UTC(2026, 10, 4);

async function placeAt(
  b: Backend,
  createdBy: Id<"person">,
  pin: { lat: number; lng: number },
  options: Partial<Parameters<typeof addPlace>[1]> = {},
) {
  const placeId = await addPlace(b, {
    createdBy,
    visibility: "public",
    withPin: false,
    ...options,
  });
  await b.run((ctx) =>
    ctx.db.insert("pin", { placeId, ...pin, placedBy: createdBy, placedAt: Date.now() }),
  );
  return placeId;
}
const near = (metres: number) => ({ ...SHINCHI, lat: SHINCHI.lat + metres / 111_320 });
const neighbourhoodOf = (b: Backend, placeId: Id<"place">) =>
  b.t.run(async (ctx) => (await ctx.db.get("place", placeId))?.neighbourhood);

it("the pin sets the neighbourhood: moving it moves the place, and a pin outside every circle clears it", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "mission-steward", "steward");
  const placeId = await placeAt(b, steward, SHINCHI);
  expect(await neighbourhoodOf(b, placeId)).toBe("shinchi");
  const pin = await b.t.run((ctx) =>
    ctx.db
      .query("pin")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .unique(),
  );
  await b.run((ctx) => ctx.db.patch("pin", pin!._id, DEJIMA));
  expect(await neighbourhoodOf(b, placeId)).toBe("dejima");
  await b.run((ctx) => ctx.db.patch("pin", pin!._id, FAR_AWAY));
  expect(await neighbourhoodOf(b, placeId)).toBeNull();
});

it("counts a neighbourhood's public places: a stale check is left, and only real public places count", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "mission-steward", "steward");
  const here = await placeAt(b, steward, near(0), { slug: "here" });
  const fresh = await placeAt(b, steward, near(10), { slug: "fresh" });
  const stale = await placeAt(b, steward, near(20), { slug: "stale" });
  const justFresh = await placeAt(b, steward, near(30), { slug: "just-fresh" });
  await placeAt(b, steward, near(40), { slug: "draft", visibility: "draft" });
  await placeAt(b, steward, near(50), { slug: "demo", visibility: "demo_public" });
  await placeAt(b, steward, DEJIMA, { slug: "elsewhere" });
  await b.run(async (ctx) => {
    await ctx.db.patch("place", fresh, { confirmedAt: NOW - 1000 });
    await ctx.db.patch("place", stale, { confirmedAt: NOW - STALE_AFTER_MS - 1 });
    await ctx.db.patch("place", justFresh, { confirmedAt: NOW - STALE_AFTER_MS });
  });

  const mission = await b.t.query(api.missions.forPlace, { placeId: here, now: NOW });
  expect(mission).toMatchObject({
    id: "shinchi",
    names: { en: "Shinchi", ja: "新地中華街" },
    checked: 2,
    left: 2,
  });
  // A stale place is waiting again, and the page's own place is never offered back to it.
  expect(mission?.nearby.map(({ slug }) => slug)).toEqual(["stale"]);

  const all = await b.t.query(api.missions.forRegion, { regionId: "nagasaki", now: NOW });
  expect(all).toHaveLength(8);
  expect(all.find(({ id }) => id === "shinchi")).toMatchObject({ checked: 2, left: 2 });
  expect(all.find(({ id }) => id === "dejima")).toMatchObject({ checked: 0, left: 1 });
  expect(all.find(({ id }) => id === "oura")).toMatchObject({ checked: 0, left: 0 });
});

it("offers the three nearest unchecked places", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "mission-steward", "steward");
  const here = await placeAt(b, steward, near(0));
  for (const metres of [90, 30, 60, 10]) {
    const placeId = await placeAt(b, steward, near(metres), { slug: `at-${metres}` });
    if (metres === 10) await b.run((ctx) => ctx.db.patch("place", placeId, { confirmedAt: NOW }));
  }
  const mission = await b.t.query(api.missions.forPlace, { placeId: here, now: NOW });
  expect(mission?.nearby.map(({ slug }) => slug)).toEqual(["at-30", "at-60", "at-90"]);
  expect(mission?.nearby[0]?.names).toContainEqual(
    expect.objectContaining({ lang: "en", value: "Test Shop" }),
  );
});

it("pressing Still here moves the number, and nothing returned names who checked", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "mission-steward", "steward");
  const member = await addPerson(b, "mission-hana", "user");
  const placeId = await placeAt(b, steward, near(0));
  await placeAt(b, steward, near(30));
  const today = Date.now();
  const before = await b.t.query(api.missions.forPlace, { placeId, now: today });
  expect(before).toMatchObject({ checked: 0, left: 2 });

  await b.as("mission-hana").mutation(api.checks.confirm, { placeId });
  const after = await b.t.query(api.missions.forPlace, { placeId, now: today });
  expect(after).toMatchObject({ checked: 1, left: 1 });
  const inRegion = await b.t.query(api.missions.forRegion, { regionId: "nagasaki", now: today });
  expect(JSON.stringify([after, inRegion])).not.toContain(member);
});

it("a place outside a neighbourhood, a draft or a demo place has no mission", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "mission-steward", "steward");
  for (const place of [
    await placeAt(b, steward, FAR_AWAY),
    await placeAt(b, steward, near(0), { visibility: "draft" }),
    await placeAt(b, steward, near(0), { visibility: "demo_public" }),
  ]) {
    expect(await b.t.query(api.missions.forPlace, { placeId: place, now: NOW })).toBeNull();
  }
});

it("the backfill sets the neighbourhood on rows from before it existed, and clears a stale one", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "mission-steward", "steward");
  const { located, outside } = await b.t.run(async (ctx) => {
    const row = {
      regionId: "nagasaki",
      visibility: "public" as const,
      createdBy: steward,
      isMock: false,
    };
    return {
      located: await ctx.db.insert("place", { ...row, slug: "old-a", mapPin: SHINCHI }),
      outside: await ctx.db.insert("place", {
        ...row,
        slug: "old-b",
        mapPin: FAR_AWAY,
        neighbourhood: "shinchi",
      }),
    };
  });
  expect(await b.t.mutation(internal.missions.backfillNeighbourhoods, { cursor: null })).toEqual({
    processed: 2,
    isDone: true,
  });
  expect(await neighbourhoodOf(b, located)).toBe("shinchi");
  expect(await neighbourhoodOf(b, outside)).toBeNull();
});

it("the backfill works through more places than one page holds", async () => {
  vi.useFakeTimers();
  try {
    const b = newBackend(modules);
    const steward = await addPerson(b, "mission-steward", "steward");
    await b.t.run(async (ctx) => {
      for (let i = 0; i < 450; i++)
        await ctx.db.insert("place", {
          regionId: "nagasaki",
          slug: `page-${i}`,
          visibility: "public",
          createdBy: steward,
          isMock: false,
          mapPin: SHINCHI,
        });
    });
    const first = await b.t.mutation(internal.missions.backfillNeighbourhoods, { cursor: null });
    expect(first).toEqual({ processed: 200, isDone: false });
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    const all = await b.t.query(api.missions.forRegion, { regionId: "nagasaki", now: NOW });
    expect(all.find(({ id }) => id === "shinchi")?.left).toBe(450);
  } finally {
    vi.useRealTimers();
  }
});

it("reads stay bounded when a neighbourhood outgrows the limit", async () => {
  // Eight neighbourhoods' ranges plus at most 1,000 rows from the one that has them all.
  const b = newBackend(modules, { transactionLimits: { documentsRead: 1000, databaseQueries: 8 } });
  const steward = await addPerson(b, "mission-steward", "steward");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await b.t.run(async (ctx) => {
    for (let i = 0; i < 1100; i++)
      await ctx.db.insert("place", {
        regionId: "nagasaki",
        slug: `crowd-${i}`,
        visibility: "public",
        createdBy: steward,
        isMock: false,
        neighbourhood: "shinchi",
      });
  });
  const all = await b.t.query(api.missions.forRegion, { regionId: "nagasaki", now: NOW });
  expect(all.find(({ id }) => id === "shinchi")?.left).toBe(1000);
  expect(warn).toHaveBeenCalledOnce();
});
