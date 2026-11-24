import { distanceMetres } from "../overture/dedupe";
import { calendarFor, datePlusDays, weekdayOf } from "./calendar";
import { anchorKey, applyChange, cachedWorld } from "./change";
import { checkDay, checkTurns, placeKey } from "./checker";
import { layOutDays, type RouteDay } from "./days";
import { fillDay, pickPairedStop } from "./pick";
import { travellersOn } from "./checks";
import { closestPoint } from "./roads";
import { clockMinutes, slotsFor, type Slot } from "./slots";
import { timeDay } from "./times";
import { turnsFor, type DayTurns } from "./turns";
import type {
  Anchor,
  Candidate,
  LatLng,
  Plan,
  RegionTripSettings,
  Stop,
  TripRequest,
  World,
} from "./types";

export const TRIP_REASON_CODES = [
  "region_has_no_trip",
  "unknown_road_point",
  "over_day_drive_limit",
  "over_day_drive_guess",
  "over_stretch_limit",
  "fixed_time_conflict",
  "place_unavailable",
  "pinned_place_unavailable",
  "kept_place_unavailable",
  "pinned_rule_not_met",
  "rule_not_met",
  "after_lunch_rest_missing",
  "need_missing",
  "pin_not_kept",
  "stop_not_kept",
  "no_food_in_reach",
  "no_place_for_need",
  "no_open_place_in_reach",
  "day_end",
  "kept_rule_not_met",
  "mostly_driving",
  "busy_travel_day",
  "no_stories_in_town",
  "drive_disconnected",
  "route_end_not_reached",
  "drive_minutes_mismatch",
  "need_not_served",
  "turn_not_available",
  "turn_missed",
  "turn_balance",
  "redrawn",
  "skipped",
  "pin_added",
  "lightened",
  "stay_extended",
  "drawn_quieter",
  "drawn_shorter_walk",
  "turn_given",
  "drawn_indoors",
  "night_moved",
  "change_no_plan",
  "change_unknown_slot",
  "change_slot_held",
  "change_invalid_minutes",
  "change_invalid_pin",
  "change_no_open_stop",
  "change_no_turn_for_traveller",
  "change_unknown_day",
  "change_invalid_night",
  "change_night_over_drive_limit",
  "change_no_replacement",
  "change_does_not_fit",
  "change_history_full",
  "no_quiet_place_in_reach",
  "no_indoor_place_in_reach",
  "no_shorter_walk_in_reach",
] as const;

export type SlotEdit = {
  because?: Stop["because"];
  accepts?: (candidate: Candidate) => boolean;
  prior?: import("./types").KeptStop;
};
export type PlanningOptions = {
  disabled?: ReadonlySet<string>;
  edits?: ReadonlyMap<string, SlotEdit>;
  exempt?: ReadonlySet<string>;
  keepPairsOnly?: boolean;
};

type RouteAnchor = Anchor & { point: string; kind: "town" | "road" };
type DaySlots = { day: RouteDay; slots: Slot[] };
type CandidateLookup = (point: string) => Candidate[];

function prepare(request: TripRequest, region: RegionTripSettings) {
  const { route, unmet } = layOutDays(request, region);
  const trip = region.trip;
  const roadPins = new Map(region.roads?.points.map(({ id, pin }) => [id, pin]));
  const towns = new Map<string, NonNullable<RegionTripSettings["towns"]>[number]>();
  for (const town of region.towns ?? []) {
    const id = town.onRoad ?? town.id;
    // A wider area can share a point with its main town. Use the town named by the route.
    if (!towns.has(id) || town.id === id) towns.set(id, town);
  }
  const days: DaySlots[] = [];
  const anchors: RouteAnchor[] = [];
  if (!trip) return { days, anchors, unmet, roadPins };
  const routePoints = new Set(route.flatMap(({ points }) => points.map(({ id }) => id)));
  for (const id of routePoints) {
    const town = towns.get(id);
    if (town)
      anchors.push({ kind: "town", point: id, near: town.center, withinMetres: town.radiusMetres });
  }

  const roadPriority = new Map<string, number>();
  const start = clockMinutes(trip.dayStart);
  const meals = [clockMinutes(request.party.meals.lunch), clockMinutes(request.party.meals.dinner)];
  for (const day of route) {
    const slots = slotsFor(request, day, trip, ({ pin }) =>
      closestPoint(day.points, pin, roadPins),
    );
    for (const [index, point] of day.points.entries()) {
      const here = slots.filter((slot) => slot.point === index);
      const meal = here.some(({ kind }) => kind === "meal");
      const need = here.some(({ kind }) => kind === "need");
      if (day.drives.length === 0 ? towns.has(point.id) : !meal && !need && !point.rest) continue;
      // An actual meal slot is at its requested time even if the party reaches the point early.
      const minutesFromMeal = Math.min(
        ...meals.map((time) => Math.abs(time - start - point.elapsed)),
      );
      const priority = meal && !towns.has(point.id) ? 0 : 1 + minutesFromMeal;
      roadPriority.set(point.id, Math.min(roadPriority.get(point.id) ?? Infinity, priority));
    }
    days.push({ day, slots });
  }
  for (const [point] of [...roadPriority].sort((a, b) => a[1] - b[1])) {
    anchors.push({
      kind: "road",
      point,
      near: roadPins.get(point)!,
      withinMetres: trip.roadPointReachMetres,
    });
  }
  const firstTwelve = new Set([...new Set(anchors.map(anchorKey))].slice(0, 12));
  return {
    days,
    anchors: anchors.filter((anchor) => firstTwelve.has(anchorKey(anchor))),
    unmet,
    roadPins,
  };
}

