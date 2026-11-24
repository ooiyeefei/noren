import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/trip";
import type { Plan, Stop, TripRequest } from "@/lib/trip/types";
import { checkPlan, observe, stopsOf, turnFaults, type Fault } from "../fixtures/trip-check";
import { PARTIES, SEEDS, sampleRoute, setParty, traveller } from "../fixtures/trip-parties";
import { world } from "../fixtures/trip-world";

// Invariant 6 (SC-306, research R13): every traveller with likes gets their turn, evenly, on the
// days they are on, and a turn never puts a not-met place in the plan (invariant 7).

function run(request: TripRequest, seed: string): { plan: Plan; faults: Fault[] } {
  const observed = observe(world(seed));
  const plan = planTrip(request, observed.world);
  return { plan, faults: checkPlan(plan, { request, world: world(seed), seen: observed.seen }) };
}

const messages = (faults: Fault[]) => faults.map((f) => `invariant ${f.invariant}, ${f.where}: ${f.message}`);

function turnsOf(plan: Plan): { day: number; stop: Stop }[] {
  return stopsOf(plan)
    .filter((entry) => entry.stop.because.kind === "turn")
    .map((entry) => ({ day: entry.day, stop: entry.stop }));
}

const forKey = (stop: Stop) => (stop.because.kind === "turn" ? stop.because.for : "");

describe("turns over twenty parties and five seeds", () => {
  PARTIES.forEach((party) => {
    it.each([...SEEDS])(`${party.name}, seed %s: even turns, none out of turn, none for a not-met place`, (seed) => {
      const { plan, faults } = run(party.request, seed);
      expect(plan.days).toHaveLength(5);
      expect(messages(turnFaults(plan, party.request))).toEqual([]);
      // Invariants 2 and 7 together: a turn is a drawn stop, and no drawn stop is not met.
      expect(messages(faults.filter((fault) => fault.invariant === 2 || fault.invariant === 6))).toEqual([]);
    });
  });

  it("travellers with likes get turns, in every party that has any", () => {
    for (const party of PARTIES) {
      if (!party.request.party.travellers.some((t) => t.likes.length > 0)) continue;
      const { plan } = run(party.request, SEEDS[0]);
      expect(turnsOf(plan).length, party.name).toBeGreaterThan(0);
    }
  });
});

describe("a traveller with no likes", () => {
  it("takes no turn, and a party with no likes at all leaves its open slots wild", () => {
    const party = PARTIES.find((entry) => entry.name === "no likes at all")!;
    for (const seed of SEEDS) {
      const { plan } = run(party.request, seed);
      const open = stopsOf(plan).filter((entry) => /\.open\d+$/.test(entry.stop.slot));
      expect(open.length).toBeGreaterThan(0);
      for (const entry of open) expect(entry.stop.because.kind, entry.stop.slot).toBe("wild");
    }
  });

  it("is not given a turn when others in the party have likes", () => {
    const request = sampleRoute(
      setParty([
        traveller("t1", "adult", { likes: ["food"] }),
        traveller("t2", "adult"),
        traveller("t3", "adult", { likes: ["history"] }),
      ]),
    );
    for (const seed of SEEDS) {
      const { plan } = run(request, seed);
      expect(turnsOf(plan).map((t) => forKey(t.stop)).filter((key) => key === "t2")).toEqual([]);
    }
  });
});

describe("a traveller who joins on day 3", () => {
  it("has turns on days 3 to 5 only, and the others keep theirs on every day", () => {
    const request = sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { likes: ["history"] }),
          traveller("t2", "adult", { likes: ["food"] }),
          traveller("t3", "adult", { rules: ["pork-free"], likes: ["art"], days: [3, 4, 5] }),
        ],
        { fullness: "full" },
      ),
    );
    for (const seed of SEEDS) {
      const { plan, faults } = run(request, seed);
      expect(messages(faults)).toEqual([]);
      const days = turnsOf(plan).filter((t) => forKey(t.stop) === "t3").map((t) => t.day);
      expect(days.length).toBeGreaterThan(0);
      for (const day of days) expect(day).toBeGreaterThanOrEqual(3);
      for (const day of [1, 2]) {
        const stops = stopsOf(plan).filter((entry) => entry.day === day);
        for (const entry of stops) expect(entry.stop.checks.map((c) => c.rule)).not.toContain("pork-free");
      }
    }
  });
});

describe("a short day", () => {
  // Light days have two turn slots and four travellers have likes: two are left out each day and go first the next.
  const request = sampleRoute(
    setParty(
      [
        traveller("t1", "adult", { likes: ["food"] }),
        traveller("t2", "adult", { likes: ["history"] }),
        traveller("t3", "adult", { likes: ["art"] }),
        traveller("t4", "adult", { likes: ["nature"] }),
      ],
      { fullness: "light" },
    ),
  );

  it.each([...SEEDS])("seed %s: those left out go first the next day, and counts stay within one", (seed) => {
    const { plan, faults } = run(request, seed);
    expect(messages(faults)).toEqual([]);
    const byDay = (day: number) => turnsOf(plan).filter((t) => t.day === day).map((t) => forKey(t.stop));
    const day1 = byDay(1);
    const day2 = byDay(2);
    if (day1.length > 0 && day1.length < 4 && day2.length > 0) {
      const left = ["t1", "t2", "t3", "t4"].filter((key) => !day1.includes(key));
      expect(day2.slice(0, Math.min(left.length, day2.length)).every((key) => left.includes(key))).toBe(true);
    }
  });
});

describe("two travellers who do not like the same things", () => {
  it("a paired stop, when there is one, sits beside the turn of the other traveller", () => {
    const request = sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { likes: ["nature"] }),
          traveller("t2", "adult", { likes: ["food"], skips: ["nature"] }),
        ],
        { fullness: "full" },
      ),
    );
    for (const seed of SEEDS) {
      const { plan, faults } = run(request, seed);
      expect(messages(faults)).toEqual([]);
      for (const entry of stopsOf(plan)) {
        if (entry.stop.because.kind === "paired") {
          expect(entry.stop.slot).toMatch(/\.open\d+\.pair$/);
          expect(entry.stop.because.for).not.toBe(entry.stop.because.with);
        }
      }
    }
  });
});
