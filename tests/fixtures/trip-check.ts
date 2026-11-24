import { ruleScope } from "@/lib/trip/vocabulary";
import type {
  Candidate,
  Drive,
  LatLng,
  Plan,
  RegionTripSettings,
  Rest,
  Stop,
  TripRequest,
  World,
} from "@/lib/trip/types";
import { PLACES, REGION, daysBetween, addDays } from "./trip-world";

// A checker for invariants 1 to 5 of contracts/engine.md, written from the contract alone. It does
// not import src/lib/facts/rules.ts or src/lib/trip/checker.ts: if the engine and its own checker
// share a mistake, this one still finds it.
//
// Every function here is pure. A fault names the invariant, where it is, and what is wrong.

export type Fault = { invariant: number | string; where: string; message: string };

type Fact = Candidate["facts"][number];
type VocabularyEntry = NonNullable<RegionTripSettings["factVocabulary"]>[number];

export type Verdict =
  | { verdict: "not_met" }
  | { verdict: "met"; basis: "member" | "post"; factIds: string[] }
  | { verdict: "not_known"; reason: "no_record" | "too_old" | "not_recorded_here" };

const LISTS = ["meets", "fails", "noMeets", "noFails"] as const;

/** AVOID_RULES in src/lib/draw/rules.ts, as far as the trip rules go: a caution against a rule. */
const CAUTION_AGAINST: Record<string, string> = { "step-free": "accessibility_steps" };

export function toMinutes(clock: string): number {
  const [h = 0, m = 0] = clock.split(":").map(Number);
  return h * 60 + m;
}

export function foodCategory(category: string | undefined, region: RegionTripSettings = REGION): boolean {
  return category !== undefined && (region.trip?.foodCategories ?? []).includes(category);
}

function entryFor(key: string, region: RegionTripSettings): VocabularyEntry | undefined {
  return region.factVocabulary?.find((entry) => entry.key === key);
}

function names(entry: VocabularyEntry, rule: string): boolean {
  return LISTS.some((list) => (entry[list] as readonly string[] | undefined)?.includes(rule));
}

/** Does this record, if it were fresh, count for (+1) or against (-1) the rule? 0 when it does not bear. */
function bearing(fact: Fact, rule: string, region: RegionTripSettings): 1 | -1 | 0 {
  const entry = entryFor(fact.key, region);
  if (entry === undefined) return 0;
  if (fact.value === "yes") {
    if (entry.fails?.includes(rule)) return -1;
    if (entry.meets?.includes(rule)) return 1;
  } else {
    if (entry.noFails?.includes(rule)) return -1;
    if (entry.noMeets?.includes(rule)) return 1;
  }
  return 0;
}

/** The verdict for one rule at one place, by the steps in the contract's "How a rule is checked". */
export function verdictOf(
  rule: string,
  candidate: Candidate,
  region: RegionTripSettings,
  referenceDate: string,
): Verdict {
  const maxAge = region.factMaxAgeDays ?? 365;
  const fresh = (fact: Fact) => daysBetween(fact.day, referenceDate) <= maxAge;
  const freshFacts = candidate.facts.filter(fresh);

  // Two fresh facts with one key and different values disagree: every rule the key names in any of
  // its four lists is not met.
  const valuesByKey = new Map<string, Set<string>>();
  for (const fact of freshFacts) {
    const seen = valuesByKey.get(fact.key) ?? new Set<string>();
    seen.add(fact.value);
    valuesByKey.set(fact.key, seen);
  }
  for (const [key, values] of valuesByKey) {
    const entry = entryFor(key, region);
    if (values.size > 1 && entry !== undefined && names(entry, rule)) return { verdict: "not_met" };
  }

  // A record against, or an owner's caution that maps to the rule.
  if (freshFacts.some((fact) => bearing(fact, rule, region) === -1)) return { verdict: "not_met" };
  const caution = CAUTION_AGAINST[rule];
  if (caution !== undefined && candidate.cautions.includes(caution)) return { verdict: "not_met" };

  // Otherwise a record for it, resting on the newest.
  const records = freshFacts.filter((fact) => bearing(fact, rule, region) === 1);
  if (records.length > 0) {
    const newestDay = records.map((fact) => fact.day).sort().at(-1)!;
    const newest = records.filter((fact) => fact.day === newestDay);
    return {
      verdict: "met",
      basis: newest[0]!.basis,
      factIds: newest.map((fact) => fact.factId),
    };
  }

  // Otherwise not known, and why.
  const stale = candidate.facts.filter((fact) => !fresh(fact) && bearing(fact, rule, region) !== 0);
  if (stale.length > 0) return { verdict: "not_known", reason: "too_old" };
  const named = (region.factVocabulary ?? []).some((entry) => names(entry, rule));
  return { verdict: "not_known", reason: named ? "no_record" : "not_recorded_here" };
}

