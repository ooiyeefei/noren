import { describe, expect, it } from "vitest";
import { applyChange, planTrip } from "@/lib/trip";
import type { Candidate, ChangeOp, KeptStop, Pin, Plan, Stop, TripRequest } from "@/lib/trip/types";
import { checkPlan, foodCategory, observe, stopsOf, turnFaults, verdictOf, type Fault } from "../fixtures/trip-check";
import { sampleRoute, setParty, traveller } from "../fixtures/trip-parties";
import { PLACES, REGION, haversineMetres, world } from "../fixtures/trip-world";

// What each change does (contracts/engine.md, "What each change does"), judged by invariants 5, 7
// and 8: stops held by time never move; no op loosens a hard rule (the independent checker runs
// after every op); every stop an op does not bear on is the same place; an op that cannot be done
// leaves the plan as it was, with one more entry in unmet; moved lists what changed, and nothing else.

const SEED = "change-seed";
const REFUSALS = ["change", "rule", "stretch", "dayDrive", "rest", "route"];

const party = (extra = {}) =>
  setParty(
    [
      traveller("t1", "adult", { likes: ["history", "food"] }),
      traveller("t2", "adult", { likes: ["coffee", "nature"] }),
    ],
    { fullness: "full", ...extra },
  );

type Outcome = { request: TripRequest; plan: Plan };

function start(request: TripRequest, places?: readonly Candidate[]): Outcome {
  const observed = observe(world(SEED, { places }));
  return { request, plan: planTrip(request, observed.world) };
}

function apply(
  before: Outcome,
  op: ChangeOp,
  places?: readonly Candidate[],
): { after: Outcome; faults: Fault[] } {
  const observed = observe(world(SEED, { places }));
  const after = applyChange(before.request, before.plan, op, observed.world);
  const faults = checkPlan(after.plan, {
    request: after.request,
    world: world(SEED, { places }),
    seen: observed.seen,
    places,
    turns: false,
    afterOp: true,
  });
  return { after, faults };
}

const messages = (faults: Fault[]) => faults.map((f) => `invariant ${f.invariant}, ${f.where}: ${f.message}`);
const keyOf = (stop: Stop | undefined) =>
  stop === undefined ? undefined : "placeId" in stop.place ? stop.place.placeId : `pin:${stop.place.pinId}`;
const bySlot = (plan: Plan) => new Map(stopsOf(plan).map((entry) => [entry.stop.slot, entry.stop]));
const openStops = (plan: Plan, day: number) =>
  stopsOf(plan).filter((entry) => entry.day === day && /\.open\d+$/.test(entry.stop.slot));
const candidate = (stop: Stop | undefined) =>
  stop !== undefined && "placeId" in stop.place ? PLACES.find((p) => p.placeId === (stop.place as { placeId: string }).placeId) : undefined;

function keepFrom(plan: Plan, slot: string, hold: "time" | "place"): KeptStop {
  const entry = stopsOf(plan).find((e) => e.stop.slot === slot)!;
  return {
    slot,
    day: entry.day,
    place: entry.stop.place,
    hold,
    at: entry.stop.at,
    minutes: entry.stop.minutes,
    because: entry.stop.because,
  };
}

/** The slots whose place differs between two plans, or that left. */
function changedSlots(before: Plan, after: Plan): string[] {
  const now = bySlot(after);
  return [...bySlot(before)].filter(([slot, stop]) => keyOf(now.get(slot)) !== keyOf(stop)).map(([slot]) => slot);
}

/** Invariant 8 and the shape of `moved`: nothing outside `bears` changed place, and moved lists exactly what did. */
function expectOnlyChanged(before: Plan, after: Plan, bears: (slot: string) => boolean, label: string) {
  const changed = changedSlots(before, after);
  expect(changed.filter((slot) => !bears(slot)), `${label}: stops the op does not bear on changed place`).toEqual([]);
  const moved = (after.moved ?? []).map((entry) => entry.slot).sort();
  expect(moved, `${label}: moved lists what changed place or left, and nothing else`).toEqual([...changed].sort());
  for (const entry of after.moved ?? []) {
    expect(entry.why, `${label}: ${entry.slot} has a reason code`).toMatch(/^\S+$/);
  }
}

