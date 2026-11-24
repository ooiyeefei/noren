import { describe, expect, it } from "vitest";
import { anchorsFor, planTrip } from "@/lib/trip";
import type { Candidate, KeptStop, Plan, TripRequest } from "@/lib/trip/types";
import { checkPlan, observe, stopsOf, type Fault } from "../fixtures/trip-check";
import { PARTIES, SEEDS, sampleRoute, setParty, traveller } from "../fixtures/trip-parties";
import { PLACES, REGION, haversineMetres, withRankingFields, world } from "../fixtures/trip-world";

// SC-302: twenty parties on the sample route, five seeds each, a hundred plans. Invariants 1 to 5,
// 9 and 11 of contracts/engine.md hold on every one, judged by tests/fixtures/trip-check.ts, which
// is written apart from the engine's own checker. One fault is a failure.

type Run = { plan: Plan; seen: ReadonlySet<string>; queries: { near: { lat: number; lng: number }; withinMetres: number }[] };

function run(request: TripRequest, seed: string, places?: readonly Candidate[]): Run {
  const observed = observe(world(seed, { places }));
  const plan = planTrip(request, observed.world);
  return { plan, seen: observed.seen, queries: observed.queries };
}

const cache = new Map<string, Run>();
function cached(index: number, seed: string): Run {
  const key = `${index}|${seed}`;
  let result = cache.get(key);
  if (result === undefined) {
    result = run(PARTIES[index]!.request, seed);
    cache.set(key, result);
  }
  return result;
}

