import { describe, expect, it } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import {
  drawStops,
  drawWeight,
  hashString,
  interestsFor,
  isoWeekKey,
  isoWeekday,
  keyedUniform,
  legsOf,
  localDay,
  mulberry32,
  needsCautions,
  NO_STORY_BOOST,
  orderAsWalk,
  passesAvoid,
  QUIET_BOOST_MAX,
  recentSuggestions,
  resolveAvoid,
  resolveInterests,
  sampleWithoutReplacement,
  seededRng,
  TASTE_TILT,
  uniformFromRng,
  walkingLeg,
  wildCardCount,
  type DrawCandidate,
} from "@/lib/draw";
import { regionSchema } from "@/lib/region/schema";

const region = regionSchema.parse(nagasaki);

type Item = DrawCandidate & { id: string };
const quiet = (id: string, over: Partial<DrawCandidate> = {}): Item => ({
  id,
  recentSuggestions: 0,
  hasStory: true,
  matchesInterest: false,
  ...over,
});

/** How often each id is the first pick over many seeded draws. */
function firstPickCounts(items: Item[], runs: number, wildCard = false) {
  const counts = new Map<string, number>();
  for (let seed = 0; seed < runs; seed++) {
    const rng = mulberry32(seed);
    const [first] = sampleWithoutReplacement(
      items,
      1,
      (item) => drawWeight(item, { wildCard }),
      uniformFromRng(rng),
    );
    counts.set(first!.id, (counts.get(first!.id) ?? 0) + 1);
  }
  return counts;
}

describe("seeded randomness", () => {
  it("replays the same sequence from the same seed text and a different one from another", () => {
    const a = seededRng("2026-11-10|suwa");
    const b = seededRng("2026-11-10|suwa");
    const c = seededRng("2026-11-11|suwa");
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("hashes text to the same number every time", () => {
    expect(hashString("noren")).toBe(hashString("noren"));
    expect(hashString("noren")).not.toBe(hashString("noren "));
  });

  it("gives a place the same number whatever else is in the draw", () => {
    const first = keyedUniform("seed", "place-a");
    expect(keyedUniform("seed", "place-a")).toBe(first);
    expect(keyedUniform("seed", "place-b")).not.toBe(first);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
  });
});

describe("drawWeight", () => {
  it("is 3x for a place nobody was sent to, against a place suggested very often", () => {
    const fresh = drawWeight(quiet("a"), { wildCard: false });
    const worn = drawWeight(quiet("b", { recentSuggestions: 10_000 }), { wildCard: false });
    expect(fresh).toBeCloseTo(1 + QUIET_BOOST_MAX);
    expect(worn).toBeCloseTo(1, 2);
    expect(fresh / worn).toBeGreaterThan(2.9);
  });

  it("falls steadily as a place is suggested more often", () => {
    const weights = [0, 1, 2, 5, 10].map((recent) =>
      drawWeight(quiet("a", { recentSuggestions: recent }), { wildCard: false }),
    );
    for (let i = 1; i < weights.length; i++) expect(weights[i]!).toBeLessThan(weights[i - 1]!);
    expect(Math.min(...weights)).toBeGreaterThan(1);
  });

  it("tilts a matching interest by the taste number and nothing else", () => {
    const match = drawWeight(quiet("a", { matchesInterest: true }), { wildCard: false });
    const miss = drawWeight(quiet("a"), { wildCard: false });
    expect(match / miss).toBeCloseTo(TASTE_TILT);
    expect(TASTE_TILT).toBe(3);
  });

  it("ignores interests for a wild card and leans toward a place with no story", () => {
    const withStory = drawWeight(quiet("a", { matchesInterest: true }), { wildCard: true });
    const withoutStory = drawWeight(quiet("a", { hasStory: false, matchesInterest: true }), {
      wildCard: true,
    });
    expect(withoutStory / withStory).toBeCloseTo(NO_STORY_BOOST);
    expect(drawWeight(quiet("a", { matchesInterest: true }), { wildCard: true })).toBe(
      drawWeight(quiet("a"), { wildCard: true }),
    );
  });

  it("does not use whether a place has a story for a regular pick", () => {
    expect(drawWeight(quiet("a", { hasStory: false }), { wildCard: false })).toBe(
      drawWeight(quiet("a", { hasStory: true }), { wildCard: false }),
    );
  });

  it("can ignore the ledger, so asking again cannot change the omikuji", () => {
    const a = drawWeight(quiet("a", { recentSuggestions: 0 }), {
      wildCard: true,
      ignoreExposure: true,
    });
    const b = drawWeight(quiet("a", { recentSuggestions: 50 }), {
      wildCard: true,
      ignoreExposure: true,
    });
    expect(a).toBe(b);
  });

  it("never returns zero or a negative number, so no allowed place is shut out", () => {
    for (const recent of [-5, 0, 3, 1e9])
      for (const wildCard of [true, false])
        expect(
          drawWeight(quiet("a", { recentSuggestions: recent, hasStory: false }), { wildCard }),
        ).toBeGreaterThan(0);
  });
});

describe("weighted sampling without replacement", () => {
  it("is deterministic for a fixed random source", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => quiet(id));
    const run = () =>
      sampleWithoutReplacement(items, 3, () => 1, uniformFromRng(mulberry32(7))).map((i) => i.id);
    expect(run()).toEqual(run());
  });

  it("never picks the same item twice and returns at most what exists", () => {
    const items = ["a", "b", "c"].map((id) => quiet(id));
    const picked = sampleWithoutReplacement(items, 10, () => 1, uniformFromRng(mulberry32(1)));
    expect(new Set(picked).size).toBe(3);
  });

  it("never picks an item with no weight", () => {
    const items = ["a", "b"].map((id) => quiet(id));
    const picked = sampleWithoutReplacement(
      items,
      2,
      (item) => (item.id === "a" ? 0 : 1),
      uniformFromRng(mulberry32(1)),
    );
    expect(picked.map((i) => i.id)).toEqual(["b"]);
  });

  it("picks in proportion to weight, over many seeded draws", () => {
    const items = [quiet("heavy"), quiet("light")];
    let heavy = 0;
    const runs = 4000;
    for (let seed = 0; seed < runs; seed++) {
      const [first] = sampleWithoutReplacement(
        items,
        1,
        (item) => (item.id === "heavy" ? 3 : 1),
        uniformFromRng(mulberry32(seed)),
      );
      if (first!.id === "heavy") heavy++;
    }
    // Expected share 3/4.
    expect(heavy / runs).toBeGreaterThan(0.72);
    expect(heavy / runs).toBeLessThan(0.78);
  });
});