function expectRefused(before: Outcome, result: Outcome, label: string) {
  expect(result.request, `${label}: the request is unchanged`).toEqual(before.request);
  expect(result.plan.unmet.length, `${label}: one more entry in unmet`).toBe(before.plan.unmet.length + 1);
  expect({ ...result.plan, unmet: before.plan.unmet }, `${label}: the plan is as it was`).toEqual(before.plan);
  const added = result.plan.unmet.at(-1)!;
  expect(REFUSALS, label).toContain(added.what);
  expect(added.choices.length, `${label}: the refusal offers choices`).toBeGreaterThan(0);
  expect(added.detail, label).toMatch(/^\S+$/);
}

const base = () => start(sampleRoute(party()));

describe("the base plan", () => {
  it("is made, and has open stops on the day in George Town", () => {
    const { plan } = base();
    expect(plan.days).toHaveLength(5);
    expect(openStops(plan, 3).length).toBeGreaterThanOrEqual(2);
  });
});

describe("redraw", () => {
  it("gives the slot another place with the same reason; the old place joins avoid; nothing else changes", () => {
    const before = base();
    const target = openStops(before.plan, 3)[0]!.stop;
    const { after, faults } = apply(before, { op: "redraw", slot: target.slot });
    expect(messages(faults)).toEqual([]);
    const now = bySlot(after.plan).get(target.slot)!;
    expect(keyOf(now)).not.toBe(keyOf(target));
    expect(now.because).toEqual(target.because);
    expect(after.request.avoid).toContain((target.place as { placeId: string }).placeId);
    expectOnlyChanged(before.plan, after.plan, (slot) => slot === target.slot, "redraw");
    expect(after.plan.moved!.find((m) => m.slot === target.slot)).toBeDefined();
  });

  it("is the same on the same input", () => {
    const before = base();
    const slot = openStops(before.plan, 3)[0]!.stop.slot;
    expect(apply(before, { op: "redraw", slot }).after).toEqual(apply(before, { op: "redraw", slot }).after);
  });

  it("refuses a slot that does not exist, and leaves the plan as it was", () => {
    const before = base();
    const { after } = apply(before, { op: "redraw", slot: "d9.open1" });
    expectRefused(before, after, "no such slot");
    expect(after.plan.unmet.at(-1)!.what).toBe("change");
  });

  it("never moves a stop held by time", () => {
    const first = base();
    const [one, two] = openStops(first.plan, 3);
    const request = { ...first.request, keep: { stops: [keepFrom(first.plan, one!.stop.slot, "time")] } };
    const before = start(request);
    const { after, faults } = apply(before, { op: "redraw", slot: two!.stop.slot });
    expect(messages(faults)).toEqual([]);
    const held = bySlot(after.plan).get(one!.stop.slot)!;
    expect(keyOf(held)).toBe(keyOf(one!.stop));
    expect(held.at).toBe(one!.stop.at);
    // Asking to redraw the held stop itself is refused or leaves it where it is.
    const again = apply(before, { op: "redraw", slot: one!.stop.slot }).after;
    expect(keyOf(bySlot(again.plan).get(one!.stop.slot))).toBe(keyOf(one!.stop));
  });
});