function describeFaults(faults: Fault[]): string[] {
  return faults.map((fault) => `invariant ${fault.invariant}, ${fault.where}: ${fault.message}`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("the fixtures", () => {
  it("hold twenty parties and five seeds", () => {
    expect(PARTIES).toHaveLength(20);
    expect(SEEDS).toHaveLength(5);
  });
});

describe("invariants 1 to 5 on a hundred plans", () => {
  PARTIES.forEach((party, index) => {
    describe(party.name, () => {
      it.each([...SEEDS])("seed %s: no fault", (seed) => {
        const { plan, seen } = cached(index, seed);
        const faults = checkPlan(plan, { request: party.request, world: world(seed), seen });
        expect(describeFaults(faults)).toEqual([]);
      });

      it.each([...SEEDS])("seed %s: the plan is made and is not empty", (seed) => {
        // Every sample-route party can be driven inside its limit or its guess, so a plan with no
        // days would pass the checker for nothing.
        const { plan } = cached(index, seed);
        expect(plan.days).toHaveLength(5);
        const stops = stopsOf(plan);
        expect(stops.length).toBeGreaterThanOrEqual(10);
        for (const day of plan.days) expect(day.items.length).toBeGreaterThan(0);
      });
    });
  });

  it("the party that sets no limits has day 1 named as over the guess, and only that day", () => {
    const index = PARTIES.findIndex((party) => party.name === "no limits set");
    for (const seed of SEEDS) {
      const { plan } = cached(index, seed);
      const over = plan.unmet.filter((entry) => entry.what === "dayDrive");
      expect(over.map((entry) => entry.day)).toEqual([1]);
      expect(over[0]!.choices).toHaveLength(3);
      expect(plan.days[0]!.driveMinutes).toBeGreaterThan(REGION.trip!.guesses.dayDriveMinutes);
    }
  });

  it("a traveller who joins on day 3 has their rule checked on days 3 to 5 only", () => {
    const index = PARTIES.findIndex((party) => party.name === "traveller who joins on day 3");
    const { plan } = cached(index, SEEDS[0]);
    for (const day of plan.days) {
      const listed = day.items.some(
        (item) => item.kind === "stop" && item.checks.some((check) => check.rule === "pork-free"),
      );
      const foodStop = day.items.some((item) => item.kind === "stop" && /\.(lunch|dinner)$/.test(item.slot));
      if (day.index < 3) expect(listed, `day ${day.index} lists a rule of someone who is not there`).toBe(false);
      else if (foodStop) expect(listed, `day ${day.index} leaves out pork-free at a meal`).toBe(true);
    }
  });
});

describe("what the engine asks the world for", () => {
  it("is only the spots anchorsFor lists, at most twelve, for every party", () => {
    PARTIES.forEach((party, index) => {
      const anchors = anchorsFor(party.request, REGION);
      expect(anchors.length, party.name).toBeLessThanOrEqual(12);
      expect(anchors.length, party.name).toBeGreaterThan(0);
      const { queries } = cached(index, SEEDS[0]);
      for (const query of queries) {
        const known = anchors.some(
          (anchor) => anchor.withinMetres === query.withinMetres && haversineMetres(anchor.near, query.near) < 0.5,
        );
        expect(known, `${party.name} asked about ${JSON.stringify(query)}`).toBe(true);
      }
    });
  });
});

describe("invariant 9: same seed, same plan", () => {
  it("gives deeply equal plans for equal inputs, and leaves the request alone", () => {
    PARTIES.forEach((party, index) => {
      const before = clone(party.request);
      const first = run(party.request, SEEDS[0]).plan;
      const second = run(party.request, SEEDS[0]).plan;
      expect(second, party.name).toEqual(first);
      expect(party.request, `${party.name}: the request was changed`).toEqual(before);
      expect(cached(index, SEEDS[0]).plan, party.name).toEqual(first);
    });
  });

  it("gives a different plan for a different seed, for at least one party", () => {
    const differing = PARTIES.filter((_, index) => {
      const a = cached(index, SEEDS[0]).plan;
      const b = cached(index, SEEDS[1]).plan;
      return JSON.stringify(a) !== JSON.stringify(b);
    });
    expect(differing.length).toBeGreaterThan(0);
  });
});

describe("invariant 11: nothing is ranked", () => {
  it.each(["high", "low", "mixed"] as const)(
    "a rating and a story count on every candidate (%s) change nothing",
    (flavour) => {
      const ranked = withRankingFields(PLACES, flavour);
      PARTIES.forEach((party, index) => {
        const expected = cached(index, SEEDS[0]).plan;
        const actual = run(party.request, SEEDS[0], ranked).plan;
        expect(actual, party.name).toEqual(expected);
      });
    },
  );

  it("carries no rating, rank, score or count in any plan", () => {
    const banned = /rating|rank|score|popular|review|storyCount|stories/i;
    PARTIES.forEach((party, index) => {
      const keys = new Set<string>();
      const walk = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (typeof value === "object" && value !== null) {
          for (const [key, inner] of Object.entries(value)) {
            keys.add(key);
            walk(inner);
          }
        }
      };
      walk(cached(index, SEEDS[0]).plan);
      expect([...keys].filter((key) => banned.test(key)), party.name).toEqual([]);
    });
  });
});

describe("invariant 5: kept stops", () => {
  const request = sampleRoute(
    setParty([
      traveller("t1", "adult", { rules: ["step-free"], likes: ["history", "food"] }),
      traveller("t2", "adult", { likes: ["coffee"] }),
    ]),
  );
  const seed = "keep-seed";
  const first = run(request, seed).plan;
  const open = stopsOf(first).filter((entry) => /\.open\d+$/.test(entry.stop.slot));
  const keptFrom = (entry: (typeof open)[number], hold: "time" | "place"): KeptStop => ({
    slot: entry.stop.slot,
    day: entry.day,
    place: entry.stop.place,
    hold,
    at: entry.stop.at,
    minutes: entry.stop.minutes,
    because: entry.stop.because,
  });

  it("the first plan has open stops to keep", () => {
    expect(open.length).toBeGreaterThanOrEqual(2);
  });

  it("keeping every stop (half by time, half by place) gives the same places, and the times held", () => {
    const everything = stopsOf(first).filter((entry) => !entry.stop.slot.includes(".pin."));
    const keep = everything.map((entry, i) => keptFrom(entry, i % 2 === 0 ? "time" : "place"));
    const again = run({ ...request, keep: { stops: keep } }, seed);
    const faults = checkPlan(again.plan, { request: { ...request, keep: { stops: keep } }, world: world(seed), seen: again.seen });
    expect(describeFaults(faults)).toEqual([]);
    const placeOf = (plan: Plan, slot: string) => stopsOf(plan).find((entry) => entry.stop.slot === slot)?.stop.place;
    for (const kept of keep) expect(placeOf(again.plan, kept.slot), kept.slot).toEqual(kept.place);
  });

  it("a kept place that is gone is replaced and listed in moved; one held by time that now fails a rule stays", () => {
    const heldByTime = open[0]!;
    const heldByPlace = open.at(-1)!;
    expect(heldByPlace.stop.slot).not.toBe(heldByTime.stop.slot);
    const keep = [keptFrom(heldByTime, "time"), keptFrom(heldByPlace, "place")];
    const id = (entry: typeof heldByTime) => ("placeId" in entry.stop.place ? entry.stop.place.placeId : "");

    // The place held by time now has a fresh record against step-free; the place held by place is gone.
    const changed: Candidate[] = PLACES.filter((place) => place.placeId !== id(heldByPlace)).map((place) =>
      place.placeId === id(heldByTime)
        ? {
            ...place,
            facts: [
              ...place.facts,
              { key: "steps_at_door", value: "yes", basis: "member", day: "2026-11-20", factId: "test-fact-late" },
            ],
          }
        : place,
    );
    const withKeep = { ...request, keep: { stops: keep } };
    const again = run(withKeep, seed, changed);
    const faults = checkPlan(again.plan, { request: withKeep, world: world(seed, { places: changed }), seen: again.seen, places: changed });
    expect(describeFaults(faults)).toEqual([]);

    const now = (slot: string) => stopsOf(again.plan).find((entry) => entry.stop.slot === slot)?.stop;
    expect(now(heldByTime.stop.slot)?.place).toEqual(heldByTime.stop.place);
    expect(now(heldByTime.stop.slot)?.at).toBe(heldByTime.stop.at);
    expect(now(heldByPlace.stop.slot)?.place).not.toEqual(heldByPlace.stop.place);
    expect(again.plan.moved?.map((entry) => entry.slot)).toContain(heldByPlace.stop.slot);
  });
});
