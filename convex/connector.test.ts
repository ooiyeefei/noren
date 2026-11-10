/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mulberry32 } from "../src/lib/draw";
import {
  addClaim,
  addPerson,
  addPlace,
  errorCode,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as connectorModule from "./connector";
import { runOmikuji, runWalk } from "./connector";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const realRegionConfig = region.regionConfig;

/** As the region's file does once the connector is switched on. */
function switchOnDraws() {
  vi.spyOn(region, "regionConfig").mockImplementation((id: string) => {
    const config = realRegionConfig(id);
    return { ...config, features: { ...config.features, connector: true } };
  });
}

beforeEach(switchOnDraws);
afterEach(() => vi.restoreAllMocks());

/** As a region does once its launch pack is complete: real places show their owners' statements. */
function completeLaunchPack() {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
}

// 2026-11-10 12:00 in Japan.
const NOON = Date.UTC(2026, 10, 10, 3, 0, 0);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// Shinchi's centre is 32.7415, 129.8755. About 111 m to a thousandth of a degree of latitude.
const SHINCHI = { lat: 32.7415, lng: 129.8755 };

type Spec = {
  slug: string;
  category?: string;
  lat?: number;
  lng?: number;
  visibility?: "draft" | "public" | "demo_public";
  isMock?: boolean;
  hidden?: boolean;
  confirmed?: boolean;
};

async function world() {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator");
  const writer = await addPerson(b, "writer", "user");
  return { b, creator, writer };
}

async function place(b: Backend, creator: Id<"person">, spec: Spec): Promise<Id<"place">> {
  const placeId = await addPlace(b, {
    createdBy: creator,
    visibility: spec.visibility ?? "public",
    isMock: spec.isMock ?? false,
    category: spec.category ?? "cafe",
    slug: spec.slug,
  });
  await b.run(async (ctx) => {
    const pin = await ctx.db
      .query("pin")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .unique();
    await ctx.db.patch("pin", pin!._id, {
      lat: spec.lat ?? SHINCHI.lat,
      lng: spec.lng ?? SHINCHI.lng,
    });
    if (spec.confirmed !== false) await ctx.db.patch("place", placeId, { confirmedAt: 1 });
    if (spec.hidden) {
      await ctx.db.patch("place", placeId, {
        visibility: "draft",
        hiddenReason: "not_for_visitors",
      });
    }
  });
  return placeId;
}

async function story(b: Backend, placeId: Id<"place">, writer: Id<"person">, allowed = false) {
  return await b.run((ctx) =>
    ctx.db.insert("story", {
      placeId,
      authorPersonId: writer,
      body: "A cat sleeps on the steps.",
      lang: "en",
      status: "live",
      isMock: false,
      ...(allowed ? { connectorAllowedAt: 1 } : {}),
    }),
  );
}

const walkArgs = (over: Partial<Parameters<typeof runWalk>[1]> = {}) => ({
  regionId: "nagasaki",
  start: { kind: "neighbourhood" as const, id: "shinchi" },
  count: 3,
  avoid: [],
  interests: [],
  adventurousness: "familiar" as const,
  ...over,
});

const walk = (b: Backend, args = walkArgs(), seed = 1, now = NOON) =>
  b.run((ctx) => runWalk(ctx, args, mulberry32(seed), now));
const omikuji = (b: Backend, args: { neighbourhoodId?: string } = {}, now = NOON) =>
  b.run((ctx) => runOmikuji(ctx, { regionId: "nagasaki", ...args }, now));

function stopsOf(result: Awaited<ReturnType<typeof walk>>) {
  if (!result.ok) throw new Error(`walk refused: ${result.reason}`);
  return result.stops;
}

describe("walk: who may be suggested", () => {
  it("draws only real places on the public map within walking distance, never the start itself", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "near-1" });
    await place(b, creator, { slug: "near-2", lat: 32.7425 });
    await place(b, creator, { slug: "near-3", lng: 129.8765 });
    await place(b, creator, { slug: "a-draft", visibility: "draft" });
    await place(b, creator, { slug: "taken-off", hidden: true });
    await place(b, creator, { slug: "demo", visibility: "demo_public", isMock: true });
    await place(b, creator, { slug: "too-far", lat: 32.7415 + 0.03 });
    for (let seed = 0; seed < 20; seed++) {
      const slugs = stopsOf(
        await walk(b, walkArgs({ count: 5 }), seed, NOON + seed * 2 * MINUTE),
      ).map((stop) => stop.slug);
      expect(slugs.toSorted()).toEqual(["near-1", "near-2", "near-3"]);
    }
  });

  it("starts from a place: the place is where the walk begins, not one of its stops", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "start-here" });
    await place(b, creator, { slug: "other-1", lat: 32.7425 });
    await place(b, creator, { slug: "other-2", lat: 32.7405 });
    const result = await walk(
      b,
      walkArgs({ start: { kind: "place", slug: "start-here" }, count: 5 }),
    );
    if (!result.ok) throw new Error("refused");
    expect(result.start).toMatchObject({ kind: "place", slug: "start-here" });
    expect(result.stops.map((stop) => stop.slug).toSorted()).toEqual(["other-1", "other-2"]);
  });

  it("leaves out the places it is told to, such as today's trip, and refuses a long list", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "been-1" });
    await place(b, creator, { slug: "been-2", lat: 32.7425 });
    await place(b, creator, { slug: "new-1", lng: 129.8765 });
    for (let seed = 0; seed < 10; seed++) {
      const slugs = stopsOf(
        await walk(b, walkArgs({ count: 5, exclude: ["been-1", "been-2", "not-a-place"] }), seed),
      ).map((stop) => stop.slug);
      expect(slugs).toEqual(["new-1"]);
    }
    await expect(
      walk(b, walkArgs({ exclude: Array.from({ length: 13 }, (_, n) => `p${n}`) })),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
  });

  it("will not start from a draft, a demo place or a place that does not exist", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "a-draft", visibility: "draft" });
    await place(b, creator, { slug: "demo", visibility: "demo_public", isMock: true });
    for (const slug of ["a-draft", "demo", "no-such-place"]) {
      expect(await walk(b, walkArgs({ start: { kind: "place", slug } }))).toEqual({
        ok: false,
        reason: "unknown_place",
      });
    }
    expect(await walk(b, walkArgs({ start: { kind: "neighbourhood", id: "atlantis" } }))).toEqual({
      ok: false,
      reason: "unknown_neighbourhood",
    });
  });

  it("describes a stop with its names, category, neighbourhood and confirmation, and nothing like a score", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one", category: "museum", confirmed: false });
    const [stop] = stopsOf(await walk(b, walkArgs({ count: 1 })));
    expect(stop).toMatchObject({
      slug: "one",
      category: "museum",
      neighbourhoodId: "shinchi",
      hasStory: false,
      wildCard: false,
      matchedInterests: [],
    });
    expect(stop!.confirmedAt).toBeUndefined();
    expect(stop!.names.map((n) => n.value).toSorted()).toEqual(["Test Shop", "テスト店"]);
    const keys = Object.keys(stop!).join(",");
    expect(keys).not.toMatch(/score|rank|weight|rating|percent/i);
  });

  it("refuses coordinates and out-of-range counts and long tag lists", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    await expect(
      b.t.mutation(api.connector.walk, { ...walkArgs(), lat: 32.7, lng: 129.8 } as never),
    ).rejects.toThrow();
    expect(await errorCode(walk(b, walkArgs({ count: 6 })))).toBe("invalid_input");
    expect(await errorCode(walk(b, walkArgs({ count: 0 })))).toBe("invalid_input");
    expect(await errorCode(walk(b, walkArgs({ count: 2.5 })))).toBe("invalid_input");
    expect(await errorCode(walk(b, walkArgs({ avoid: Array(11).fill("x") })))).toBe(
      "invalid_input",
    );
    expect(await errorCode(walk(b, walkArgs({ interests: ["x".repeat(41)] })))).toBe(
      "invalid_input",
    );
  });
});