/** Does the place serve a need: a fresh "yes" on a key that lists the need under `serves`. */
export function servesNeed(
  need: "prayer" | "work" | "rest",
  candidate: Candidate,
  region: RegionTripSettings,
  referenceDate: string,
): boolean {
  const maxAge = region.factMaxAgeDays ?? 365;
  return candidate.facts.some((fact) => {
    if (fact.value !== "yes" || daysBetween(fact.day, referenceDate) > maxAge) return false;
    return (entryFor(fact.key, region)?.serves as readonly string[] | undefined)?.includes(need) ?? false;
  });
}

export function referenceDate(request: TripRequest, world: { today: string }): string {
  return request.startDate ?? world.today;
}

export function travellersOn(request: TripRequest, day: number) {
  return request.party.travellers.filter((traveller) => traveller.days === undefined || traveller.days.includes(day));
}

/** The distinct rules that apply at a stop of this category on this day, by scope. */
export function rulesAt(request: TripRequest, day: number, category: string | undefined, region = REGION): string[] {
  const rules = new Set<string>();
  for (const traveller of travellersOn(request, day)) {
    for (const rule of traveller.rules) {
      if (ruleScope(rule) === "food" && !foodCategory(category, region)) continue;
      rules.add(rule);
    }
  }
  return [...rules];
}

/** Minutes of driving between two road points by the road table (shortest way, both directions). */
export function routeMinutes(region: RegionTripSettings, from: string, to: string): number {
  const edges = new Map<string, { to: string; minutes: number }[]>();
  const add = (a: string, b: string, minutes: number) => {
    const list = edges.get(a) ?? [];
    list.push({ to: b, minutes });
    edges.set(a, list);
  };
  for (const segment of region.roads?.segments ?? []) {
    add(segment.from, segment.to, segment.minutes);
    add(segment.to, segment.from, segment.minutes);
  }
  const best = new Map<string, number>([[from, 0]]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    queue.sort((a, b) => best.get(a)! - best.get(b)!);
    const here = queue.shift()!;
    for (const edge of edges.get(here) ?? []) {
      const total = best.get(here)! + edge.minutes;
      if (total < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, total);
        queue.push(edge.to);
      }
    }
  }
  return best.get(to) ?? Infinity;
}

/** The legs of a trip with its nights given: start to the first night, night to night, last night to end. */
export function legMinutes(request: TripRequest, region: RegionTripSettings = REGION): number[] {
  const stops = [request.start, ...(request.nights ?? []), request.end];
  return stops.slice(0, -1).map((from, index) => routeMinutes(region, from, stops[index + 1]!));
}

export type Observed = {
  world: World;
  /** Every spot the engine asked about, in order. */
  queries: { near: LatLng; withinMetres: number }[];
  /** Every placeId a call to `candidates` handed back. */
  seen: Set<string>;
};

/** Wraps a world so the checker can see what the engine asked for and was given. */
export function observe(world: World): Observed {
  const queries: Observed["queries"] = [];
  const seen = new Set<string>();
  return {
    queries,
    seen,
    world: {
      ...world,
      candidates(near, withinMetres) {
        queries.push({ near: { ...near }, withinMetres });
        const found = world.candidates(near, withinMetres);
        for (const candidate of found) seen.add(candidate.placeId);
        return found;
      },
    },
  };
}

type PlacedStop = { day: number; index: number; stop: Stop };

