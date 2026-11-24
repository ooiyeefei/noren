import { distanceMetres } from "../overture/dedupe";
import { checkRule } from "../facts/rules";
import { placeKey } from "./checker";
import { travellersOn } from "./checks";
import { layOutDays, ROUTE_CHOICES } from "./days";
import { anchorsFor, planBaseTrip, type SlotEdit } from "./engine";
import { detourMetres } from "./roads";
import type {
  Anchor,
  Candidate,
  ChangeOp,
  KeptStop,
  LatLng,
  Plan,
  Stop,
  TripRequest,
  World,
} from "./types";

type Outcome = { request: TripRequest; plan: Plan };
type Visit = { day: number; stop: Stop; previous?: LatLng };
type Fault = Plan["unmet"][number];
export const TRIP_CHANGE_CHOICES = ["keep_plan", "choose_another_change"] as const;
const OPEN = /\.open\d+$/;

function keyOf(stop: Stop | undefined) {
  return stop && placeKey(stop.place);
}

export function anchorKey({ near, withinMetres }: Anchor): string {
  return `${near.lat}|${near.lng}|${withinMetres}`;
}

/** Replanning several times during one change must see the same candidates at each anchor. */
export function cachedWorld(world: World, allowed?: ReadonlySet<string>): World {
  const cache = new Map<string, Candidate[]>();
  return {
    ...world,
    candidates(near, withinMetres) {
      const key = anchorKey({ near, withinMetres });
      if (allowed && !allowed.has(key)) return [];
      let found = cache.get(key);
      if (!found) {
        found = world.candidates(near, withinMetres);
        cache.set(key, found);
      }
      return found;
    },
  };
}

function visitsOf(
  plan: Plan,
  request: TripRequest,
  world: World,
  candidates: ReadonlyMap<string, Candidate>,
): Visit[] {
  const roadPoints = new Map(world.region.roads?.points.map(({ id, pin }) => [id, pin]));
  const pins = new Map(request.pins.map(({ id, pin }) => [id, pin]));
  const visits: Visit[] = [];
  let point = roadPoints.get(request.start);
  for (const day of plan.days) {
    for (const item of day.items) {
      if (item.kind === "drive") point = roadPoints.get(item.to);
      if (item.kind !== "stop") continue;
      visits.push({ stop: item, day: day.index, previous: point });
      const { place } = item;
      point =
        ("placeId" in place ? candidates.get(place.placeId)?.pin : pins.get(place.pinId)) ?? point;
    }
    if (day.night) point = roadPoints.get(day.night) ?? point;
  }
  return visits;
}

function storedSkips(request: TripRequest, current: ReadonlyMap<string, Visit>): Set<string> {
  return new Set(
    (request.ops ?? []).flatMap((op) =>
      op.op === "skip" && !current.has(op.slot) ? [op.slot] : [],
    ),
  );
}

function refuse(
  original: Outcome,
  detail: string,
  context: Partial<Pick<Fault, "what" | "day" | "slot" | "choices">> = {},
): Outcome {
  const entry: Fault = { what: "change", detail, choices: [...TRIP_CHANGE_CHOICES], ...context };
  return {
    request: original.request,
    plan: { ...original.plan, unmet: [...original.plan.unmet, entry] },
  };
}

function keepVisit(visit: Visit, holds: ReadonlySet<string>): KeptStop {
  const { day, stop } = visit;
  return {
    day,
    slot: stop.slot,
    place: stop.place,
    at: stop.at,
    minutes: stop.minutes,
    because: stop.because,
    hold: holds.has(stop.slot) ? "time" : "place",
  };
}

function roadNightRequest(
  request: TripRequest,
  plan: Plan,
  op: Extract<ChangeOp, { op: "move_night" }>,
) {
  const nights = request.nights ?? plan.days.slice(0, -1).map(({ night }) => night!);
  return { ...request, nights: nights.map((id, index) => (index === op.night - 1 ? op.to : id)) };
}