describe("skip", () => {
  it("removes the stop, draws nothing in its place, and the place joins avoid", () => {
    const before = base();
    const target = openStops(before.plan, 3)[1]!.stop;
    const { after, faults } = apply(before, { op: "skip", slot: target.slot });
    expect(messages(faults)).toEqual([]);
    expect(bySlot(after.plan).has(target.slot)).toBe(false);
    expect(after.request.avoid).toContain((target.place as { placeId: string }).placeId);
    expectOnlyChanged(before.plan, after.plan, (slot) => slot === target.slot, "skip");
    const entry = after.plan.moved!.find((m) => m.slot === target.slot)!;
    expect(entry.now).toBeUndefined();
    // The day is re-timed: nothing later starts after it did.
    const oldDay = bySlot(before.plan);
    for (const [slot, stop] of bySlot(after.plan)) {
      if (slot.startsWith("d3.") && oldDay.has(slot)) expect(stop.at <= oldDay.get(slot)!.at, slot).toBe(true);
    }
  });

  it("refuses a slot that does not exist", () => {
    const before = base();
    expectRefused(before, apply(before, { op: "skip", slot: "d3.open99" }).after, "skip no slot");
  });

  it("does not let a skipped place come back after a later redraw", () => {
    const before = base();
    const [a, b] = openStops(before.plan, 3);
    const skipped = apply(before, { op: "skip", slot: a!.stop.slot }).after;
    const redrawn = apply(skipped, { op: "redraw", slot: b!.stop.slot }).after;
    expect([...bySlot(redrawn.plan).values()].map(keyOf)).not.toContain(keyOf(a!.stop));
  });
});

describe("add_pin", () => {
  const pin: Pin = { id: "pin-x", day: 3, at: "14:00", minutes: 60, pin: { lat: 5.4141, lng: 100.3318 } };

  it("adds the pin at its time on its day, and the other days are untouched", () => {
    const before = base();
    const { after, faults } = apply(before, { op: "add_pin", pin });
    expect(messages(faults)).toEqual([]);
    const stop = bySlot(after.plan).get("d3.pin.pin-x")!;
    expect(stop.at).toBe("14:00");
    expect(stop.minutes).toBe(60);
    expect(stop.because.kind).toBe("pin");
    expect(after.request.pins.map((p) => p.id)).toContain("pin-x");
    for (const index of [0, 1, 3, 4]) expect(after.plan.days[index]).toEqual(before.plan.days[index]);
    // Every other stop on day 3 stays unless the day ran past its end and its last open stop left.
    const changed = changedSlots(before.plan, after.plan);
    const lastOpen = openStops(before.plan, 3).at(-1)!.stop.slot;
    expect(changed.filter((slot) => slot !== lastOpen)).toEqual([]);
    expect((after.plan.moved ?? []).map((m) => m.slot).sort()).toEqual([...changed].sort());
  });

  it("keeps a pin held by time where it is through a later change", () => {
    const before = base();
    const withPin = apply(before, { op: "add_pin", pin }).after;
    const target = openStops(withPin.plan, 3)[0]!.stop.slot;
    const { after, faults } = apply(withPin, { op: "redraw", slot: target });
    expect(messages(faults)).toEqual([]);
    const held = bySlot(after.plan).get("d3.pin.pin-x")!;
    expect(held.at).toBe("14:00");
  });

  it("refuses a pin on a day the trip does not have", () => {
    const before = base();
    expectRefused(before, apply(before, { op: "add_pin", pin: { ...pin, id: "pin-y", day: 9 } }).after, "pin on day 9");
  });
});

describe("lighten", () => {
  const pinned: Pin = { id: "pin-day2", day: 2, at: "15:30", minutes: 45, pin: { lat: 5.4161, lng: 100.3327 } };
  const request = sampleRoute(party(), [pinned]);

  it("with two stops done: the done stops and the pin stay, day 2 has fewer stops, other days are identical", () => {
    const first = start(request);
    const day2 = stopsOf(first.plan).filter((e) => e.day === 2 && !e.stop.slot.includes(".pin."));
    expect(day2.length).toBeGreaterThanOrEqual(3);
    const done = day2.slice(0, 2).map((e) => keepFrom(first.plan, e.stop.slot, "time"));
    const before = start({ ...request, keep: { stops: done } });
    const { after, faults } = apply(before, { op: "lighten", day: 2 });
    expect(messages(faults)).toEqual([]);
    const count = (plan: Plan) => stopsOf(plan).filter((e) => e.day === 2).length;
    expect(count(after.plan)).toBe(count(before.plan) - 1);
    const now = bySlot(after.plan);
    for (const kept of done) {
      expect(keyOf(now.get(kept.slot)), kept.slot).toBe(keyOf(bySlot(before.plan).get(kept.slot)));
      expect(now.get(kept.slot)!.at).toBe(kept.at);
    }
    expect(now.get("d2.pin.pin-day2")!.at).toBe("15:30");
    for (const index of [0, 2, 3, 4]) expect(after.plan.days[index], `day ${index + 1}`).toEqual(before.plan.days[index]);
    // The stop that left is the day's last open stop.
    const openBefore = openStops(before.plan, 2).map((e) => e.stop.slot);
    const gone = changedSlots(before.plan, after.plan);
    expect(gone).toEqual([openBefore.at(-1)]);
    expectOnlyChanged(before.plan, after.plan, (slot) => slot === openBefore.at(-1), "lighten");
  });

  it("is refused when the day has no open stop that is not held by time", () => {
    const first = start(request);
    const open = openStops(first.plan, 2);
    const keep = open.map((e) => keepFrom(first.plan, e.stop.slot, "time"));
    const before = start({ ...request, keep: { stops: keep } });
    expectRefused(before, apply(before, { op: "lighten", day: 2 }).after, "lighten with nothing open");
  });
});