export function stopsOf(plan: Plan): PlacedStop[] {
  const result: PlacedStop[] = [];
  for (const day of plan.days) {
    day.items.forEach((item, index) => {
      if (item.kind === "stop") result.push({ day: day.index, index, stop: item });
    });
  }
  return result;
}

const SLOT = /^d(\d+)\.(lunch|dinner|open(\d+)|need(\d+)|pin\.(.+))$/;
const PAIR_SLOT = /^d(\d+)\.open(\d+)\.pair$/;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export type CheckContext = {
  request: TripRequest;
  world: World;
  /** The placeIds the engine was handed by the world. */
  seen: ReadonlySet<string>;
  /** Every place that exists in the test world, to read facts from. */
  places?: readonly Candidate[];
  /** Turn checks (invariant 6) hold for a plan made fresh; set false for a plan after an op. */
  turns?: boolean;
  /** An op has been applied: open slots keep their ids, so their numbers need not be contiguous (ruling 6). */
  afterOp?: boolean;
};

/** Reports every fault against invariants 1 to 5 in a finished plan. An empty list is a clean plan. */
export function checkPlan(plan: Plan, context: CheckContext): Fault[] {
  const { request, world } = context;
  const region = world.region;
  const places = new Map((context.places ?? PLACES).map((place) => [place.placeId, place]));
  const reference = referenceDate(request, world);
  const faults: Fault[] = [];
  const fault = (invariant: number | string, where: string, message: string) =>
    faults.push({ invariant, where, message });

  const pinsById = new Map<string, TripRequest["pins"][number]>(request.pins.map((pin) => [pin.id, pin]));
  for (const op of request.ops ?? []) if (op.op === "add_pin") pinsById.set(op.pin.id, op.pin);
  // A stop held by time keeps its place even when the place now has a not-met verdict (invariant 5).
  const heldByTime = new Set((request.keep?.stops ?? []).filter((kept) => kept.hold === "time").map((kept) => kept.slot));
  const keptPlaceIds = new Set<string>();
  const keptPinIds = new Set<string>();
  for (const kept of request.keep?.stops ?? []) {
    if ("placeId" in kept.place) keptPlaceIds.add(kept.place.placeId);
    else keptPinIds.add(kept.place.pinId);
  }

  // The route: with nights given, can it be driven inside the organiser's daily limit?
  checkRoute(plan, request, region, fault);
  if (plan.days.length === 0) return faults;

  if (plan.days.length !== request.days) {
    fault(3, "plan", `plan has ${plan.days.length} days for a ${request.days}-day request`);
  }

  const unmetFor = (what: string, day?: number, slot?: string) =>
    plan.unmet.filter((entry) => entry.what === what && (day === undefined || entry.day === day) && (slot === undefined || entry.slot === slot));

  let location = request.start;
  const placesSeenInPlan = new Map<string, string>();
  const slotsSeen = new Set<string>();

  plan.days.forEach((day, dayIndex) => {
    const dayNumber = dayIndex + 1;
    const where = `day ${dayNumber}`;
    if (day.index !== dayNumber) fault("shape", where, `day.index is ${day.index}`);
    if (request.startDate !== undefined) {
      const expected = addDays(request.startDate, dayIndex);
      if (day.date !== expected) fault("shape", where, `date ${day.date} is not ${expected}`);
      const weekday = WEEKDAYS[new Date(`${expected}T00:00:00Z`).getUTCDay()];
      if (day.weekday === undefined || !day.weekday.toLowerCase().startsWith(weekday!)) {
        fault("shape", where, `weekday ${String(day.weekday)} is not ${weekday}`);
      }
    }
    if (request.nights !== undefined && dayNumber < request.days && day.night !== request.nights[dayIndex]) {
      fault("shape", where, `night is ${String(day.night)}, request says ${request.nights[dayIndex]}`);
    }

    // Invariant 3: the drive. Runs of drives with no stop or rest, and the chain of road points.
    const stretch = request.party.limits.stretchMinutes;
    const stretchUnmet = unmetFor("stretch", dayNumber).length > 0;
    let run = 0;
    let driveTotal = 0;
    let lastTimed = -1;
    for (const item of day.items) {
      if (item.kind === "drive") {
        const drive = item as Drive;
        if (drive.from !== location) fault(3, where, `drive starts at ${drive.from}, but the party is at ${location}`);
        if (!(drive.minutes > 0) || !(drive.kilometres > 0) || drive.estimated !== true) {
          fault(3, where, `drive ${drive.from} to ${drive.to} has minutes ${drive.minutes}, km ${drive.kilometres}, estimated ${String(drive.estimated)}`);
        }
        location = drive.to;
        run += drive.minutes;
        driveTotal += drive.minutes;
        if (run > stretch && !stretchUnmet) {
          fault(3, where, `${run} minutes of driving without a stop or rest, over the ${stretch}-minute stretch limit`);
        }
      } else {
        run = 0;
        const at = toMinutes((item as Stop | Rest).at);
        if (at < lastTimed) fault("shape", where, `${(item as Stop | Rest).at} comes after a later clock time`);
        lastTimed = at;
      }
    }
    if (driveTotal !== day.driveMinutes) {
      fault(3, where, `driveMinutes is ${day.driveMinutes}, its drives add up to ${driveTotal}`);
    }
    if (day.night !== undefined && day.night !== location) {
      fault(3, where, `the day ends at ${location}, night is ${day.night}`);
    }

    // Invariant 3: over the organiser's limit, or over Noren's guess.
    const over = day.driveMinutes > request.party.limits.dayDriveMinutes;
    const named = unmetFor("dayDrive", dayNumber);
    if (over && request.party.guessed.includes("dayDrive")) {
      if (named.length !== 1 || named[0]!.choices.length !== 3) {
        fault(3, where, `${day.driveMinutes} minutes is over the guess of ${request.party.limits.dayDriveMinutes} but unmet has ${named.length} dayDrive entries (3 choices wanted)`);
      }
    } else if (over) {
      fault(3, where, `${day.driveMinutes} minutes is over the limit the organiser set (${request.party.limits.dayDriveMinutes})`);
    } else if (named.length > 0) {
      fault(3, where, "unmet names a day as over the limit when it is not");
    }

    // The stops.
    const present = travellersOn(request, dayNumber);
    const stops = day.items.filter((item): item is Stop => item.kind === "stop");
    const openNumbers: number[] = [];
    for (const stop of stops) {
      const slotWhere = `${where} ${stop.slot}`;
      checkSlot(stop, dayNumber, slotWhere, openNumbers, slotsSeen, fault);
      checkStop(stop, dayNumber, slotWhere);
    }
    openNumbers.forEach((n, i) => {
      if (context.afterOp === true) {
        if (i > 0 && n <= openNumbers[i - 1]!) fault("shape", where, `open slots are numbered ${openNumbers.join(", ")}; they must increase in the order of the day`);
      } else if (n !== i + 1) {
        fault("shape", where, `open slots are numbered ${openNumbers.join(", ")}; they count from 1 in order`);
      }
    });

    // Invariant 4: the rest after lunch, and the needs.
    const restAfter = Math.max(0, ...present.map((traveller) => traveller.rests?.minutes ?? 0));
    if (present.some((traveller) => traveller.rests !== undefined)) {
      const lunchIndex = day.items.findIndex(
        (item) => (item.kind === "stop" && item.slot === `d${dayNumber}.lunch`) || (item.kind === "rest" && item.why === "meal" && toMinutes(item.at) < toMinutes("15:00")),
      );
      const restIndex = day.items.findIndex((item, index) => item.kind === "rest" && item.why === "after_lunch" && index > lunchIndex);
      const rest = restIndex === -1 ? undefined : (day.items[restIndex] as Rest);
      if (rest === undefined) fault(4, where, "a traveller who rests after lunch is on this day and no rest follows lunch");
      else if (rest.minutes < restAfter) fault(4, where, `the rest after lunch is ${rest.minutes} minutes, ${restAfter} were asked`);
    } else if (day.items.some((item) => item.kind === "rest" && item.why === "after_lunch")) {
      fault(4, where, "a rest after lunch on a day nobody asked for one");
    }

    const needsToday = request.party.needs.filter(
      (need) => need.who === undefined || need.who.some((key) => present.some((traveller) => traveller.key === key)),
    );
    const needSlots = stops.filter((stop) => /\.need\d+$/.test(stop.slot));
    const needRests = day.items.filter((item) => item.kind === "rest" && item.why === "need");
    if (needSlots.length + needRests.length !== needsToday.length) {
      fault(4, where, `${needsToday.length} needs today, ${needSlots.length} need stops and ${needRests.length} need rests`);
    }
    for (const stop of needSlots) {
      if (stop.because.kind !== "need") fault(4, `${where} ${stop.slot}`, `a need slot with because ${stop.because.kind}`);
    }

    // Invariants 1, 2 and 5 on the stops; and a place appears once.
    function checkStop(stop: Stop, dayNo: number, slotWhere: string) {
      const placeKey = "placeId" in stop.place ? stop.place.placeId : `pin:${stop.place.pinId}`;
      const earlier = placesSeenInPlan.get(placeKey);
      if (earlier !== undefined) fault(1, slotWhere, `${placeKey} is already in the plan at ${earlier}`);
      placesSeenInPlan.set(placeKey, stop.slot);

      let candidate: Candidate | undefined;
      if ("placeId" in stop.place) {
        const placeId = stop.place.placeId;
        candidate = places.get(placeId);
        const pinned = [...pinsById.values()].some((pin) => pin.placeId === placeId);
        if (candidate === undefined) {
          fault(1, slotWhere, `${placeId} is not a place in the world`);
        } else {
          if (candidate.slug !== stop.place.slug) fault(1, slotWhere, `slug ${stop.place.slug} is not ${candidate.slug}`);
          if (!context.seen.has(placeId) && !pinned && !keptPlaceIds.has(placeId)) {
            fault(1, slotWhere, `${placeId} was never handed back by World.candidates, and is no pin and no kept stop`);
          }
        }
      } else if (!pinsById.has(stop.place.pinId) && !keptPinIds.has(stop.place.pinId)) {
        fault(1, slotWhere, `pin ${stop.place.pinId} is not one of the request's pins`);
      }

      const pinned = stop.because.kind === "pin";
      if (stop.slot.includes(".pin.") !== pinned) fault("shape", slotWhere, `slot ${stop.slot} and because ${stop.because.kind} disagree about a pin`);
      if (stop.minutes <= 0) fault("shape", slotWhere, `${stop.minutes} minutes at a stop`);

      if (candidate === undefined) return;
      if (stop.confirmed !== candidate.confirmed) fault(1, slotWhere, `confirmed is ${stop.confirmed}, the place says ${candidate.confirmed}`);
      if (stop.hasStory !== candidate.hasStory) fault(1, slotWhere, `hasStory is ${stop.hasStory}, the place says ${candidate.hasStory}`);

      // Invariant 2: rules.
      const rules = rulesAt(request, dayNo, candidate.category, region);
      const expectedChecks = new Map<string, Verdict>();
      for (const rule of rules) {
        const verdict = verdictOf(rule, candidate, region, reference);
        expectedChecks.set(rule, verdict);
        if (verdict.verdict === "not_met") {
          if (pinned) {
            if (unmetFor("rule", dayNo, stop.slot).length === 0) {
              fault(2, slotWhere, `a pinned place is not met for ${rule} and unmet does not say so`);
            }
          } else if (heldByTime.has(stop.slot)) {
            // Held by time (invariant 5): it stays, and unmet must say so.
            if (unmetFor("rule", dayNo, stop.slot).length === 0) {
              fault(2, slotWhere, `a stop held by time is not met for ${rule} and unmet does not say so`);
            }
          } else {
            fault(2, slotWhere, `${candidate.placeId} has a not-met verdict for ${rule} (a record against it, a disagreement or an owner caution)`);
          }
        }
      }
      if (!pinned && present.some((traveller) => traveller.rules.includes("no-alcohol")) && candidate.category === "bar") {
        fault(2, slotWhere, `a bar for a traveller who is not to be offered alcohol`);
      }
      // The listed checks are exactly the rules at this stop, with the verdicts the records give.
      const listed = new Map(stop.checks.map((check) => [check.rule, check]));
      if (listed.size !== stop.checks.length) fault(2, slotWhere, "a rule is listed twice in checks");
      for (const [rule, verdict] of expectedChecks) {
        if (verdict.verdict === "not_met") continue;
        const check = listed.get(rule);
        if (check === undefined) {
          fault(2, slotWhere, `checks does not list ${rule}`);
          continue;
        }
        if (verdict.verdict === "met") {
          if (check.verdict !== "met") fault(2, slotWhere, `${rule} is met by the records but checks says ${check.verdict}`);
          else {
            if (check.restsOn.kind !== verdict.basis) fault(2, slotWhere, `${rule} rests on ${check.restsOn.kind}, the newest record is a ${verdict.basis} report`);
            if (check.restsOn.factId === undefined || !verdict.factIds.includes(check.restsOn.factId)) {
              fault(2, slotWhere, `${rule} rests on fact ${String(check.restsOn.factId)}, the newest records are ${verdict.factIds.join(", ")}`);
            }
          }
        } else if (check.verdict !== "not_known") {
          fault(2, slotWhere, `${rule} has no record but checks says ${check.verdict}`);
        } else if (check.reason !== verdict.reason) {
          fault(2, slotWhere, `${rule} is not known because of ${verdict.reason}, checks says ${check.reason}`);
        }
      }
      for (const rule of listed.keys()) {
        if (!expectedChecks.has(rule)) fault(2, slotWhere, `checks lists ${rule}, which no traveller present has or which does not apply to this category`);
      }

      // A meal is a place to eat; a need stop serves its need.
      if ((stop.slot.endsWith(".lunch") || stop.slot.endsWith(".dinner")) && !foodCategory(candidate.category, region)) {
        fault(1, slotWhere, `a meal at a ${String(candidate.category)}`);
      }
      if (stop.because.kind === "need" && (stop.because.need === "prayer" || stop.because.need === "work" || (stop.because.need as string) === "rest")) {
        if (!servesNeed(stop.because.need as "prayer" | "work" | "rest", candidate, region, reference)) {
          fault(4, slotWhere, `${candidate.placeId} has no fresh record that it serves ${stop.because.need}`);
        }
      }
    }
  });

  // Invariant 5: pins and kept stops.
  for (const pin of request.pins) {
    const slot = `d${pin.day}.pin.${pin.id}`;
    const placed = stopsOf(plan).find((entry) => entry.stop.slot === slot);
    if (placed === undefined) {
      fault(5, slot, "the pin is not in the plan");
      continue;
    }
    const { stop } = placed;
    const sameThing = "pinId" in stop.place ? stop.place.pinId === pin.id : stop.place.placeId === pin.placeId;
    if (!sameThing) fault(5, slot, "the stop is not the pinned place");
    if (placed.day !== pin.day) fault(5, slot, `the pin is on day ${placed.day}, not ${pin.day}`);
    if (pin.at !== undefined && stop.at !== pin.at) fault(5, slot, `the pin was set for ${pin.at}, the stop is at ${stop.at}`);
    if (stop.minutes !== pin.minutes) fault(5, slot, `the pin was set for ${pin.minutes} minutes, the stop is ${stop.minutes}`);
  }
  for (const kept of request.keep?.stops ?? []) {
    const placed = stopsOf(plan).find((entry) => entry.stop.slot === kept.slot);
    const movedEntry = plan.moved?.find((entry) => entry.slot === kept.slot);
    const samePlace =
      placed !== undefined &&
      JSON.stringify("placeId" in kept.place ? { id: kept.place.placeId } : { pin: kept.place.pinId }) ===
        JSON.stringify("placeId" in placed.stop.place ? { id: placed.stop.place.placeId } : { pin: placed.stop.place.pinId });
    if (kept.hold === "time") {
      if (!samePlace) fault(5, kept.slot, "a stop held by time lost its place");
      else if (placed!.stop.at !== kept.at) fault(5, kept.slot, `a stop held by time moved from ${kept.at} to ${placed!.stop.at}`);
    } else if (!samePlace && movedEntry === undefined) {
      fault(5, kept.slot, "a stop held by place changed place and is not listed in moved");
    }
  }

  if (context.turns !== false) faults.push(...turnFaults(plan, request));

  return faults;
}