function listAnchors(anchors: RouteAnchor[]): Anchor[] {
  return [
    ...new Map(
      anchors.map(({ near, withinMetres }) => [
        anchorKey({ near, withinMetres }),
        { near, withinMetres },
      ]),
    ).values(),
  ];
}

export function anchorsFor(request: TripRequest, region: RegionTripSettings): Anchor[] {
  let routeRequest = request;
  const anchors = [...prepare(routeRequest, region).anchors];
  for (const op of request.ops ?? []) {
    if (op.op !== "move_night" || op.night < 1 || op.night >= request.days) continue;
    const nights =
      routeRequest.nights ??
      layOutDays(routeRequest, region)
        .route.slice(0, -1)
        .map(({ night }) => night!);
    const trial = {
      ...routeRequest,
      nights: nights.map((id, index) => (index === op.night - 1 ? op.to : id)),
    };
    const next = prepare(trial, region);
    if (next.days.length) {
      anchors.push(...next.anchors);
      routeRequest = trial;
    }
  }
  return listAnchors([
    ...anchors.filter(({ kind }) => kind === "town"),
    ...anchors.filter(({ kind }) => kind === "road"),
  ]).slice(0, 12);
}

function loadCandidates(anchors: RouteAnchor[], world: World) {
  const loaded = new Map(
    listAnchors(anchors).map((anchor) => [
      anchorKey(anchor),
      world
        .candidates(anchor.near, anchor.withinMetres)
        .filter((place) => distanceMetres(anchor.near, place.pin) <= anchor.withinMetres),
    ]),
  );
  const all = new Map<string, Candidate>();
  const byTown = new Map<string, Map<string, Candidate>>();
  const byRoad = new Map<string, Map<string, Candidate>>();
  for (const anchor of anchors) {
    const byPoint = anchor.kind === "town" ? byTown : byRoad;
    const local = byPoint.get(anchor.point) ?? new Map<string, Candidate>();
    for (const candidate of loaded.get(anchorKey(anchor)) ?? []) {
      local.set(candidate.placeId, candidate);
      all.set(candidate.placeId, candidate);
    }
    byPoint.set(anchor.point, local);
  }
  const town = (point: string) => [...(byTown.get(point)?.values() ?? [])];
  const near = (point: string, open = false) => {
    if (byTown.has(point) && (open || byTown.get(point)!.size > 0)) return town(point);
    return [...(byRoad.get(point)?.values() ?? [])];
  };
  return { all, near, town };
}

function noteCodes(
  day: RouteDay,
  draft: ReturnType<typeof timeDay>,
  busy: boolean,
  near: CandidateLookup,
): string[] {
  const notes = [];
  const stopMinutes = draft.scheduled.reduce((sum, { item }) => sum + item.minutes, 0);
  if (day.driveMinutes > stopMinutes) notes.push("mostly_driving");
  if (busy) notes.push("busy_travel_day");
  const candidates = day.points.flatMap(({ id }) => near(id));
  if (candidates.length > 0 && !candidates.some(({ hasStory }) => hasStory))
    notes.push("no_stories_in_town");
  return notes;
}

