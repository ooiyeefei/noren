import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/trip";
import type { Candidate, Plan, Stop, TripRequest } from "@/lib/trip/types";
import { checkPlan, foodCategory, observe, referenceDate, rulesAt, stopsOf, verdictOf, type Fault } from "../fixtures/trip-check";
import { pairBase, traveller } from "../fixtures/trip-parties";
import { PLACES, REGION, world } from "../fixtures/trip-world";

// Invariant 10 (SC-303, SC-304): with the seed and the places fixed, changing one answer of the
// party changes only stops that depend on it. The test does not know which stops will change, only
// what may explain a change, so it works the explanation out from the two requests and the world:
//
//   because     the stop's reason differs between the two plans;
//   not met     the old place has a not-met verdict under the new party (the rule left it out);
//   tilt        the old or the new place has a met verdict for a rule only one of the parties has;
//   rhythm      the answer changed was a rhythm or a limit and the stop's time or presence changed;
//   taken       the old place was taken by an earlier slot that changed, or the new place was held
//               by an earlier slot of the old plan that changed;
//   shifted     the stop's time moved after another stop of its day changed.
//
// A verdict depends only on a place and a rule, so "its checks differ" cannot explain a different
// place by itself: it is covered by "not met" and "tilt", which are the two ways a rule moves a draw.
// A changed stop with none of these fails, and the failure names what was looked for.

const PAIR_SEEDS = ["pair-a", "pair-b", "pair-c"] as const;
const BY_ID = new Map<string, Candidate>(PLACES.map((place) => [place.placeId, place]));

type Pair = {
  name: string;
  /** "rule": a rule or a traveller; "rhythm": a limit, a meal time, fullness, a need, a rest or days; "taste": likes or skips. */
  kind: "rule" | "rhythm" | "taste";
  /** For "taste": the keys of the travellers whose likes or skips differ. */
  changed?: string[];
  a?: (base: TripRequest) => TripRequest;
  b: (base: TripRequest) => TripRequest;
};

function withParty(base: TripRequest, change: (party: TripRequest["party"]) => TripRequest["party"]): TripRequest {
  return { ...base, party: change(structuredClone(base.party)) };
}

const PAIRS: Pair[] = [
  {
    name: "add a traveller who needs step-free",
    kind: "rule",
    b: (base) =>
      withParty(base, (party) => ({
        ...party,
        travellers: [...party.travellers, traveller("t3", "adult", { rules: ["step-free"] })],
      })),
  },
  {
    name: "add a toddler who rests after lunch",
    kind: "rhythm",
    b: (base) =>
      withParty(base, (party) => ({
        ...party,
        travellers: [...party.travellers, traveller("t3", "toddler", { rests: { after: "lunch", minutes: 60 } })],
      })),
  },
  {
    name: "halve the longest drive (the stretch limit, 120 to 60 minutes)",
    kind: "rhythm",
    b: (base) => withParty(base, (party) => ({ ...party, limits: { ...party.limits, stretchMinutes: 60 } })),
  },
  {
    name: "lower the daily driving limit (420 to 330 minutes)",
    kind: "rhythm",
    b: (base) => withParty(base, (party) => ({ ...party, limits: { ...party.limits, dayDriveMinutes: 330 } })),
  },
  {
    name: "change light to full",
    kind: "rhythm",
    a: (base) => withParty(base, (party) => ({ ...party, fullness: "light" })),
    b: (base) => withParty(base, (party) => ({ ...party, fullness: "full" })),
  },
  {
    name: "add halal",
    kind: "rule",
    b: (base) =>
      withParty(base, (party) => {
        party.travellers[0]!.rules = ["halal"];
        return party;
      }),
  },
  {
    name: "move lunch by an hour",
    kind: "rhythm",
    b: (base) => withParty(base, (party) => ({ ...party, meals: { ...party.meals, lunch: "13:30" } })),
  },
  {
    name: "add a prayer time",
    kind: "rhythm",
    b: (base) =>
      withParty(base, (party) => ({ ...party, needs: [...party.needs, { kind: "prayer", at: "13:15", minutes: 20 }] })),
  },
  {
    name: "add vegetarian",
    kind: "rule",
    b: (base) =>
      withParty(base, (party) => {
        party.travellers[1]!.rules = ["vegetarian"];
        return party;
      }),
  },
  {
    name: "add a traveller who is on days 3 to 5 only",
    kind: "rhythm",
    b: (base) =>
      withParty(base, (party) => ({
        ...party,
        travellers: [...party.travellers, traveller("t3", "adult", { rules: ["pork-free"], days: [3, 4, 5] })],
      })),
  },
  {
    name: "add a like",
    kind: "taste",
    changed: ["t1"],
    b: (base) =>
      withParty(base, (party) => {
        party.travellers[0]!.likes = [...party.travellers[0]!.likes, "art"];
        return party;
      }),
  },
  {
    name: "swap two travellers' likes",
    kind: "taste",
    changed: ["t1", "t2"],
    b: (base) =>
      withParty(base, (party) => {
        const [first, second] = party.travellers as [(typeof party.travellers)[number], (typeof party.travellers)[number]];
        [first.likes, second.likes] = [second.likes, first.likes];
        return party;
      }),
  },
  {
    name: "put a traveller on days 1 and 2 only",
    kind: "rhythm",
    b: (base) =>
      withParty(base, (party) => {
        party.travellers[1]!.days = [1, 2];
        return party;
      }),
  },
  {
    name: "add a skip",
    kind: "taste",
    changed: ["t1"],
    b: (base) =>
      withParty(base, (party) => {
        party.travellers[0]!.skips = ["music"];
        return party;
      }),
  },
  {
    name: "add a need for somewhere to work",
    kind: "rhythm",
    b: (base) =>
      withParty(base, (party) => ({ ...party, needs: [...party.needs, { kind: "work", at: "10:30", minutes: 60 }] })),
  },
];

