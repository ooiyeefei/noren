/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, addPlace, newBackend, type Backend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { runOmikujiToday } from "./connector";
import * as region from "./lib/region";
import { distanceMetres } from "../src/lib/overture/dedupe";
import { THREAD_MAX_METRES, THREAD_MIN_METRES } from "../src/lib/walk/constants";

// "Three doors", part 2: a slip leads on to two more doors, chosen by code from public data.

const modules = import.meta.glob("./**/*.ts");
const realRegionConfig = region.regionConfig;
const METRES_PER_DEGREE = 111_195;
const SHINCHI = { lat: 32.7415, lng: 129.8755 };
const NOON = Date.UTC(2026, 10, 10, 3, 0, 0);
const DAY = 24 * 3_600_000;

function switches(walk: boolean, thread: boolean) {
  vi.restoreAllMocks();
  vi.spyOn(region, "regionConfig").mockImplementation((id: string) => {
    const config = realRegionConfig(id);
    return { ...config, features: { ...config.features, connector: true, walk, thread } };
  });
}
beforeEach(() => switches(true, true));
afterEach(() => vi.restoreAllMocks());

/** A line of places, `spacing` metres apart going north, so every other place is a known distance away. */
async function street(count: number, spacing: number) {
  const b = newBackend(modules);
  await addPerson(b, "ann", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "bob", "user", { joinedDaysAgo: 30 });
  const editor = await addPerson(b, "editor", "creator");
  const ids: Id<"place">[] = [];
  for (let i = 0; i < count; i++) {
    const placeId = await addPlace(b, {
      createdBy: editor,
      visibility: "public",
      category: "cafe",
      slug: `door-${i}`,
      withPin: false,
    });
    await b.run((ctx) =>
      ctx.db.insert("pin", {
        placeId,
        lat: SHINCHI.lat + (i * spacing) / METRES_PER_DEGREE,
        lng: SHINCHI.lng,
        placedBy: editor,
        placedAt: Date.now(),
      }),
    );
    ids.push(placeId);
  }
  return { b, editor, ids };
}

const today = (b: Backend, now = NOON) =>
  b.run((ctx) => runOmikujiToday(ctx, { regionId: "nagasaki" }, now));
const regionSlip = async (b: Backend, now = NOON) =>
  (await today(b, now)).slips.find((slip) => slip.neighbourhoodId === undefined)!;
const slugs = (slip: Awaited<ReturnType<typeof regionSlip>>) => [
  slip.place.slug,
  ...(slip.thread ?? []).map((stop) => stop.place.slug),
];