function missingOpFault(plan: Plan, original: Plan): Fault | undefined {
  return plan.unmet.find((fault) => {
    const previous = original.unmet.some(
      ({ what, day, slot, detail }) =>
        what === fault.what && day === fault.day && slot === fault.slot && detail === fault.detail,
    );
    if (previous) return false;
    return (
      fault.what === "route" ||
      fault.what === "stretch" ||
      fault.detail === "pinned_rule_not_met" ||
      fault.detail === "pin_not_kept" ||
      fault.detail === "stop_not_kept" ||
      fault.detail === "after_lunch_rest_missing" ||
      fault.detail === "need_missing" ||
      fault.detail === "need_not_served" ||
      (fault.detail === "fixed_time_conflict" && fault.what === "change") ||
      (fault.detail === "day_end" && fault.what === "rest")
    );
  });
}

const MOVE_REASONS: Record<ChangeOp["op"], string> = {
  redraw: "redrawn",
  skip: "skipped",
  add_pin: "pin_added",
  lighten: "lightened",
  stay_longer: "stay_extended",
  quieter: "drawn_quieter",
  shorter_walks: "drawn_shorter_walk",
  more_for: "turn_given",
  weather: "drawn_indoors",
  move_night: "night_moved",
};

function changesOf(before: Visit[], after: ReadonlyMap<string, Stop>, op: ChangeOp) {
  return before.flatMap(({ stop }): NonNullable<Plan["moved"]> => {
    const was = keyOf(stop);
    const now = keyOf(after.get(stop.slot));
    return was === now
      ? []
      : [{ slot: stop.slot, was, ...(now && { now }), why: MOVE_REASONS[op.op] }];
  });
}

function sameDayPlaces(before: Plan["days"][number], after: Plan["days"][number]): boolean {
  const visible = (day: Plan["days"][number]) =>
    day.items.flatMap((item) =>
      item.kind === "stop"
        ? [
            {
              slot: item.slot,
              place: item.place,
              checks: item.checks,
              because: item.because,
              confirmed: item.confirmed,
              hasStory: item.hasStory,
            },
          ]
        : [],
    );
  return (
    JSON.stringify(visible(before)) === JSON.stringify(visible(after)) &&
    before.night === after.night &&
    before.driveMinutes === after.driveMinutes
  );
}