/**
 * Invariant 6 and R13: among travellers with likes who are on the same days, turn counts differ by
 * at most one; on a day with at least as many open slots as such travellers each has one; those
 * left out of a short day go first the next; a traveller with no likes takes no turn; a traveller
 * is only given a turn on a day they are on. `exempt` slots (given by `more_for`) are not counted.
 */
export function turnFaults(
  plan: Plan,
  request: TripRequest,
  exempt: ReadonlySet<string> = new Set(),
  /** How many `more_for` ops were applied. Each moves one turn from a traveller to another, which changes the gap between two counts by two, so the bound is 1 + 2n (ruling 7 says 1 + n; see the report). */
  moreFor = 0,
): Fault[] {
  const faults: Fault[] = [];
  const fault = (where: string, message: string) => faults.push({ invariant: 6, where, message });
  const travellers = request.party.travellers;
  const likers = travellers.filter((traveller) => traveller.likes.length > 0);
  const daysOf = (traveller: (typeof travellers)[number]) =>
    traveller.days ?? Array.from({ length: request.days }, (_, i) => i + 1);
  const counts = new Map<string, number>(likers.map((traveller) => [traveller.key, 0]));
  const takersByDay = new Map<number, string[]>();

  for (const day of plan.days) {
    const present = travellersOn(request, day.index);
    const presentLikers = present.filter((traveller) => traveller.likes.length > 0);
    const stops = day.items.filter((item): item is Stop => item.kind === "stop");
    const openSlots = stops.filter((stop) => /\.open\d+$/.test(stop.slot));
    const takers: string[] = [];
    for (const stop of stops) {
      const because = stop.because;
      if (because.kind !== "turn" && because.kind !== "paired") continue;
      const owner = travellers.find((traveller) => traveller.key === because.for);
      const where = `day ${day.index} ${stop.slot}`;
      if (owner === undefined) {
        fault(where, `a stop for ${because.for}, who is not in the party`);
        continue;
      }
      if (!present.includes(owner)) fault(where, `a stop for ${owner.key}, who is not on day ${day.index}`);
      if (owner.likes.length === 0) fault(where, `a stop for ${owner.key}, who has no likes`);
      if (because.kind === "turn") {
        for (const like of because.likes) {
          if (!owner.likes.includes(like)) fault(where, `the turn names ${like}, which ${owner.key} did not say they like`);
        }
        if (!exempt.has(stop.slot)) {
          takers.push(owner.key);
          counts.set(owner.key, (counts.get(owner.key) ?? 0) + 1);
        }
      } else {
        const partner = travellers.find((traveller) => traveller.key === because.with);
        if (partner === undefined || !present.includes(partner) || partner.key === owner.key) {
          fault(where, `a paired stop with ${because.with}, who is not another traveller on the day`);
        }
        const base = stops.find((candidate) => candidate.slot === stop.slot.replace(/\.pair$/, ""));
        if (base === undefined || base.because.kind !== "turn" || base.because.for !== because.with) {
          fault(where, "a paired stop that does not sit beside the turn of the traveller it is paired with");
        }
      }
    }
    takersByDay.set(day.index, takers);

    if (openSlots.length >= presentLikers.length && openSlots.length > 0 && exempt.size === 0 && moreFor === 0) {
      for (const traveller of presentLikers) {
        if (!takers.includes(traveller.key)) {
          fault(`day ${day.index}`, `${traveller.key} has no turn on a day with ${openSlots.length} open slots for ${presentLikers.length} travellers with likes`);
        }
      }
    }

    // Those left out of a short day go first the next day.
    const before = plan.days.find((entry) => entry.index === day.index - 1);
    if (before !== undefined && exempt.size === 0 && moreFor === 0) {
      const beforeLikers = travellersOn(request, before.index).filter((traveller) => traveller.likes.length > 0);
      const beforeOpen = before.items.filter((item) => item.kind === "stop" && /\.open\d+$/.test(item.slot)).length;
      const beforeTakers = takersByDay.get(before.index) ?? [];
      const left = presentLikers.filter(
        (traveller) => beforeLikers.includes(traveller) && !beforeTakers.includes(traveller.key),
      );
      if (beforeOpen > 0 && beforeOpen < beforeLikers.length && left.length > 0 && takers.length >= left.length) {
        const firstTakers = takers.slice(0, left.length);
        for (const traveller of left) {
          if (!firstTakers.includes(traveller.key)) {
            fault(`day ${day.index}`, `${traveller.key} went without a turn on day ${before.index} and is not among the first ${left.length} turns of day ${day.index} (${firstTakers.join(", ")})`);
          }
        }
      }
    }
  }

  // Over the trip, among travellers on the same days, counts differ by at most one.
  const groups = new Map<string, string[]>();
  for (const traveller of likers) {
    const key = JSON.stringify([...daysOf(traveller)].sort());
    groups.set(key, [...(groups.get(key) ?? []), traveller.key]);
  }
  for (const [days, keys] of groups) {
    const values = keys.map((key) => counts.get(key) ?? 0);
    if (Math.max(...values) - Math.min(...values) > 1 + 2 * moreFor) {
      fault("plan", `travellers on days ${days} have turn counts ${keys.map((key, i) => `${key}=${values[i]}`).join(", ")}; they may differ by ${1 + 2 * moreFor}`);
    }
  }
  return faults;
}