describe("a slip's thread of three doors", () => {
  it("has exactly two further stops, all three places distinct, each with a sealed question and a pin", async () => {
    const { b } = await street(8, 120);
    for (const slip of (await today(b)).slips) {
      expect(slip.thread).toHaveLength(2);
      expect(new Set(slugs(slip)).size).toBe(3);
      for (const stop of slip.thread!) {
        expect(stop.question).toBeDefined();
        expect(stop.place.pin).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
        expect(stop.place.names.length).toBeGreaterThan(0);
        expect(Object.keys(stop).toSorted()).toEqual(["place", "question", "via"]);
      }
    }
  });

  it("is drawn within range of the door before it", async () => {
    const { b } = await street(8, 120);
    const slip = await regionSlip(b);
    const [one, two] = slip.thread!;
    expect(one!.via).toBe("draw");
    expect(two!.via).toBe("draw");
    for (const [from, to] of [
      [slip.place.pin, one!.place.pin],
      [one!.place.pin, two!.place.pin],
    ] as const) {
      const metres = distanceMetres(from, to);
      expect(metres).toBeGreaterThanOrEqual(THREAD_MIN_METRES);
      expect(metres).toBeLessThanOrEqual(THREAD_MAX_METRES);
    }
  });

  it("is the same for everyone all day, and different on another day", async () => {
    const { b } = await street(8, 120);
    const morning = await today(b, NOON - 3 * 3_600_000);
    expect(await today(b, NOON + 5 * 3_600_000)).toEqual(morning);
    expect(await b.t.mutation(api.connector.omikujiToday, { regionId: "nagasaki" })).toBeDefined();
    const seen = new Set<string>();
    for (let n = 0; n < 6; n++) seen.add(slugs(await regionSlip(b, NOON + n * DAY)).join(">"));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("follows a question carried from the door before it, ahead of any draw", async () => {
    const { b, ids } = await street(8, 120);
    const before = await regionSlip(b);
    const target = ids.find((_, i) => !slugs(before).includes(`door-${i}`))!;
    const targetSlug = `door-${ids.indexOf(target)}`;
    const firstId = ids[Number(before.place.slug.split("-")[1])]!;
    // The target is on the same short street as the first door, so it is within the carry limit.
    const storyId = await b.as("ann").mutation(api.stories.add, {
      placeId: firstId,
      body: "A story.",
      lang: "en",
      nextQuestion: "Who sweeps the step?",
      nextQuestionFor: target,
    });
    const slip = await regionSlip(b);
    expect(slip.place.slug).toBe(before.place.slug);
    const [one, two] = slip.thread!;
    expect(one).toMatchObject({
      via: "carried",
      place: { slug: targetSlug },
      carried: { askedBy: "Test Person (ann)", from: { slug: before.place.slug } },
      question: { kind: "story", storyId, text: "Who sweeps the step?" },
    });
    expect(
      one!.via === "carried" && one!.question.kind === "story" && one!.question.carriedFrom,
    ).toMatchObject({
      slug: before.place.slug,
    });
    expect(new Set(slugs(slip)).size).toBe(3);
    expect(two!.via).toBe("draw");
  });

  it("does not lead back into the thread or to a place that is not on the public map", async () => {
    const { b, ids } = await street(8, 120);
    const before = await regionSlip(b);
    const first = ids[Number(before.place.slug.split("-")[1])]!;
    const hidden = ids.find((_, i) => !slugs(before).includes(`door-${i}`))!;
    await b.as("ann").mutation(api.stories.add, {
      placeId: first,
      body: "A story.",
      lang: "en",
      nextQuestion: "Which way?",
      nextQuestionFor: hidden,
    });
    await b.run((ctx) =>
      ctx.db.patch("place", hidden, { visibility: "draft", hiddenReason: "not_for_visitors" }),
    );
    const slip = await regionSlip(b);
    expect(slip.thread!.every((stop) => stop.via === "draw")).toBe(true);
    expect(slugs(slip)).not.toContain(`door-${ids.indexOf(hidden)}`);
  });

  it("is left out when two further stops cannot be found", async () => {
    // Two places 120 m apart give one further stop at most; places 20 m apart are all one corner.
    const two = await street(2, 120);
    for (const slip of (await today(two.b)).slips) expect(slip).not.toHaveProperty("thread");
    const corner = await street(5, 20);
    for (const slip of (await today(corner.b)).slips) expect(slip).not.toHaveProperty("thread");
    const far = await street(4, 900);
    for (const slip of (await today(far.b)).slips) expect(slip).not.toHaveProperty("thread");
  });

  it("records nothing in the exposure ledger and writes no story", async () => {
    const { b } = await street(8, 120);
    await today(b);
    expect(await b.t.run((ctx) => ctx.db.query("placeExposure").take(1))).toEqual([]);
    const stories = await b.t.run((ctx) => ctx.db.query("story").take(1));
    expect(stories).toEqual([]);
  });

  it("is not there while the thread switch is off, and the slip is as it was", async () => {
    const { b } = await street(8, 120);
    const on = await today(b);
    switches(true, false);
    const off = await today(b);
    for (const slip of off.slips) expect(slip).not.toHaveProperty("thread");
    const withoutThread = (slips: typeof on.slips) =>
      slips.map((slip) => Object.fromEntries(Object.entries(slip).filter(([k]) => k !== "thread")));
    expect(withoutThread(off.slips)).toEqual(withoutThread(on.slips));
  });

  it("is not there while walk mode is off", async () => {
    const { b } = await street(8, 120);
    switches(false, true);
    for (const slip of (await today(b)).slips) {
      expect(slip).not.toHaveProperty("thread");
      expect(slip).not.toHaveProperty("question");
    }
  });

  it("leaves the connector's single-slip draw untouched", async () => {
    const { b } = await street(8, 120);
    const result = await b.t.mutation(api.connector.omikuji, { regionId: "nagasaki" });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("thread");
  });
});