function runPlan(request: TripRequest, seed: string): { plan: Plan; faults: Fault[] } {
  const observed = observe(world(seed));
  const plan = planTrip(request, observed.world);
  const faults = checkPlan(plan, { request, world: world(seed), seen: observed.seen });
  return { plan, faults };
}

function describeFaults(faults: Fault[]): string[] {
  return faults.map((fault) => `invariant ${fault.invariant}, ${fault.where}: ${fault.message}`);
}

function placeKey(stop: Stop | undefined): string | undefined {
  if (stop === undefined) return undefined;
  return "placeId" in stop.place ? stop.place.placeId : `pin:${stop.place.pinId}`;
}

function dayOfSlot(slot: string): number {
  return Number(/^d(\d+)\./.exec(slot)![1]);
}

function candidateOf(stop: Stop | undefined): Candidate | undefined {
  return stop !== undefined && "placeId" in stop.place ? BY_ID.get(stop.place.placeId) : undefined;
}

type Explanation = { slot: string; was?: string; now?: string; because: string[] };

/** Every slot whose place differs between two plans, with what explains it (empty when nothing does). */
function explainChanges(pair: Pair, requestA: TripRequest, requestB: TripRequest, planA: Plan, planB: Plan): Explanation[] {
  const stopsA = new Map(stopsOf(planA).map((entry) => [entry.stop.slot, entry.stop]));
  const stopsB = new Map(stopsOf(planB).map((entry) => [entry.stop.slot, entry.stop]));
  const slots = [...new Set([...stopsA.keys(), ...stopsB.keys()])];
  const changed = new Set(slots.filter((slot) => placeKey(stopsA.get(slot)) !== placeKey(stopsB.get(slot))));
  const byPlaceA = new Map([...stopsA].map(([slot, stop]) => [placeKey(stop)!, slot]));
  const byPlaceB = new Map([...stopsB].map(([slot, stop]) => [placeKey(stop)!, slot]));
  const referenceA = referenceDate(requestA, { today: "2026-12-01" });
  const referenceB = referenceDate(requestB, { today: "2026-12-01" });
  const result: Explanation[] = [];

  for (const slot of [...changed].sort()) {
    const a = stopsA.get(slot);
    const b = stopsB.get(slot);
    const day = dayOfSlot(slot);
    const found: string[] = [];

    if (a !== undefined && b !== undefined && JSON.stringify(a.because) !== JSON.stringify(b.because)) {
      found.push(`because: ${JSON.stringify(a.because)} became ${JSON.stringify(b.because)}`);
    }

    const oldPlace = candidateOf(a);
    if (oldPlace !== undefined) {
      for (const rule of rulesAt(requestB, day, oldPlace.category)) {
        if (verdictOf(rule, oldPlace, REGION, referenceB).verdict === "not_met") {
          found.push(`not met: the old place ${oldPlace.placeId} is not met for ${rule} under the new party`);
        }
      }
    }

    for (const [side, place] of [["old", oldPlace], ["new", candidateOf(b)]] as const) {
      if (place === undefined) continue;
      const rulesOld = rulesAt(requestA, day, place.category);
      const rulesNew = rulesAt(requestB, day, place.category);
      const onlyNew = rulesNew.filter((rule) => !rulesOld.includes(rule));
      const onlyOld = rulesOld.filter((rule) => !rulesNew.includes(rule));
      for (const rule of onlyNew) {
        if (verdictOf(rule, place, REGION, referenceB).verdict === "met") found.push(`tilt: the ${side} place ${place.placeId} meets ${rule}, which only the new party has`);
      }
      for (const rule of onlyOld) {
        if (verdictOf(rule, place, REGION, referenceA).verdict === "met") found.push(`tilt: the ${side} place ${place.placeId} meets ${rule}, which only the old party had`);
      }
    }

    if (pair.kind === "taste") {
      for (const [side, stop] of [["old", a], ["new", b]] as const) {
        const because = stop?.because;
        if (because !== undefined && (because.kind === "turn" || because.kind === "paired")) {
          const involved = because.kind === "turn" ? [because.for] : [because.for, because.with];
          if (involved.some((key) => pair.changed?.includes(key))) {
            found.push(`taste: the ${side} stop is the turn of a traveller whose likes or skips changed`);
          }
        }
      }
    }

    if (pair.kind === "rhythm" && (a === undefined || b === undefined || a.at !== b.at)) {
      found.push(`rhythm: the time or presence of the stop changed (${a?.at ?? "absent"} to ${b?.at ?? "absent"}) and so did a rhythm or limit`);
    }

    const oldKey = placeKey(a);
    const takenIn = oldKey === undefined ? undefined : byPlaceB.get(oldKey);
    if (takenIn !== undefined && takenIn !== slot && dayOfSlot(takenIn) <= day && changed.has(takenIn)) {
      found.push(`taken: the old place is now at ${takenIn}, an earlier slot that changed`);
    }
    const newKey = placeKey(b);
    const heldIn = newKey === undefined ? undefined : byPlaceA.get(newKey);
    if (heldIn !== undefined && heldIn !== slot && dayOfSlot(heldIn) <= day && changed.has(heldIn)) {
      found.push(`taken: the new place was held by ${heldIn} in the old plan, an earlier slot that changed`);
    }

    if (a !== undefined && b === undefined) {
      // Squeezed out: the day ran out of time after an earlier stop of the same day changed, and the
      // plan says so with the day-end reason code (orchestrator ruling 5).
      const order = stopsOf(planA).filter((entry) => entry.day === day).map((entry) => entry.stop.slot);
      const earlierChanged = order.slice(0, order.indexOf(slot)).find((other) => changed.has(other));
      const reported = planB.unmet.some((entry) => entry.day === day && entry.detail === "day_end");
      if (earlierChanged !== undefined && reported) {
        found.push(`squeezed out: gone after ${earlierChanged} changed, reported as day_end`);
      }
    }

    if (a !== undefined && b !== undefined && a.at !== b.at) {
      const other = [...changed].find((candidate) => candidate !== slot && dayOfSlot(candidate) === day);
      if (other !== undefined) found.push(`shifted: its time moved from ${a.at} to ${b.at} after ${other} changed`);
    }

    result.push({ slot, was: placeKey(a), now: placeKey(b), because: found });
  }
  return result;
}