function checkSlot(
  stop: Stop,
  day: number,
  where: string,
  openNumbers: number[],
  slotsSeen: Set<string>,
  fault: (invariant: number | string, where: string, message: string) => void,
) {
  if (slotsSeen.has(stop.slot)) fault("shape", where, "a slot id is used twice");
  slotsSeen.add(stop.slot);
  const pair = PAIR_SLOT.exec(stop.slot);
  const match = SLOT.exec(stop.slot);
  if (pair === null && match === null) {
    fault("shape", where, `${stop.slot} is not a slot id of the contract`);
    return;
  }
  const slotDay = Number((pair ?? match)![1]);
  if (slotDay !== day) fault("shape", where, `${stop.slot} sits on day ${day}`);
  if (pair !== null) {
    if (stop.because.kind !== "paired") fault("shape", where, `a .pair slot with because ${stop.because.kind}`);
    return;
  }
  if (match![3] !== undefined) openNumbers.push(Number(match![3]));
  if (stop.because.kind === "paired") fault("shape", where, "because paired on a slot that is not a .pair slot");
  if (/\.(lunch|dinner)$/.test(stop.slot) && !(stop.because.kind === "need" && stop.because.need === "meal")) {
    fault("shape", where, `a meal slot with because ${stop.because.kind}`);
  }
}