describe("a taste mismatch is still drawable", () => {
  it("draws a place that does not fit the interests, at lower odds but never zero", () => {
    const items = [quiet("fits", { matchesInterest: true }), quiet("misses")];
    const counts = firstPickCounts(items, 4000);
    expect(counts.get("misses") ?? 0).toBeGreaterThan(0);
    // 1 / (1 + TASTE_TILT) of the time.
    expect((counts.get("misses") ?? 0) / 4000).toBeGreaterThan(0.22);
    expect((counts.get("misses") ?? 0) / 4000).toBeLessThan(0.28);
  });

  it("draws a walk made only of places that miss every interest when nothing fits", () => {
    const pool = ["a", "b", "c", "d"].map((id) => quiet(id));
    const stops = drawStops(pool, { count: 3, adventurousness: "familiar", rng: mulberry32(2) });
    expect(stops).toHaveLength(3);
  });
});

describe("the exposure boost", () => {
  it("raises a quiet place's chance over one suggested often this week", () => {
    const items = [quiet("quiet"), quiet("busy", { recentSuggestions: 12 })];
    const counts = firstPickCounts(items, 4000);
    expect(counts.get("quiet")!).toBeGreaterThan(counts.get("busy")! * 1.7);
  });

  it("changes nothing when every place has had the same number of turns", () => {
    const items = [quiet("a", { recentSuggestions: 4 }), quiet("b", { recentSuggestions: 4 })];
    const counts = firstPickCounts(items, 4000);
    expect(Math.abs(counts.get("a")! - counts.get("b")!)).toBeLessThan(250);
  });

  it("counts the last 7 days from this week and the tail of last week", () => {
    expect(recentSuggestions({ thisWeek: 2, lastWeek: 7 }, 1)).toBeCloseTo(2 + 6);
    expect(recentSuggestions({ thisWeek: 2, lastWeek: 7 }, 4)).toBeCloseTo(2 + 3);
    expect(recentSuggestions({ thisWeek: 2, lastWeek: 7 }, 7)).toBeCloseTo(2);
  });
});