function fillAndTime(
  request: TripRequest,
  world: World,
  day: RouteDay,
  slots: Slot[],
  locations: ReturnType<typeof loadCandidates>,
  priorUsed: Set<string>,
  roadPins: ReadonlyMap<string, LatLng>,
  turns: DayTurns,
  exempt: ReadonlySet<string>,
  edits: ReadonlyMap<string, SlotEdit>,
) {
  const used = new Set(priorUsed);
  const filled = fillDay(
    request,
    world,
    day,
    slots,
    locations,
    used,
    roadPins,
    turns,
    exempt,
    edits,
  );
  const { drafts, draw, held, replaced } = filled;
  const trip = world.region.trip!;
  let timing = timeDay(day, drafts, trip, roadPins);
  const rejectedBySlot = new Map<string, Set<string>>();
  const check = () =>
    checkDay(
      {
        index: day.index,
        night: day.night,
        items: timing.items,
        driveMinutes: day.driveMinutes,
        calendar: [],
        notes: [],
      },
      timing,
      request,
      world,
      locations.all,
      replaced,
      day,
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    const faults = check();
    const index = drafts.findIndex(
      ({ slot, item }) =>
        item.kind === "stop" &&
        slot.kind !== "pin" &&
        !held.has(slot.id) &&
        faults.some(
          (fault) =>
            fault.slot === slot.id &&
            (fault.detail === "rule_not_met" ||
              fault.detail === "place_unavailable" ||
              fault.detail === "need_not_served"),
        ),
    );
    if (index === -1) break;
    const draft = drafts[index]!;
    if (draft.item.kind !== "stop") break;
    const id = placeKey(draft.item.place);
    const rejected = rejectedBySlot.get(draft.slot.id) ?? new Set<string>();
    rejected.add(id);
    rejectedBySlot.set(draft.slot.id, rejected);
    const replacement = draw(draft.slot, new Set([...used, ...rejected]));
    if (!replacement) break;
    used.delete(id);
    if (replacement.item.kind === "stop") used.add(placeKey(replacement.item.place));
    drafts[index] = replacement;
    timing = timeDay(day, drafts, trip, roadPins);
  }
  return { ...filled, timing, used, faults: check() };
}

function addPairs(
  filled: ReturnType<typeof fillAndTime>,
  day: RouteDay,
  request: TripRequest,
  world: World,
  locations: ReturnType<typeof loadCandidates>,
  roadPins: ReadonlyMap<string, LatLng>,
) {
  const trip = world.region.trip!;
  const travellers = travellersOn(request.party, day.index);
  if (!travellers.some(({ skips }) => skips.length)) return;
  const date = request.startDate ?? world.today;
  const primary = [...filled.drafts];
  for (const draft of primary) {
    if (filled.drafts.some(({ slot }) => slot.id === `${draft.slot.id}.pair`)) continue;
    const pool = locations.near(day.points[draft.point]!.id, true);
    const paired = pickPairedStop(draft, pool, filled.used, travellers, world, date);
    if (!paired || paired.item.kind !== "stop") continue;
    const drafts = [...filled.drafts, paired];
    const trial = timeDay(day, drafts, trip, roadPins);
    if (trial.end > clockMinutes(trip.dayEnd)) continue;
    const index = trial.scheduled.findIndex(({ draft }) => draft.slot.id === paired.slot.id);
    if (trial.scheduled[index - 1]?.draft.slot.id !== draft.slot.id) continue;
    const oldFixed = filled.timing.scheduled.filter(({ draft }) => draft.fixed !== undefined);
    if (
      oldFixed.some(({ draft, start }) =>
        trial.scheduled.some(
          (next) =>
            next.draft.slot.id === draft.slot.id &&
            (next.start !== start || next.arrival > (draft.fixed ?? Infinity)),
        ),
      )
    )
      continue;
    filled.drafts.push(paired);
    filled.timing = trial;
    filled.used.add(placeKey(paired.item.place));
  }
}