describe("stay_longer", () => {
  it("makes the stop that much longer; stops before it are untouched; the rest of the day keeps its places", () => {
    const before = base();
    const target = openStops(before.plan, 3)[0]!.stop;
    const { after, faults } = apply(before, { op: "stay_longer", slot: target.slot, minutes: 20 });
    expect(messages(faults)).toEqual([]);
    const now = bySlot(after.plan).get(target.slot)!;
    expect(now.minutes).toBe(target.minutes + 20);
    expect(keyOf(now)).toBe(keyOf(target));
    const lastOpen = openStops(before.plan, 3).at(-1)!.stop.slot;
    expectOnlyChanged(before.plan, after.plan, (slot) => slot === lastOpen && slot !== target.slot, "stay_longer");
    for (const index of [0, 1, 3, 4]) expect(after.plan.days[index]).toEqual(before.plan.days[index]);
  });

  it("is refused when a stop held by time would have to move", () => {
    const first = base();
    const [one, two] = openStops(first.plan, 3);
    const request = { ...first.request, keep: { stops: [keepFrom(first.plan, two!.stop.slot, "time")] } };
    const before = start(request);
    expectRefused(before, apply(before, { op: "stay_longer", slot: one!.stop.slot, minutes: 600 }).after, "stay_longer too long");
  });
});

describe("quieter", () => {
  it("draws again every open stop with no record that meets quiet, from places that have one; other days are identical", () => {
    const before = base();
    const { after, faults } = apply(before, { op: "quieter", day: 3 });
    expect(messages(faults)).toEqual([]);
    const reference = "2026-12-13";
    const unmet = (slot: string) => after.plan.unmet.some((entry) => entry.slot === slot);
    for (const entry of openStops(after.plan, 3)) {
      const place = candidate(entry.stop)!;
      const met = verdictOf("quiet", place, REGION, reference).verdict === "met";
      expect(met || unmet(entry.stop.slot), `${entry.stop.slot} meets quiet on record, or unmet says it could not`).toBe(true);
    }
    for (const index of [0, 1, 3, 4]) expect(after.plan.days[index]).toEqual(before.plan.days[index]);
    // A stop that already met quiet is the same place.
    for (const entry of openStops(before.plan, 3)) {
      if (verdictOf("quiet", candidate(entry.stop)!, REGION, reference).verdict === "met") {
        expect(keyOf(bySlot(after.plan).get(entry.stop.slot))).toBe(keyOf(entry.stop));
      }
    }
  });

  it("with no place in reach that has a record, the stops stay and unmet says so; no place is called quiet", () => {
    const noQuiet = PLACES.map((p) => ({ ...p, facts: p.facts.filter((f) => f.key !== "quiet_room") }));
    const before = start(sampleRoute(party()), noQuiet);
    const { after } = apply(before, { op: "quieter", day: 3 }, noQuiet);
    expect(changedSlots(before.plan, after.plan)).toEqual([]);
    expect(after.plan.unmet.length).toBeGreaterThan(before.plan.unmet.length);
    for (const day of after.plan.days) {
      for (const item of day.items) {
        if (item.kind === "stop") expect(item.checks.some((c) => c.rule === "quiet" && c.verdict === "met")).toBe(false);
      }
    }
  });
});