describe("invariant 10: explained differences", () => {
  for (const pair of PAIRS) {
    describe(pair.name, () => {
      it.each([...PAIR_SEEDS])("seed %s: every changed stop has a dependency the invariant allows", (seed) => {
        const requestA = (pair.a ?? ((base: TripRequest) => base))(pairBase());
        const requestB = pair.b(pairBase());
        const a = runPlan(requestA, seed);
        const b = runPlan(requestB, seed);
        expect(describeFaults(a.faults), "the first plan").toEqual([]);
        expect(describeFaults(b.faults), "the second plan").toEqual([]);
        expect(a.plan.days, "the first plan was made").toHaveLength(5);
        expect(b.plan.days, "the second plan was made").toHaveLength(5);

        const explained = explainChanges(pair, requestA, requestB, a.plan, b.plan);
        const unexplained = explained
          .filter((entry) => entry.because.length === 0)
          .map(
            (entry) =>
              `${entry.slot}: ${entry.was ?? "no stop"} became ${entry.now ?? "no stop"} with no dependency on "${pair.name}" (looked for: because, not met, tilt, ${pair.kind === "taste" ? "a turn of a changed traveller, " : ""}${pair.kind === "rhythm" ? "time or presence from a rhythm change, " : ""}taken by an earlier changed slot, time shifted, squeezed out by the day end)`,
          );
        expect(unexplained).toEqual([]);
      });
    });
  }

  it("there are twelve pairs or more", () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(12);
  });

  it("the answers do change something: most pairs give a different plan", () => {
    const differing = PAIRS.filter((pair) => {
      const a = runPlan((pair.a ?? ((base: TripRequest) => base))(pairBase()), PAIR_SEEDS[0]).plan;
      const b = runPlan(pair.b(pairBase()), PAIR_SEEDS[0]).plan;
      return JSON.stringify(a) !== JSON.stringify(b);
    });
    expect(differing.length).toBeGreaterThanOrEqual(PAIRS.length - 2);
  });

  it("add halal: every place to eat lists halal, with a record or without one", () => {
    const requestB = PAIRS.find((pair) => pair.name === "add halal")!.b(pairBase());
    for (const seed of PAIR_SEEDS) {
      const { plan } = runPlan(requestB, seed);
      const foodStops = stopsOf(plan).filter((entry) => {
        const category = candidateOf(entry.stop)?.category;
        return foodCategory(category);
      });
      expect(foodStops.length).toBeGreaterThan(0);
      for (const entry of foodStops) {
        expect(entry.stop.checks.map((check) => check.rule), entry.stop.slot).toContain("halal");
      }
    }
  });

  it("add a prayer time: each day has a stop or a rest for it", () => {
    const requestB = PAIRS.find((pair) => pair.name === "add a prayer time")!.b(pairBase());
    const { plan } = runPlan(requestB, PAIR_SEEDS[0]);
    for (const day of plan.days) {
      const served = day.items.filter(
        (item) => (item.kind === "stop" && /\.need\d+$/.test(item.slot)) || (item.kind === "rest" && item.why === "need"),
      );
      expect(served, `day ${day.index}`).toHaveLength(1);
    }
  });
});