describe("walk: the draw", () => {
  it("puts the stops in walking order and works out each leg", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "first", lat: SHINCHI.lat + 0.001 });
    await place(b, creator, { slug: "second", lat: SHINCHI.lat + 0.004 });
    await place(b, creator, { slug: "third", lat: SHINCHI.lat + 0.008 });
    for (let seed = 0; seed < 5; seed++) {
      const stops = stopsOf(await walk(b, walkArgs(), seed, NOON + seed * 2 * MINUTE));
      expect(stops.map((stop) => stop.slug)).toEqual(["first", "second", "third"]);
      expect(stops.every((stop) => stop.leg.minutes >= 1 && stop.leg.metres > 0)).toBe(true);
    }
  });

  it("labels exactly the wild cards the adventurousness asks for", async () => {
    const { b, creator } = await world();
    for (let i = 0; i < 10; i++)
      await place(b, creator, { slug: `p${i}`, lat: SHINCHI.lat + i * 0.0005 });
    let at = NOON;
    for (const [adventurousness, wild] of [
      ["familiar", 0],
      ["mixed", 1],
      ["surprise", 2],
    ] as const) {
      const stops = stopsOf(
        await walk(b, walkArgs({ adventurousness, interests: ["food"] }), 3, (at += 2 * MINUTE)),
      );
      expect(stops).toHaveLength(3);
      expect(stops.filter((stop) => stop.wildCard)).toHaveLength(wild);
      // A wild card is not picked for the traveller's interests.
      expect(
        stops.filter((stop) => stop.wildCard).every((stop) => stop.matchedInterests.length === 0),
      ).toBe(true);
    }
  });

  it("names the interest a stop matches, in the traveller's own word, and still draws the rest", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "museum-1", category: "museum" });
    await place(b, creator, { slug: "bar-1", category: "bar", lat: SHINCHI.lat + 0.001 });
    const stops = stopsOf(await walk(b, walkArgs({ count: 2, interests: ["History"] })));
    expect(stops.find((stop) => stop.slug === "museum-1")!.matchedInterests).toEqual(["History"]);
    expect(stops.find((stop) => stop.slug === "bar-1")!.matchedInterests).toEqual([]);
  });

  it("reports interests it could not map, and tilts nothing for them", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    const result = await walk(b, walkArgs({ count: 1, interests: ["gardening"] }));
    if (!result.ok) throw new Error("refused");
    expect(result.interestsNotMatched).toEqual(["gardening"]);
    expect(result.stops).toHaveLength(1);
  });

  it("leaves out places that break a hard rule it can check, and says which rules it could not", async () => {
    completeLaunchPack();
    const { b, creator } = await world();
    const cashOnly = await place(b, creator, { slug: "cash-only" });
    const steps = await place(b, creator, { slug: "has-steps", lat: SHINCHI.lat + 0.001 });
    await place(b, creator, { slug: "izakaya", category: "bar", lat: SHINCHI.lat + 0.002 });
    await place(b, creator, { slug: "fine", lat: SHINCHI.lat + 0.003 });
    const proposedOnly = await place(b, creator, {
      slug: "only-proposed",
      lat: SHINCHI.lat + 0.004,
    });
    await addClaim(b, {
      placeId: cashOnly,
      kind: "caution",
      authorId: creator,
      cautionType: "cash_only",
      status: "published",
    });
    await addClaim(b, {
      placeId: steps,
      kind: "caution",
      authorId: creator,
      cautionType: "accessibility_steps",
      status: "published",
    });
    // An unconfirmed caution is not on the page, so it excludes nothing.
    await addClaim(b, {
      placeId: proposedOnly,
      kind: "caution",
      authorId: creator,
      cautionType: "cash_only",
      status: "proposed",
    });
    const result = await walk(
      b,
      walkArgs({ count: 5, avoid: ["cash-free", "step-free", "no-alcohol", "vegetarian"] }),
    );
    if (!result.ok) throw new Error("refused");
    expect(result.stops.map((stop) => stop.slug).toSorted()).toEqual(["fine", "only-proposed"]);
    expect(result.rulesApplied.map((rule) => rule.tag)).toEqual([
      "cash-free",
      "step-free",
      "no-alcohol",
    ]);
    expect(result.rulesNotChecked).toEqual([
      expect.objectContaining({
        tag: "vegetarian",
        reason: expect.stringMatching(/no menu or ingredient data/),
      }),
    ]);
  });

  it("uses no owner statement for a hard rule while the page hides them, before the launch pack is complete", async () => {
    const { b, creator } = await world();
    const cashOnly = await place(b, creator, { slug: "cash-only" });
    await addClaim(b, {
      placeId: cashOnly,
      kind: "caution",
      authorId: creator,
      cautionType: "cash_only",
      status: "published",
    });
    const result = await walk(b, walkArgs({ count: 1, avoid: ["cash-free"] }));
    if (!result.ok) throw new Error("refused");
    expect(result.stops.map((stop) => stop.slug)).toEqual(["cash-only"]);
    // It says so, rather than claiming a check it did not make.
    expect(result.rulesApplied).toEqual([]);
    expect(result.rulesNotChecked).toEqual([
      expect.objectContaining({
        tag: "cash-free",
        reason: expect.stringMatching(/not shown on Noren yet/),
      }),
    ]);
  });

  it("returns fewer stops than asked when fewer places fit", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "only" });
    expect(stopsOf(await walk(b, walkArgs({ count: 4 })))).toHaveLength(1);
    const empty = (await world()).b;
    expect(stopsOf(await walk(empty))).toEqual([]);
  });

  it("marks the places the map marks as having a story, and no others", async () => {
    const { b, creator, writer } = await world();
    const withStory = await place(b, creator, { slug: "with-story" });
    await place(b, creator, { slug: "without", lat: SHINCHI.lat + 0.001 });
    await story(b, withStory, writer);
    const stops = stopsOf(await walk(b, walkArgs({ count: 2 })));
    const onMap = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
    for (const stop of stops) {
      expect(stop.hasStory).toBe(onMap.find((row) => row.slug === stop.slug)!.hasStory);
    }
    expect(stops.find((stop) => stop.slug === "with-story")!.hasStory).toBe(true);
    expect(stops.find((stop) => stop.slug === "without")!.hasStory).toBe(false);
  });
});