describe("wild cards", () => {
  it("count by adventurousness: familiar 0, mixed 1, surprise 2 out of 3 stops", () => {
    expect(wildCardCount("familiar", 3)).toBe(0);
    expect(wildCardCount("mixed", 3)).toBe(1);
    expect(wildCardCount("surprise", 3)).toBe(2);
  });

  it("keep the same shares for other sizes and never exceed the stops", () => {
    for (let stops = 1; stops <= 5; stops++) {
      expect(wildCardCount("familiar", stops)).toBe(0);
      expect(wildCardCount("mixed", stops)).toBeLessThanOrEqual(wildCardCount("surprise", stops));
      expect(wildCardCount("surprise", stops)).toBeLessThanOrEqual(stops);
    }
    expect(wildCardCount("mixed", 5)).toBe(2);
    expect(wildCardCount("surprise", 5)).toBe(4);
    expect(wildCardCount("surprise", 1)).toBe(1);
  });

  it("flags exactly that many stops as wild cards in a draw", () => {
    const pool = Array.from({ length: 12 }, (_, i) => quiet(`p${i}`));
    for (const [adventurousness, wild] of [
      ["familiar", 0],
      ["mixed", 1],
      ["surprise", 2],
    ] as const) {
      const stops = drawStops(pool, { count: 3, adventurousness, rng: mulberry32(11) });
      expect(stops).toHaveLength(3);
      expect(stops.filter((s) => s.wildCard)).toHaveLength(wild);
      expect(new Set(stops.map((s) => s.candidate.id)).size).toBe(3);
    }
  });

  it("draw ignoring interests and lean toward places with no story yet", () => {
    // Four places match the interest and have stories; four do not match and have none.
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => quiet(`fit${i}`, { matchesInterest: true })),
      ...Array.from({ length: 4 }, (_, i) => quiet(`new${i}`, { hasStory: false })),
    ];
    let wildFromNew = 0;
    let wildTotal = 0;
    for (let seed = 0; seed < 600; seed++) {
      const stops = drawStops(pool, {
        count: 1,
        adventurousness: "surprise",
        rng: mulberry32(seed),
      });
      expect(stops[0]!.wildCard).toBe(true);
      wildTotal++;
      if (stops[0]!.candidate.id.startsWith("new")) wildFromNew++;
    }
    // With a 3x nudge and equal numbers, about 75 percent. Interests would have pushed the other way.
    expect(wildFromNew / wildTotal).toBeGreaterThan(0.68);
    expect(wildFromNew / wildTotal).toBeLessThan(0.82);
  });

  it("returns fewer stops when the pool is small", () => {
    const stops = drawStops([quiet("a")], {
      count: 3,
      adventurousness: "mixed",
      rng: mulberry32(1),
    });
    expect(stops).toHaveLength(1);
  });
});

describe("hard rules", () => {
  it("apply the ones Noren can check and report the ones it cannot", () => {
    const rules = resolveAvoid(
      ["cash-free", "step-free", "vegetarian", "no alcohol", "quiet"],
      region,
    );
    expect(rules.applied.map((r) => r.tag)).toEqual(["cash-free", "step-free", "no alcohol"]);
    expect(rules.notChecked.map((r) => r.tag)).toEqual(["vegetarian", "quiet"]);
    expect(rules.notChecked[0]!.reason).toMatch(/no menu or ingredient data/);
    expect([...rules.excludedCautions].toSorted()).toEqual(["accessibility_steps", "cash_only"]);
    expect([...rules.excludedCategories]).toEqual(["bar"]);
    expect(needsCautions(rules)).toBe(true);
  });

  it("say what each applied rule cannot see, so nobody reads too much into it", () => {
    const [rule] = resolveAvoid(["cashless"], region).applied;
    expect(rule!.checks).toMatch(/cash only/);
    expect(rule!.limit).toMatch(/cannot tell/);
  });

  it("exclude places by category or by confirmed caution", () => {
    const rules = resolveAvoid(["cash-free", "no-alcohol"], region);
    expect(passesAvoid(rules, { category: "bar", cautions: [] })).toBe(false);
    expect(passesAvoid(rules, { category: "cafe", cautions: ["cash_only"] })).toBe(false);
    expect(passesAvoid(rules, { category: "cafe", cautions: ["seasonal"] })).toBe(true);
    expect(passesAvoid(rules, { category: undefined, cautions: [] })).toBe(true);
  });

  it("ignore repeats and spelling variants of a tag", () => {
    const rules = resolveAvoid(["Cash Free", "cash_free", " CASH-FREE "], region);
    expect(rules.applied).toHaveLength(1);
  });

  it("do not apply a rule when the region has no such caution", () => {
    const sparse = {
      ...region,
      cautionVocabulary: region.cautionVocabulary.filter((c) => c.key !== "cash_only"),
    };
    const rules = resolveAvoid(["cash-free"], sparse);
    expect(rules.applied).toEqual([]);
    expect(rules.notChecked).toHaveLength(1);
  });

  it("filter a pool so an excluded place is never drawn", () => {
    const rules = resolveAvoid(["no-alcohol"], region);
    const pool = [
      { id: "bar1", category: "bar", cautions: [] as string[] },
      { id: "cafe1", category: "cafe", cautions: [] as string[] },
      { id: "cafe2", category: "cafe", cautions: [] as string[] },
    ].filter((place) => passesAvoid(rules, place));
    for (let seed = 0; seed < 50; seed++) {
      const drawn = drawStops(
        pool.map((p) => ({ ...p, recentSuggestions: 0, hasStory: true, matchesInterest: false })),
        { count: 3, adventurousness: "surprise", rng: mulberry32(seed) },
      );
      expect(drawn.map((d) => d.candidate.id)).not.toContain("bar1");
    }
  });
});