describe("a rule no record can check", () => {
  // `vegan` has no record anywhere in the made-up world, so it can neither leave a place out nor
  // tilt the draw. Adding it changes no stop and no time; every place to eat lists it as not known.
  const base = pairBase();
  const withVegan = withParty(base, (party) => {
    party.travellers[0]!.rules = ["vegan"];
    return party;
  });

  it("the world holds no record for it", () => {
    const records = PLACES.flatMap((place) => place.facts).filter((fact) => fact.key === "vegan_dishes");
    expect(records).toEqual([]);
    const negative = PLACES.flatMap((place) => place.facts).filter(
      (fact) => fact.key === "vegetarian_dishes" && fact.value === "no",
    );
    expect(negative).toEqual([]);
  });

  it.each([...PAIR_SEEDS])("seed %s: the same stops, and every place to eat lists the rule as not known", (seed) => {
    const a = runPlan(base, seed);
    const b = runPlan(withVegan, seed);
    expect(describeFaults(a.faults)).toEqual([]);
    expect(describeFaults(b.faults)).toEqual([]);
    expect(b.plan.days).toHaveLength(5);

    // Take the vegan entries out of the second plan and nothing else differs.
    const stripped = structuredClone(b.plan);
    for (const day of stripped.days) {
      for (const item of day.items) {
        if (item.kind === "stop") item.checks = item.checks.filter((check) => check.rule !== "vegan");
      }
    }
    expect(stripped).toEqual(a.plan);

    const reference = referenceDate(withVegan, { today: "2026-12-01" });
    let foodStops = 0;
    for (const entry of stopsOf(b.plan)) {
      const candidate = candidateOf(entry.stop);
      if (candidate === undefined) continue;
      const entryForRule = entry.stop.checks.find((check) => check.rule === "vegan");
      if (foodCategory(candidate.category, REGION)) {
        foodStops += 1;
        const expected = verdictOf("vegan", candidate, REGION, reference);
        expect(expected.verdict, candidate.placeId).toBe("not_known");
        expect(entryForRule, entry.stop.slot).toEqual({ rule: "vegan", verdict: "not_known", reason: "no_record" });
      } else {
        expect(entryForRule, `${entry.stop.slot} is not a place to eat`).toBeUndefined();
      }
    }
    expect(foodStops).toBeGreaterThan(0);
  });
});