describe("shorter_walks", () => {
  it("draws again each open stop reached by a walk over half the limit, from places within that walk; other days are identical", () => {
    const before = base();
    const half = REGION.trip!.walkLimitMetres / 2;
    const { after, faults } = apply(before, { op: "shorter_walks", day: 3 });
    expect(messages(faults)).toEqual([]);
    const unmet = (slot: string) => after.plan.unmet.some((entry) => entry.slot === slot);
    for (const entry of openStops(after.plan, 3)) {
      const leg = entry.stop.legBefore;
      if (leg?.how === "walk") expect(leg.metres <= half || unmet(entry.stop.slot), entry.stop.slot).toBe(true);
    }
    for (const index of [0, 1, 3, 4]) expect(after.plan.days[index]).toEqual(before.plan.days[index]);
    // A stop already within the shorter walk stays.
    for (const entry of openStops(before.plan, 3)) {
      const leg = entry.stop.legBefore;
      if (leg?.how !== "walk" || leg.metres <= half) {
        expect(keyOf(bySlot(after.plan).get(entry.stop.slot)), entry.stop.slot).toBe(keyOf(entry.stop));
      }
    }
  });
});

describe("more_for", () => {
  it("makes the next open stop that is not theirs their turn, drawn on their likes; the rest is the same", () => {
    const before = base();
    const open = openStops(before.plan, 3);
    const target = open.find((e) => !(e.stop.because.kind === "turn" && e.stop.because.for === "t2"));
    expect(target).toBeDefined();
    const { after, faults } = apply(before, { op: "more_for", who: "t2", day: 3 });
    expect(messages(faults)).toEqual([]);
    const now = bySlot(after.plan).get(target!.stop.slot)!;
    expect(now.because.kind).toBe("turn");
    expect(now.because.kind === "turn" && now.because.for).toBe("t2");
    expectOnlyChanged(before.plan, after.plan, (slot) => slot === target!.stop.slot, "more_for");
    // Invariant 6 does not count a turn given this way.
    // One turn moved from one traveller to another: the gap may grow by 2 (ruling 7).
    expect(messages(turnFaults(after.plan, after.request, new Set(), 1))).toEqual([]);
  });

  it("is refused for a traveller who is not in the party", () => {
    const before = base();
    expectRefused(before, apply(before, { op: "more_for", who: "t9", day: 3 }).after, "more_for t9");
  });
});

describe("weather", () => {
  it.each(["rain", "heat"] as const)("%s: open stops that day are indoors, or unmet says they could not be; other days are identical", (kind) => {
    const before = base();
    const { after, faults } = apply(before, { op: "weather", day: 3, kind });
    expect(messages(faults)).toEqual([]);
    const indoor = REGION.trip!.indoorCategories;
    for (const entry of openStops(after.plan, 3)) {
      const category = candidate(entry.stop)?.category ?? "";
      const said = after.plan.unmet.some((u) => u.slot === entry.stop.slot);
      expect(indoor.includes(category) || said, `${entry.stop.slot} is a ${category}`).toBe(true);
    }
    for (const index of [0, 1, 3, 4]) expect(after.plan.days[index]).toEqual(before.plan.days[index]);
    // An open stop that was already indoors stays.
    for (const entry of openStops(before.plan, 3)) {
      if (indoor.includes(candidate(entry.stop)?.category ?? "")) {
        expect(keyOf(bySlot(after.plan).get(entry.stop.slot))).toBe(keyOf(entry.stop));
      }
    }
  });

  it("with no indoor place in reach, the stops stay and unmet says so", () => {
    const indoor = REGION.trip!.indoorCategories;
    // Places to eat are indoors too, so keep only the ones beside road points: meals still have a place.
    const world0 = PLACES.filter(
      (p) => !indoor.includes(p.category ?? "") || (foodCategory(p.category) && p.placeId.includes("-rp-")),
    );
    const before = start(sampleRoute(party()), world0);
    const { after } = apply(before, { op: "weather", day: 3, kind: "rain" }, world0);
    for (const entry of openStops(after.plan, 3)) {
      if (!indoor.includes(candidate(entry.stop)?.category ?? "")) {
        expect(after.plan.unmet.some((u) => u.slot === entry.stop.slot), entry.stop.slot).toBe(true);
      }
    }
  });
});