describe("interests", () => {
  it("map to categories and keep the traveller's own word", () => {
    const resolved = resolveInterests(["History", "coffee", "gardening"], region);
    expect(resolved.unmatched).toEqual(["gardening"]);
    expect(interestsFor(resolved, "museum")).toEqual(["History"]);
    expect(interestsFor(resolved, "cafe")).toEqual(["coffee"]);
    expect(interestsFor(resolved, "bar")).toEqual([]);
    expect(interestsFor(resolved, undefined)).toEqual([]);
  });

  it("accept a category name as an interest", () => {
    const resolved = resolveInterests(["music-shop"], region);
    expect(interestsFor(resolved, "music_shop")).toEqual(["music-shop"]);
  });
});

describe("walking order and legs", () => {
  const start = { lat: 32.7437, lng: 129.8728 };
  const near = { pin: { lat: 32.7442, lng: 129.8731 }, id: "near" };
  const mid = { pin: { lat: 32.7415, lng: 129.8755 }, id: "mid" };
  const far = { pin: { lat: 32.7352, lng: 129.8703 }, id: "far" };

  it("goes to the nearest stop each time, from the start", () => {
    expect(orderAsWalk(start, [far, near, mid]).map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("works out each leg from the one before, with minutes of at least one", () => {
    const ordered = orderAsWalk(start, [far, near, mid]);
    const legs = legsOf(start, ordered);
    expect(legs).toHaveLength(3);
    expect(legs[0]!.minutes).toBeGreaterThanOrEqual(1);
    expect(legs[1]).toEqual(walkingLeg(near.pin, mid.pin));
    expect(walkingLeg(start, start)).toEqual({ metres: 0, minutes: 1 });
  });

  it("estimates metres with a detour and a walking pace", () => {
    // About 1,000 m in a straight line: 1,300 m on foot and 16 minutes at 80 m a minute.
    const leg = walkingLeg({ lat: 32.75, lng: 129.87 }, { lat: 32.75, lng: 129.8806 });
    expect(leg.metres).toBeGreaterThan(1200);
    expect(leg.metres).toBeLessThan(1400);
    expect(leg.minutes).toBeGreaterThanOrEqual(15);
    expect(leg.minutes).toBeLessThanOrEqual(18);
  });
});

describe("dates in Japan time", () => {
  const OFFSET = 9;
  it("names the day and weekday in the region's offset", () => {
    // 2026-11-10 20:00 UTC is already 2026-11-11 05:00 in Japan, a Wednesday.
    const instant = Date.UTC(2026, 10, 10, 20, 0, 0);
    expect(localDay(instant, OFFSET)).toBe("2026-11-11");
    expect(localDay(instant, 0)).toBe("2026-11-10");
    expect(isoWeekday(instant, OFFSET)).toBe(3);
  });

  it("names ISO weeks, including the turn of a year", () => {
    expect(isoWeekKey(Date.UTC(2026, 10, 10, 3), OFFSET)).toBe("2026-W46");
    expect(isoWeekKey(Date.UTC(2026, 0, 1, 3), OFFSET)).toBe("2026-W01");
    // 1 Jan 2027 is a Friday in ISO week 53 of 2026.
    expect(isoWeekKey(Date.UTC(2027, 0, 1, 3), OFFSET)).toBe("2026-W53");
    expect(isoWeekKey(Date.UTC(2027, 0, 4, 3), OFFSET)).toBe("2027-W01");
  });

  it("sorts week names as plain text", () => {
    const keys = ["2026-W09", "2026-W10", "2025-W52", "2026-W46"];
    expect(keys.toSorted()).toEqual(["2025-W52", "2026-W09", "2026-W10", "2026-W46"]);
  });
});
