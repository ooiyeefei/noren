import { describe, expect, it } from "vitest";
import { distanceMetres } from "@/lib/overture/dedupe";
import {
  CARRY_MAX_METRES,
  CARRY_TARGETS_LIMIT,
  carryDistance,
  nearestCarryTargets,
  threadOn,
} from "@/lib/slip/carry";
import { THREAD_STOPS, chooseNextStop, threadSeed, type ThreadPlace } from "@/lib/slip/thread";
import { THREAD_MAX_METRES, THREAD_MIN_METRES } from "@/lib/walk/constants";
import { ORIGIN, northOf } from "../fixtures/walk";

const place = (id: string, metresNorth: number, hasStory = false): ThreadPlace => ({
  id,
  hasStory,
  pin: northOf(ORIGIN, metresNorth),
});
const START = place("start", 0);
const POOL = [
  START,
  place("too-near", 30),
  place("a", 100),
  place("b", 200, true),
  place("c", 350),
  place("too-far", 500),
  place("way-off", 5000),
];

describe("threadOn", () => {
  it("is on only when walk mode and the thread switch are both on", () => {
    expect(threadOn({ walk: true, thread: true })).toBe(true);
    expect(threadOn({ walk: true, thread: false })).toBe(false);
    expect(threadOn({ walk: false, thread: true })).toBe(false);
    expect(threadOn({ walk: false, thread: false })).toBe(false);
  });
});

describe("choosing the next door", () => {
  const choose = (over: Partial<Parameters<typeof chooseNextStop<ThreadPlace>>[0]> = {}) =>
    chooseNextStop({
      from: START,
      pool: POOL,
      inThread: [START.id],
      carried: [],
      seed: threadSeed("nagasaki|2026-11-10|-", 1),
      ...over,
    });

  it("draws from places between the minimum and maximum distance, never the thread itself", () => {
    expect(THREAD_STOPS).toBe(2);
    const seen = new Set<string>();
    for (let n = 0; n < 40; n++) {
      const stop = choose({ seed: `seed-${n}` });
      expect(stop?.via).toBe("draw");
      seen.add(stop!.place.id);
      const metres = distanceMetres(START.pin, stop!.place.pin);
      expect(metres).toBeGreaterThanOrEqual(THREAD_MIN_METRES);
      expect(metres).toBeLessThanOrEqual(THREAD_MAX_METRES);
    }
    expect([...seen].toSorted()).toEqual(["a", "b", "c"]);
  });

  it("skips places already in the thread", () => {
    for (let n = 0; n < 20; n++) {
      const stop = choose({ inThread: [START.id, "a", "b"], seed: `s${n}` });
      expect(stop?.place.id).toBe("c");
    }
  });

  it("is the same for the same seed and different seeds give a spread", () => {
    expect(choose({ seed: "x" })).toEqual(choose({ seed: "x" }));
    expect(threadSeed("s", 1)).not.toBe(threadSeed("s", 2));
    expect(threadSeed("s", 1)).toContain("s");
    const picks = new Set(
      Array.from({ length: 30 }, (_, n) => choose({ seed: `d${n}` })?.place.id),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("does not depend on the order the pool is listed in", () => {
    const reversed = [...POOL].reverse();
    for (let n = 0; n < 10; n++)
      expect(choose({ pool: reversed, seed: `r${n}` })?.place.id).toBe(
        choose({ seed: `r${n}` })?.place.id,
      );
  });

  it("is undefined when no place is in range", () => {
    expect(choose({ pool: [START, place("far", 900), place("near", 10)] })).toBeUndefined();
    expect(choose({ pool: [START] })).toBeUndefined();
    expect(choose({ pool: [] })).toBeUndefined();
  });

  it("follows the newest carried question to a place in the pool, whatever its distance", () => {
    const stop = choose({
      carried: [
        { storyId: "old", addedAt: 1, toPlaceId: "a" },
        { storyId: "new", addedAt: 9, toPlaceId: "way-off" },
        { storyId: "mid", addedAt: 5, toPlaceId: "b" },
      ],
    });
    expect(stop).toMatchObject({ via: "carried", storyId: "new", place: { id: "way-off" } });
  });

  it("passes over a carried question whose place is used, not in the pool, or the door itself", () => {
    const stop = choose({
      inThread: [START.id, "b"],
      carried: [
        { storyId: "used", addedAt: 9, toPlaceId: "b" },
        { storyId: "gone", addedAt: 8, toPlaceId: "no-longer-public" },
        { storyId: "self", addedAt: 7, toPlaceId: START.id },
        { storyId: "ok", addedAt: 2, toPlaceId: "c" },
      ],
    });
    expect(stop).toMatchObject({ via: "carried", storyId: "ok", place: { id: "c" } });
  });

  it("falls back to a draw when every carried question is passed over", () => {
    const stop = choose({
      carried: [{ storyId: "gone", addedAt: 9, toPlaceId: "no-longer-public" }],
    });
    expect(stop?.via).toBe("draw");
  });

  it("orders nothing by merit: a carried question beats a draw whatever the places are", () => {
    const stop = choose({ carried: [{ storyId: "s", addedAt: 1, toPlaceId: "too-far" }] });
    expect(stop).toMatchObject({ via: "carried", place: { id: "too-far" } });
  });
});

describe("carrying a question to a place", () => {
  it("allows up to the carry limit between the pins", () => {
    expect(carryDistance(ORIGIN, northOf(ORIGIN, 180)).allowed).toBe(true);
    expect(carryDistance(ORIGIN, northOf(ORIGIN, CARRY_MAX_METRES - 5)).allowed).toBe(true);
    expect(carryDistance(ORIGIN, northOf(ORIGIN, CARRY_MAX_METRES + 5)).allowed).toBe(false);
    expect(carryDistance(ORIGIN, ORIGIN)).toEqual({ metres: 0, allowed: true });
  });

  it("lists the nearest first within the limit, without the place itself, at most fifty", () => {
    const from = { id: "here", pin: ORIGIN };
    const places = [
      { id: "here", pin: ORIGIN },
      { id: "x", pin: northOf(ORIGIN, 500) },
      { id: "y", pin: northOf(ORIGIN, 100) },
      { id: "z", pin: northOf(ORIGIN, 2000) },
    ];
    expect(nearestCarryTargets(from, places).map(({ id, metres }) => [id, metres])).toEqual([
      ["y", 100],
      ["x", 500],
    ]);
    const many = Array.from({ length: 80 }, (_, n) => ({
      id: `p${n}`,
      pin: northOf(ORIGIN, 10 + n * 5),
    }));
    const found = nearestCarryTargets(from, many);
    expect(found).toHaveLength(CARRY_TARGETS_LIMIT);
    expect(found[0]!.id).toBe("p0");
  });

  it("breaks ties by id, so every viewer sees the same list", () => {
    const pin = northOf(ORIGIN, 100);
    const found = nearestCarryTargets({ id: "here", pin: ORIGIN }, [
      { id: "b", pin },
      { id: "a", pin },
    ]);
    expect(found.map(({ id }) => id)).toEqual(["a", "b"]);
  });
});