export function applyChange(request: TripRequest, plan: Plan, op: ChangeOp, input: World): Outcome {
  const original = { request, plan };
  const world = cachedWorld(input);
  const trip = world.region.trip;
  if (!trip || plan.days.length === 0) return refuse(original, "change_no_plan");
  const candidates = new Map<string, Candidate>();
  for (const { near, withinMetres } of anchorsFor({ ...request, ops: undefined }, world.region)) {
    for (const place of world.candidates(near, withinMetres)) candidates.set(place.placeId, place);
  }
  const visits = visitsOf(plan, request, world, candidates);
  const current = new Map(visits.map((visit) => [visit.stop.slot, visit]));
  const holds = new Set(
    request.keep?.stops.filter(({ hold }) => hold === "time").map(({ slot }) => slot),
  );
  for (const pin of request.pins) if (pin.at) holds.add(`d${pin.day}.pin.${pin.id}`);

  const persisted = storedSkips(request, current);
  const disabled = new Set(persisted);
  const touched = new Set<number>();
  const edits = new Map<string, SlotEdit>();
  const fallback = new Map<string, string>();
  const exempt = new Set<string>();
  const removed = new Set<string>();
  const openOn = (day?: number) =>
    visits.filter(
      ({ stop, day: index }) =>
        (day === undefined || day === index) && OPEN.test(stop.slot) && !holds.has(stop.slot),
    );
  const pickAgain = (visit: Visit, edit: SlotEdit, otherwise?: string) => {
    touched.add(visit.day);
    const because = edit.because ?? visit.stop.because;
    edits.set(visit.stop.slot, {
      ...edit,
      because,
      ...(because.kind === "paired" && { prior: keepVisit(visit, holds) }),
    });
    if (otherwise) fallback.set(visit.stop.slot, otherwise);
  };
  const takeOut = ({ stop, day }: Visit) => {
    disabled.add(stop.slot);
    persisted.add(stop.slot);
    removed.add(stop.slot);
    touched.add(day);
  };
  const dayExists = (day: number) => plan.days.some(({ index }) => index === day);

  let draftRequest: TripRequest = { ...request, ops: undefined };
  let required: string | undefined;
  let longer: { slot: string; minutes: number } | undefined;
  let newPin: string | undefined;
  let movedRoute: Set<number> | undefined;
  const reference = request.startDate ?? world.today;

  switch (op.op) {
    case "redraw":
    case "skip":
    case "stay_longer": {
      const visit = current.get(op.slot);
      if (!visit) return refuse(original, "change_unknown_slot", { slot: op.slot });
      const isPin = "pinId" in visit.stop.place;
      if (op.op !== "stay_longer" && (holds.has(op.slot) || isPin)) {
        return refuse(original, "change_slot_held", { day: visit.day, slot: op.slot });
      }
      if (op.op === "redraw") {
        const parent =
          visit.stop.because.kind === "paired"
            ? current.get(op.slot.replace(/\.pair$/, ""))
            : undefined;
        const origin = parent && candidates.get(keyOf(parent.stop)!)?.pin;
        if (visit.stop.because.kind === "paired" && !origin) {
          return refuse(original, "change_no_replacement", { day: visit.day, slot: op.slot });
        }
        pickAgain(
          visit,
          origin
            ? {
                accepts: (candidate) =>
                  detourMetres(origin, candidate.pin, trip) <= trip.walkLimitMetres,
              }
            : {},
        );
        required = op.slot;
      } else if (op.op === "skip") {
        takeOut(visit);
      } else {
        if (!(op.minutes > 0) || visit.stop.minutes + op.minutes > 24 * 60) {
          return refuse(original, "change_invalid_minutes", { day: visit.day, slot: op.slot });
        }
        touched.add(visit.day);
        longer = { slot: op.slot, minutes: visit.stop.minutes + op.minutes };
        if (isPin) {
          const pinId = keyOf(visit.stop);
          draftRequest.pins = request.pins.map((pin) =>
            pin.id === pinId && pin.day === visit.day
              ? { ...pin, minutes: visit.stop.minutes + op.minutes }
              : pin,
          );
        }
      }
      break;
    }
    case "add_pin":
      if (
        !dayExists(op.pin.day) ||
        request.pins.length >= 12 ||
        request.pins.some(({ id }) => id === op.pin.id)
      ) {
        return refuse(original, "change_invalid_pin", { day: op.pin.day });
      }
      draftRequest.pins = [...request.pins, op.pin];
      newPin = `d${op.pin.day}.pin.${op.pin.id}`;
      if (op.pin.at) holds.add(newPin);
      touched.add(op.pin.day);
      break;
    case "lighten": {
      const last = openOn(op.day).at(-1);
      if (!last) return refuse(original, "change_no_open_stop", { day: op.day });
      takeOut(last);
      break;
    }
    case "more_for": {
      const target = openOn().find(
        ({ day, stop }) =>
          day >= (op.day ?? 1) &&
          (stop.because.kind !== "turn" || stop.because.for !== op.who) &&
          travellersOn(request.party, day).some(
            ({ key, likes }) => key === op.who && likes.length > 0,
          ),
      );
      if (!target) return refuse(original, "change_no_turn_for_traveller", { day: op.day });
      const who = request.party.travellers.find(({ key }) => key === op.who)!;
      pickAgain(target, { because: { kind: "turn", for: who.key, likes: [...who.likes] } });
      required = target.stop.slot;
      exempt.add(required);
      break;
    }
    case "quieter":
    case "shorter_walks":
    case "weather": {
      if (op.day !== undefined && !dayExists(op.day)) {
        return refuse(original, "change_unknown_day", { day: op.day });
      }
      const quiet = (place: Candidate) =>
        checkRule("quiet", place, world.region, reference).verdict === "met";
      const indoor = (place: Candidate) => trip.indoorCategories.includes(place.category ?? "");
      for (const visit of openOn(op.day)) {
        const { stop, previous } = visit;
        const place = candidates.get(keyOf(stop)!);
        if (op.op === "quieter" && (!place || !quiet(place))) {
          pickAgain(visit, { accepts: quiet }, "no_quiet_place_in_reach");
        } else if (op.op === "weather" && (!place || !indoor(place))) {
          pickAgain(visit, { accepts: indoor }, "no_indoor_place_in_reach");
        } else if (
          op.op === "shorter_walks" &&
          stop.legBefore?.how === "walk" &&
          stop.legBefore.metres > trip.walkLimitMetres / 2 &&
          previous
        ) {
          pickAgain(
            visit,
            {
              accepts: (place) =>
                detourMetres(previous, place.pin, trip) <= trip.walkLimitMetres / 2,
            },
            "no_shorter_walk_in_reach",
          );
        }
      }
      break;
    }
    case "move_night": {
      if (
        op.night < 1 ||
        op.night >= request.days ||
        !world.region.roads?.points.some(({ id }) => id === op.to)
      ) {
        return refuse(original, "change_invalid_night", { day: op.night });
      }
      draftRequest = roadNightRequest(draftRequest, plan, op);
      movedRoute = new Set([op.night, op.night + 1]);
      for (const day of movedRoute) touched.add(day);
      const laidOut = layOutDays(draftRequest, world.region);
      if (!laidOut.route.length) {
        return refuse(original, "change_night_over_drive_limit", {
          what: "dayDrive",
          day: op.night,
          choices: [...ROUTE_CHOICES],
        });
      }
      for (const visit of visits) {
        if (!movedRoute.has(visit.day) || holds.has(visit.stop.slot) || "pinId" in visit.stop.place)
          continue;
        const day = laidOut.route.find(({ index }) => index === visit.day)!;
        const place = candidates.get(keyOf(visit.stop)!);
        const onDay =
          place &&
          world.region.towns?.some(
            (town) =>
              day.points.some(({ id }) => (town.onRoad ?? town.id) === id) &&
              distanceMetres(place.pin, town.center) <= town.radiusMetres,
          );
        if (!onDay) pickAgain(visit, {});
      }
      break;
    }
  }

  const fullness = trip.turnsPerDay[request.party.fullness];
  for (const day of plan.days) {
    if (movedRoute?.has(day.index)) continue;
    for (let number = 1; number <= fullness; number++) {
      const slot = `d${day.index}.open${number}`;
      if (!current.has(slot)) disabled.add(slot);
    }
  }
  const trialAvoid = new Set(request.avoid);
  for (const slot of [...edits.keys(), ...removed]) {
    const stop = current.get(slot)?.stop;
    if (stop && "placeId" in stop.place) trialAvoid.add(stop.place.placeId);
  }
  const filters = new Map(edits);
  const failed = new Map<string, string>();
  const heldFor = () =>
    visits.flatMap((visit) => {
      const { stop } = visit;
      if (removed.has(stop.slot) || filters.has(stop.slot)) return [];
      const keep = keepVisit(visit, holds);
      if (longer?.slot === stop.slot) keep.minutes = longer.minutes;
      return [keep];
    });

  const replan = () =>
    planBaseTrip({ ...draftRequest, avoid: [...trialAvoid], keep: { stops: heldFor() } }, world, {
      disabled,
      edits: filters,
      exempt,
      keepPairsOnly: true,
    });
  const bySlot = (next: Plan) =>
    new Map(
      next.days.flatMap(({ items }) =>
        items.flatMap((item) => (item.kind === "stop" ? [[item.slot, item] as const] : [])),
      ),
    );
  let next = replan();
  let nextStops = bySlot(next);

  for (let attempt = 0; attempt < fallback.size; attempt++) {
    const failedNow = [...fallback].filter(([slot]) => {
      if (!filters.has(slot)) return false;
      const stop = nextStops.get(slot);
      if (!stop) return true;
      const leg = stop.legBefore;
      return (
        op.op === "shorter_walks" &&
        leg !== undefined &&
        (leg.how === "drive" || leg.metres > trip.walkLimitMetres / 2)
      );
    });
    if (!failedNow.length) break;
    for (const [slot, reason] of failedNow) {
      filters.delete(slot);
      failed.set(slot, reason);
    }
    next = replan();
    nextStops = bySlot(next);
  }
  if (required && !nextStops.has(required)) {
    return refuse(original, "change_no_replacement", {
      day: current.get(required)?.day,
      slot: required,
    });
  }
  if (newPin && !nextStops.has(newPin))
    return refuse(original, "change_invalid_pin", { slot: newPin });

  if (op.op === "add_pin" || op.op === "stay_longer") {
    const over = missingOpFault(next, plan);
    if (over?.detail === "day_end" && over.day !== undefined) {
      const last = openOn(over.day).findLast(({ stop }) => stop.slot !== longer?.slot);
      if (last) {
        takeOut(last);
        next = replan();
        nextStops = bySlot(next);
      }
    }
  }
  const detached = visits.filter(({ stop }) => {
    const now = nextStops.get(stop.slot);
    if (now?.because.kind !== "paired") return false;
    const parent = nextStops.get(stop.slot.replace(/\.pair$/, ""));
    if (parent?.because.kind !== "turn" || parent.because.for !== now.because.with) return true;
    const from = candidates.get(keyOf(parent)!)?.pin;
    const to = candidates.get(keyOf(now)!)?.pin;
    return from && to && detourMetres(from, to, trip) > trip.walkLimitMetres;
  });
  if (detached.some(({ stop }) => holds.has(stop.slot)))
    return refuse(original, "change_slot_held");
  for (const visit of detached) {
    filters.delete(visit.stop.slot);
    takeOut(visit);
  }
  if (detached.length) {
    next = replan();
    nextStops = bySlot(next);
  }

  const fault = missingOpFault(next, plan);
  if (!next.days.length || fault) {
    return refuse(original, fault?.detail ?? "change_does_not_fit", {
      ...(fault?.day !== undefined && { day: fault.day }),
      ...(fault?.slot && { slot: fault.slot }),
      what: fault?.what === "route" ? "dayDrive" : (fault?.what ?? "change"),
      choices: fault?.choices.length ? fault.choices : [...TRIP_CHANGE_CHOICES],
    });
  }

  if (required && !nextStops.has(required)) {
    return refuse(original, "change_no_replacement", {
      day: current.get(required)?.day,
      slot: required,
    });
  }
  const moved = changesOf(visits, nextStops, op);
  const avoid = new Set(request.avoid);
  for (const { slot } of moved) {
    const stop = current.get(slot)?.stop;
    if (stop && "placeId" in stop.place) avoid.add(stop.place.placeId);
  }
  if (avoid.size > 60 || persisted.size > 20) return refuse(original, "change_history_full");

  for (const [slot, detail] of failed) {
    next.unmet.push({
      what: "change",
      day: current.get(slot)?.day,
      slot,
      detail,
      choices: [...TRIP_CHANGE_CHOICES],
    });
  }
  next.days = next.days.map((day) => {
    const previous = plan.days.find(({ index }) => index === day.index);
    return !touched.has(day.index) && previous && sameDayPlaces(previous, day) ? previous : day;
  });
  next.moved = moved;
  const finalVisits = visitsOf(next, draftRequest, world, candidates);
  return {
    request: {
      ...draftRequest,
      keep: { stops: finalVisits.map((visit) => keepVisit(visit, holds)) },
      avoid: [...avoid],
      ...(persisted.size && { ops: [...persisted].map((slot) => ({ op: "skip" as const, slot })) }),
    },
    plan: next,
  };
}