describe("the exposure ledger", () => {
  const rows = (b: Backend) => b.t.run((ctx) => ctx.db.query("placeExposure").take(100));

  it("counts a suggestion in the same step that returns the stops, and only for those stops", async () => {
    const { b, creator } = await world();
    for (let i = 0; i < 6; i++)
      await place(b, creator, { slug: `p${i}`, lat: SHINCHI.lat + i * 0.0005 });
    const stops = stopsOf(await walk(b, walkArgs({ count: 2 })));
    const written = await rows(b);
    expect(written).toHaveLength(2);
    const slugs = await b.t.run(async (ctx) => {
      const found: string[] = [];
      for (const row of written) found.push((await ctx.db.get("place", row.placeId))!.slug);
      return found;
    });
    expect(slugs.toSorted()).toEqual(stops.map((stop) => stop.slug).toSorted());
    expect(written.every((row) => row.count === 1 && row.weekKey === "2026-W46")).toBe(true);
  });

  it("holds nothing about a person: a place, a week and a count", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    await walk(b, walkArgs({ count: 1 }));
    await omikuji(b);
    for (const row of await rows(b)) {
      expect(Object.keys(row).toSorted()).toEqual(
        ["_creationTime", "_id", "count", "lastOmikujiDay", "placeId", "weekKey"]
          .filter((key) => key in row)
          .toSorted(),
      );
    }
  });

  it("has no public function that adds to it by itself", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    // Only the draws are callable from outside (walk mode's omikujiToday records nothing, see
    // walk.test.ts); the helpers and the clean-up are not.
    const isPublic = (value: unknown) =>
      typeof value === "function" && (value as { isPublic?: boolean }).isPublic === true;
    const callable = Object.entries(connectorModule)
      .filter(([, value]) => isPublic(value))
      .map(([name]) => name);
    expect(callable.toSorted()).toEqual(["omikuji", "omikujiToday", "walk"]);
    // Nothing is written until a draw returns stops.
    expect(await rows(b)).toEqual([]);
  });

  it("adds up over draws within the week", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    await walk(b, walkArgs({ count: 1 }), 1, NOON);
    await walk(b, walkArgs({ count: 1 }), 2, NOON + 2 * MINUTE);
    expect((await rows(b)).map((row) => row.count)).toEqual([2]);
  });

  it("makes a place that was suggested often less likely than a quiet one", async () => {
    const { b, creator } = await world();
    const busy = await place(b, creator, { slug: "busy" });
    await place(b, creator, { slug: "quiet", lat: SHINCHI.lat + 0.001 });
    await b.run((ctx) =>
      ctx.db.insert("placeExposure", { placeId: busy, weekKey: "2026-W46", count: 12 }),
    );
    const picks = { busy: 0, quiet: 0 };
    for (let i = 0; i < 40; i++) {
      const [stop] = stopsOf(await walk(b, walkArgs({ count: 1 }), i, NOON + i * 2 * MINUTE));
      picks[stop!.slug as "busy" | "quiet"]++;
    }
    expect(picks.quiet).toBeGreaterThan(picks.busy);
  });

  it("counts last week's suggestions for the part of last week still inside seven days", async () => {
    const { b, creator } = await world();
    const busy = await place(b, creator, { slug: "busy" });
    await place(b, creator, { slug: "quiet", lat: SHINCHI.lat + 0.001 });
    // 2026-11-10 is a Tuesday: six sevenths of last week is still inside the window.
    await b.run((ctx) =>
      ctx.db.insert("placeExposure", { placeId: busy, weekKey: "2026-W45", count: 40 }),
    );
    const picks = { busy: 0, quiet: 0 };
    for (let i = 0; i < 40; i++) {
      const [stop] = stopsOf(await walk(b, walkArgs({ count: 1 }), i, NOON + i * 2 * MINUTE));
      picks[stop!.slug as "busy" | "quiet"]++;
    }
    expect(picks.quiet).toBeGreaterThan(picks.busy);
  });

  it("removes rows older than eight weeks and keeps the rest", async () => {
    const { b, creator } = await world();
    const id = await place(b, creator, { slug: "one" });
    const now = Date.now();
    const thisWeek = new Date(now).toISOString().slice(0, 4);
    await b.run(async (ctx) => {
      await ctx.db.insert("placeExposure", {
        placeId: id,
        weekKey: `${Number(thisWeek) - 1}-W01`,
        count: 3,
      });
      await ctx.db.insert("placeExposure", {
        placeId: id,
        weekKey: `${Number(thisWeek) + 1}-W01`,
        count: 2,
      });
    });
    await b.t.mutation(internal.connector.pruneExposure, {});
    expect((await rows(b)).map((row) => row.count)).toEqual([2]);
  });
});