describe("move_night", () => {
  it("moves night 4 from Ipoh to Kuala Kangsar: days 4 and 5 are laid out again, days 1 to 3 are identical, stops in towns still on those days stay", () => {
    const before = base();
    const { after, faults } = apply(before, { op: "move_night", night: 4, to: "kuala-kangsar" });
    expect(messages(faults)).toEqual([]);
    expect(after.request.nights![3]).toBe("kuala-kangsar");
    expect(after.plan.days[3]!.night).toBe("kuala-kangsar");
    for (const index of [0, 1, 2]) expect(after.plan.days[index], `day ${index + 1}`).toEqual(before.plan.days[index]);
    // Day 4 starts in George Town and still spends its morning there.
    const georgeTown = REGION.towns!.find((t) => t.id === "george-town")!;
    const nowStops = bySlot(after.plan);
    for (const entry of stopsOf(before.plan).filter((e) => e.day === 4)) {
      const place = candidate(entry.stop);
      if (place !== undefined && haversineMetres(georgeTown.center, place.pin) <= georgeTown.radiusMetres) {
        expect(keyOf(nowStops.get(entry.stop.slot)), entry.stop.slot).toBe(keyOf(entry.stop));
      }
    }
    const touched = new Set(changedSlots(before.plan, after.plan).map((slot) => Number(/^d(\d+)/.exec(slot)![1])));
    for (const day of touched) expect([4, 5]).toContain(day);
  });

  it("is refused when a drive would pass the limit the organiser set", () => {
    const before = start(sampleRoute(party({ limits: { stretchMinutes: 120, dayDriveMinutes: 330 } })));
    expect(before.plan.days).toHaveLength(5);
    expectRefused(before, apply(before, { op: "move_night", night: 2, to: "tanjung-malim" }).after, "move_night too far");
  });

  it("is refused for a place that is not on the road table", () => {
    const before = base();
    expectRefused(before, apply(before, { op: "move_night", night: 2, to: "nowhere" }).after, "move_night nowhere");
  });
});

describe("no op loosens a hard rule", () => {
  const strict = sampleRoute(
    setParty(
      [
        traveller("t1", "older", { rules: ["step-free", "halal"], likes: ["history"] }),
        traveller("t2", "adult", { likes: ["food"] }),
      ],
      { fullness: "full" },
    ),
  );
  const ops = (plan: Plan): ChangeOp[] => {
    const slot = openStops(plan, 3)[0]!.stop.slot;
    return [
      { op: "redraw", slot },
      { op: "skip", slot },
      { op: "lighten", day: 3 },
      { op: "stay_longer", slot, minutes: 15 },
      { op: "quieter", day: 3 },
      { op: "shorter_walks", day: 3 },
      { op: "more_for", who: "t2", day: 3 },
      { op: "weather", day: 3, kind: "rain" },
      { op: "move_night", night: 4, to: "kuala-kangsar" },
      { op: "add_pin", pin: { id: "pin-s", day: 4, at: "11:00", minutes: 30, pin: { lat: 5.4141, lng: 100.3318 } } },
    ];
  };

  it.each(["seed-a", "seed-b", "seed-c"])("the checker finds no fault after any op (%s)", (seed) => {
    const observed = observe(world(seed));
    const plan = planTrip(strict, observed.world);
    expect(plan.days).toHaveLength(5);
    for (const op of ops(plan)) {
      const seen = observe(world(seed));
      const after = applyChange(strict, plan, op, seen.world);
      const faults = checkPlan(after.plan, { request: after.request, world: world(seed), seen: seen.seen, turns: false, afterOp: true });
      expect(messages(faults), `${seed} ${op.op}`).toEqual([]);
    }
  });
});