function checkRoute(
  plan: Plan,
  request: TripRequest,
  region: RegionTripSettings,
  fault: (invariant: number | string, where: string, message: string) => void,
) {
  const routeUnmet = plan.unmet.filter((entry) => entry.what === "route");
  const limit = request.party.limits.dayDriveMinutes;
  const guessed = request.party.guessed.includes("dayDrive");
  const legs = request.nights !== undefined ? legMinutes(request, region) : undefined;
  const infeasible = !guessed && legs !== undefined && legs.some((minutes) => minutes > limit);

  if (plan.days.length === 0) {
    if (routeUnmet.length !== 1) fault(3, "plan", `no days and ${routeUnmet.length} route entries in unmet`);
    else if (routeUnmet[0]!.choices.length !== 3 || new Set(routeUnmet[0]!.choices).size !== 3) {
      fault(3, "plan", `the route entry has choices ${JSON.stringify(routeUnmet[0]!.choices)}; three different ones are wanted`);
    }
    if (legs !== undefined && !infeasible) fault(3, "plan", `no days, but every leg fits the limit of ${limit} (${legs.join(", ")})`);
  } else {
    if (routeUnmet.length > 0) fault(3, "plan", "days were planned and unmet also holds a route entry");
    if (infeasible) fault(3, "plan", `days planned, but a leg of ${Math.max(...legs!)} minutes cannot fit the limit the organiser set (${limit})`);
  }
  for (const entry of plan.unmet) {
    if (entry.detail.trim() === "" || /\s/.test(entry.detail)) {
      fault("shape", `unmet ${entry.what}`, `detail ${JSON.stringify(entry.detail)} is not a reason code`);
    }
  }
}