describe("rate limit", () => {
  it("allows 60 draws a minute across everyone and then refuses, without counting the refused one", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    for (let i = 0; i < 60; i++) await walk(b, walkArgs({ count: 1 }), i);
    expect(await errorCode(walk(b, walkArgs({ count: 1 }), 99))).toBe("rate_limited");
    expect(await errorCode(omikuji(b))).toBe("rate_limited");
    const counted = (await b.t.run((ctx) => ctx.db.query("placeExposure").take(10))).map(
      (row) => row.count,
    );
    expect(counted).toEqual([60]);
    // A minute later the window has reset.
    expect((await walk(b, walkArgs({ count: 1 }), 100, NOON + MINUTE + 1)).ok).toBe(true);
  });

  it("is keyed by nothing about the caller", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    await walk(b, walkArgs({ count: 1 }));
    const keys = (await b.t.run((ctx) => ctx.db.query("rateLimit").take(10))).map((row) => row.key);
    expect(keys.toSorted()).toEqual(["connector:draw:hour", "connector:draw:minute"]);
  });

  it("can be reached with no sign-in at all", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    const result = await b.t.mutation(api.connector.walk, walkArgs({ count: 1 }));
    expect(result.ok).toBe(true);
  });

  it("answers as if absent while the region's file keeps the connector off, and counts nothing", async () => {
    vi.restoreAllMocks();
    expect(realRegionConfig("nagasaki").features.connector).toBe(false);
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    expect(await errorCode(b.t.mutation(api.connector.walk, walkArgs({ count: 1 })))).toBe(
      "not_found",
    );
    expect(
      await errorCode(b.t.mutation(api.connector.omikuji, { regionId: "nagasaki" })),
    ).toBe("not_found");
    expect(await b.t.run((ctx) => ctx.db.query("placeExposure").take(1))).toEqual([]);
    expect(await b.t.run((ctx) => ctx.db.query("rateLimit").take(1))).toEqual([]);
  });
});