export function planBaseTrip(
  request: TripRequest,
  world: World,
  options: PlanningOptions = {},
): Plan {
  const { region } = world;
  const { days, anchors, unmet, roadPins } = prepare(request, region);
  const plan: Plan = { days: [], unmet };
  if (!region.trip || days.length === 0) return plan;
  const trip = region.trip;
  const locations = loadCandidates(anchors, world);
  const exempt = options.exempt ?? new Set<string>();
  const edits = new Map(options.edits);
  for (const id of options.disabled ?? []) {
    if (!/\.open\d+(?:\.pair)?$/.test(id)) edits.set(id, { accepts: () => false });
  }
  const turns = turnsFor(request.party, world.seed);
  let used = new Set(request.avoid);
  for (const { place } of request.keep?.stops ?? [])
    if ("placeId" in place) used.add(place.placeId);
  for (const { placeId } of request.pins) if (placeId) used.add(placeId);

  for (const { day, slots } of days) {
    const date = request.startDate && datePlusDays(request.startDate, day.index - 1);
    const states = (region.towns ?? []).flatMap((town) =>
      town.state && day.points.some(({ id }) => id === (town.onRoad ?? town.id))
        ? [town.state]
        : [],
    );
    const calendar = date ? calendarFor(region.calendar, date, states) : undefined;
    const active = new Set(
      slots
        .filter(({ id, kind }) => kind !== "open" || !options.disabled?.has(id))
        .map(({ id }) => id),
    );
    const fill = () =>
      fillAndTime(
        request,
        world,
        day,
        slots.filter(({ id }) => active.has(id)),
        locations,
        used,
        roadPins,
        turns(day.index, plan.days, exempt),
        exempt,
        edits,
      );
    let filled = fill();
    while (filled.timing.end > clockMinutes(trip.dayEnd)) {
      const last = filled.timing.scheduled.findLast(
        ({ draft }) =>
          draft.slot.kind === "open" &&
          active.has(draft.slot.id) &&
          !filled.held.has(draft.slot.id),
      );
      if (!last) {
        plan.unmet.push({ what: "rest", day: day.index, detail: "day_end", choices: [] });
        break;
      }
      const slot = last.draft.slot.id;
      active.delete(slot);
      plan.unmet.push({ what: "turn", day: day.index, slot, detail: "day_end", choices: [] });
      // A stop removed from the day must not reserve a place ahead of a later slot.
      filled = fill();
    }
    if (!options.keepPairsOnly) addPairs(filled, day, request, world, locations, roadPins);
    const { timing, moved, unmet: emptySlots, faults } = filled;
    used = filled.used;
    const output: Plan["days"][number] = {
      index: day.index,
      ...(day.night && { night: day.night }),
      ...(date && { date, weekday: weekdayOf(date) }),
      calendar: calendar?.entries ?? [],
      driveMinutes: day.driveMinutes,
      items: timing.items,
      notes: [],
    };
    for (const { draft, item } of timing.scheduled) {
      if (item.kind !== "rest" || (item.why !== "meal" && item.why !== "need")) continue;
      plan.unmet.push({
        what: "rest",
        day: day.index,
        slot: draft.slot.id,
        detail: item.why === "meal" ? "no_food_in_reach" : "no_place_for_need",
        choices: [],
      });
    }
    for (const move of moved) {
      const stop = output.items.find(
        (item): item is Stop => item.kind === "stop" && item.slot === move.slot,
      );
      if (stop) move.now = placeKey(stop.place);
    }
    plan.unmet.push(...emptySlots, ...faults);
    if (moved.length) (plan.moved ??= []).push(...moved);
    output.notes = noteCodes(day, timing, calendar?.busy ?? false, locations.town);
    plan.days.push(output);
  }
  plan.unmet.push(...checkTurns(plan, request, exempt));
  return plan;
}

export function planTrip(request: TripRequest, input: World): Plan {
  if (!request.ops?.length) return planBaseTrip(request, input);
  const world = cachedWorld(input, new Set(anchorsFor(request, input.region).map(anchorKey)));
  const { ops, ...base } = request;
  let current = { request: base, plan: planBaseTrip(base, world) };
  const moved = new Map<string, NonNullable<Plan["moved"]>[number]>();
  const outcomes: Plan["unmet"] = [];
  for (const op of ops) {
    const previous = current;
    current = applyChange(previous.request, previous.plan, op, world);
    if (current.request === previous.request) {
      const fault = current.plan.unmet.at(-1);
      if (fault) outcomes.push(fault);
      continue;
    }
    outcomes.push(
      ...current.plan.unmet.filter(
        (entry) =>
          entry.what === "change" &&
          entry.detail.startsWith("no_") &&
          !previous.plan.unmet.some(
            (prior) => prior.slot === entry.slot && prior.detail === entry.detail,
          ),
      ),
    );
    for (const entry of current.plan.moved ?? []) {
      const first = moved.get(entry.slot);
      moved.set(entry.slot, { ...entry, was: first?.was ?? entry.was });
    }
  }
  if (outcomes.length) {
    const recorded = new Set(outcomes);
    current.plan.unmet = [
      ...current.plan.unmet.filter((entry) => !recorded.has(entry)),
      ...outcomes,
    ];
  }
  if (moved.size) current.plan.moved = [...moved.values()].filter(({ was, now }) => was !== now);
  return current.plan;
}