describe("omikuji", () => {
  async function town() {
    const w = await world();
    const { b, creator, writer } = w;
    // Eight places in Shinchi; four have a story. Two in Dejima.
    for (let i = 0; i < 8; i++) {
      const id = await place(b, creator, {
        slug: `shinchi-${i}`,
        lat: SHINCHI.lat + (i % 4) * 0.0003,
        lng: SHINCHI.lng + Math.floor(i / 4) * 0.0003,
      });
      if (i < 4) await story(b, id, writer);
    }
    await place(b, creator, { slug: "dejima-0", lat: 32.7437, lng: 129.8728 });
    await place(b, creator, { slug: "dejima-1", lat: 32.7439, lng: 129.8729 });
    return w;
  }
  const slugOf = (result: Awaited<ReturnType<typeof omikuji>>) => {
    if (!result.ok) throw new Error(`no slip: ${result.reason}`);
    return result.place.slug;
  };

  it("gives everyone the same slip for the same day and neighbourhood, all day", async () => {
    const { b } = await town();
    const morning = await omikuji(b, { neighbourhoodId: "shinchi" }, Date.UTC(2026, 10, 9, 15, 5)); // 00:05 JST on the 10th
    const noon = await omikuji(b, { neighbourhoodId: "shinchi" }, NOON);
    const night = await omikuji(b, { neighbourhoodId: "shinchi" }, Date.UTC(2026, 10, 10, 14, 59)); // 23:59 JST
    expect(slugOf(noon)).toBe(slugOf(morning));
    expect(slugOf(night)).toBe(slugOf(morning));
    if (!noon.ok) throw new Error("no slip");
    expect(noon).toMatchObject({ day: "2026-11-10", neighbourhoodId: "shinchi" });
  });

  it("goes by the date in Japan, not in UTC", async () => {
    const { b } = await town();
    const lateUtc = await omikuji(b, { neighbourhoodId: "shinchi" }, Date.UTC(2026, 10, 10, 16, 0)); // 01:00 JST on the 11th
    const nextNoon = await omikuji(b, { neighbourhoodId: "shinchi" }, NOON + DAY);
    if (!lateUtc.ok) throw new Error("no slip");
    expect(lateUtc.day).toBe("2026-11-11");
    expect(slugOf(lateUtc)).toBe(slugOf(nextNoon));
  });

  it("changes from day to day", async () => {
    const { b } = await town();
    const seen = new Set<string>();
    for (let d = 0; d < 12; d++)
      seen.add(slugOf(await omikuji(b, { neighbourhoodId: "shinchi" }, NOON + d * DAY)));
    expect(seen.size).toBeGreaterThan(3);
  });

  it("stays put when another place is listed, or when the place was suggested a lot", async () => {
    const { b, creator } = await town();
    const before = slugOf(await omikuji(b, { neighbourhoodId: "shinchi" }));
    await place(b, creator, { slug: "new-listing", lat: SHINCHI.lat + 0.0002 });
    // A new listing can win the slip itself, but it never reshuffles the places already there.
    const current = slugOf(await omikuji(b, { neighbourhoodId: "shinchi" }));
    expect([before, "new-listing"]).toContain(current);
    const slip = await b.t.run((ctx) =>
      ctx.db
        .query("place")
        .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", "nagasaki").eq("slug", current))
        .unique(),
    );
    await b.run(async (ctx) => {
      const row = await ctx.db
        .query("placeExposure")
        .withIndex("by_weekKey_and_placeId", (q) =>
          q.eq("weekKey", "2026-W46").eq("placeId", slip!._id),
        )
        .first();
      await ctx.db.patch("placeExposure", row!._id, { count: 500 });
    });
    expect(slugOf(await omikuji(b, { neighbourhoodId: "shinchi" }))).toBe(current);
  });

  it("draws from the neighbourhood asked for, and from the whole region when none is named", async () => {
    const { b } = await town();
    for (let d = 0; d < 10; d++) {
      const dejima = await omikuji(b, { neighbourhoodId: "dejima" }, NOON + d * DAY);
      expect(slugOf(dejima)).toMatch(/^dejima-/);
      const shinchi = await omikuji(b, { neighbourhoodId: "shinchi" }, NOON + d * DAY);
      expect(slugOf(shinchi)).toMatch(/^shinchi-/);
    }
    const everywhere = await omikuji(b, {}, NOON);
    if (!everywhere.ok) throw new Error("no slip");
    expect(everywhere.neighbourhoodId).toBeUndefined();
  });

  it("leans toward places nobody has written about, without excluding the rest", async () => {
    const { b } = await town();
    let withoutStory = 0;
    const days = 90;
    for (let d = 0; d < days; d++) {
      const result = await omikuji(b, { neighbourhoodId: "shinchi" }, NOON + d * DAY);
      if (!result.ok) throw new Error("no slip");
      if (!result.place.hasStory) withoutStory++;
    }
    // Four of eight have a story; the nudge is 3x, so about 75 percent of slips have none.
    expect(withoutStory / days).toBeGreaterThan(0.6);
    expect(withoutStory / days).toBeLessThan(0.9);
    expect(withoutStory).toBeLessThan(days);
  });

  it("says whether the place has a story from live data, matching the map", async () => {
    const { b } = await town();
    const result = await omikuji(b, { neighbourhoodId: "shinchi" });
    if (!result.ok) throw new Error("no slip");
    const onMap = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
    expect(result.place.hasStory).toBe(
      onMap.find((row) => row.slug === result.place.slug)!.hasStory,
    );
  });

  it("counts the slip once for the day, however many people ask", async () => {
    const { b } = await town();
    for (let i = 0; i < 7; i++)
      await omikuji(b, { neighbourhoodId: "shinchi" }, NOON + i * 2 * MINUTE);
    const written = await b.t.run((ctx) => ctx.db.query("placeExposure").take(10));
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ count: 1, lastOmikujiDay: "2026-11-10" });
    // The next day's slip is a new turn.
    await omikuji(b, { neighbourhoodId: "shinchi" }, NOON + DAY);
    const total = (await b.t.run((ctx) => ctx.db.query("placeExposure").take(10))).reduce(
      (sum, row) => sum + row.count,
      0,
    );
    expect(total).toBe(2);
  });

  it("only ever names a real place on the public map", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "a-draft", visibility: "draft" });
    await place(b, creator, { slug: "demo", visibility: "demo_public", isMock: true });
    await place(b, creator, { slug: "taken-off", hidden: true });
    expect(await omikuji(b)).toEqual({ ok: false, reason: "no_places" });
    await place(b, creator, { slug: "real" });
    expect(slugOf(await omikuji(b))).toBe("real");
  });

  it("rejects a neighbourhood that does not exist", async () => {
    const { b } = await world();
    expect(await omikuji(b, { neighbourhoodId: "atlantis" })).toEqual({
      ok: false,
      reason: "unknown_neighbourhood",
    });
  });
});

describe("the writer's opt-in on a story", () => {
  it("is reported by the page's own story query, false unless the writer allowed it", async () => {
    const { b, creator, writer } = await world();
    const id = await place(b, creator, { slug: "one" });
    await story(b, id, writer, true);
    await story(b, id, writer, false);
    const stories = await b.t.query(api.stories.listForPlace, { placeId: id });
    expect(stories.map((s) => s.connectorAllowed).toSorted()).toEqual([false, true]);
  });

  it("does not change what the story page shows on Noren", async () => {
    const { b, creator, writer } = await world();
    const id = await place(b, creator, { slug: "one" });
    await story(b, id, writer, false);
    const [shown] = await b.t.query(api.stories.listForPlace, { placeId: id });
    expect(shown).toMatchObject({
      body: "A cat sleeps on the steps.",
      authorName: "Test Person (writer)",
    });
  });
});
