import { needsServed } from "../facts/rules";
import { checksFor, travellersOn } from "./checks";
import { ROUTE_CHOICES, type RouteDay } from "./days";
import type { Timing } from "./times";
import type { Candidate, KeptStop, Plan, TripRequest, World } from "./types";

type Fault = Plan["unmet"][number];

export function placeKey(place: KeptStop["place"]): string {
  return "placeId" in place ? place.placeId : place.pinId;
}

export function checkDay(
  day: Plan["days"][number],
  timing: Timing,
  request: TripRequest,
  world: World,
  candidates: ReadonlyMap<string, Candidate>,
  replaced: ReadonlySet<string>,
  route: RouteDay,
): Fault[] {
  const faults: Fault[] = [];
  const travellers = travellersOn(request.party, day.index);
  const date = request.startDate ?? world.today;
  const kept = request.keep?.stops.filter((stop) => stop.day === day.index) ?? [];
  const pins = request.pins.filter((pin) => pin.day === day.index);
  const add = (
    what: Fault["what"],
    detail: string,
    slot?: string,
    choices: readonly string[] = [],
  ) => {
    faults.push({ what, day: day.index, ...(slot && { slot }), detail, choices: [...choices] });
  };

  let stretch = 0;
  let overStretch = false;
  let minutes = 0;
  let point = route.points[0]!.id;
  for (const item of day.items) {
    if (item.kind === "drive") {
      if (item.from !== point) add("route", "drive_disconnected");
      point = item.to;
      minutes += item.minutes;
      stretch += item.minutes;
    } else {
      stretch = 0;
    }
    if (stretch > request.party.limits.stretchMinutes && !overStretch) {
      add("stretch", "over_stretch_limit", undefined, ROUTE_CHOICES);
    }
    overStretch = stretch > request.party.limits.stretchMinutes;
  }

  if (point !== route.points.at(-1)!.id) add("route", "route_end_not_reached");
  if (minutes !== day.driveMinutes) add("dayDrive", "drive_minutes_mismatch");
  if (
    minutes > request.party.limits.dayDriveMinutes &&
    !request.party.guessed.includes("dayDrive")
  ) {
    add("route", "over_day_drive_limit", undefined, ROUTE_CHOICES);
  }

  for (const { draft, item, arrival, start } of timing.scheduled) {
    const { slot, fixed } = draft;
    if (fixed !== undefined && (start !== fixed || arrival > fixed)) {
      add(
        slot.kind === "pin" || draft.keepTime ? "change" : "rest",
        "fixed_time_conflict",
        slot.id,
      );
    }
    if (item.kind !== "stop") {
      if (slot.kind === "need" && item.why !== "need") add("rest", "need_not_served", slot.id);
      continue;
    }
    const pin = pins.find(({ id }) => "pinId" in item.place && id === item.place.pinId);
    const id = "placeId" in item.place ? item.place.placeId : pin?.placeId;
    const candidate = id === undefined ? undefined : candidates.get(id);
    const keptPin =
      "pinId" in item.place && kept.some((keep) => placeKey(keep.place) === placeKey(item.place));
    if (!candidate && !pin && !keptPin && !draft.keepTime)
      add("change", "place_unavailable", slot.id);
    if (!candidate && pin?.placeId) add("rule", "pinned_place_unavailable", slot.id);
    if (!candidate && draft.keepTime && "placeId" in item.place)
      add("change", "kept_place_unavailable", slot.id);
    if (candidate) {
      const result = checksFor(candidate, travellers, world.region, date);
      if (slot.kind === "pin" ? result.notMet : !result.allowed) {
        add("rule", slot.kind === "pin" ? "pinned_rule_not_met" : "rule_not_met", slot.id);
      }
      if (
        slot.kind === "need" &&
        (item.because.kind !== "need" ||
          item.because.need !== slot.need ||
          !needsServed(candidate.facts, world.region, date).has(slot.need))
      ) {
        add("rest", "need_not_served", slot.id);
      }
    }
  }

  const lunch = timing.scheduled.find(({ draft }) => draft.slot.id === `d${day.index}.lunch`);
  for (const traveller of travellers) {
    if (!traveller.rests) continue;
    const rest = timing.scheduled.find(
      ({ draft }) => draft.slot.id === `d${day.index}.after_lunch.${traveller.key}`,
    );
    if (!lunch || !rest || rest.start < lunch.end || rest.item.minutes < traveller.rests.minutes) {
      add("rest", "after_lunch_rest_missing");
    }
  }
  const needs = request.party.needs.filter(
    ({ who }) => !who || travellers.some(({ key }) => who.includes(key)),
  );
  for (let index = 1; index <= needs.length; index++) {
    const slot = `d${day.index}.need${index}`;
    if (!timing.scheduled.some(({ draft }) => draft.slot.id === slot))
      add("rest", "need_missing", slot);
  }
  for (const pin of pins) {
    const slot = `d${day.index}.pin.${pin.id}`;
    if (
      !day.items.some(
        (item) =>
          item.kind === "stop" &&
          item.slot === slot &&
          "pinId" in item.place &&
          item.place.pinId === pin.id &&
          item.minutes === pin.minutes &&
          (!pin.at || item.at === pin.at),
      )
    ) {
      add("change", "pin_not_kept", slot);
    }
  }
  for (const keep of kept) {
    if (replaced.has(keep.slot) && keep.hold === "place") continue;
    if (
      !day.items.some(
        (item) =>
          item.kind === "stop" &&
          item.slot === keep.slot &&
          placeKey(item.place) === placeKey(keep.place) &&
          (keep.hold === "place" || item.at === keep.at),
      )
    ) {
      add("change", "stop_not_kept", keep.slot);
    }
  }
  return faults;
}

export function checkTurns(
  plan: Plan,
  request: TripRequest,
  exempt: ReadonlySet<string>,
): Plan["unmet"] {
  const faults: Plan["unmet"] = [];
  const likers = request.party.travellers.filter(({ likes }) => likes.length > 0);
  const groups = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const traveller of likers) {
    const key = plan.days
      .filter(({ index }) => traveller.days?.includes(index) ?? true)
      .map(({ index }) => index)
      .join(",");
    groups.set(key, [...(groups.get(key) ?? []), traveller.key]);
  }

  for (const day of plan.days) {
    const present = travellersOn(request.party, day.index).filter(({ likes }) => likes.length > 0);
    const today = new Set<string>();
    let openings = 0;
    let hasExemption = false;
    for (const item of day.items) {
      if (item.kind !== "stop" || !/\.open\d+$/.test(item.slot)) continue;
      openings++;
      if (item.because.kind !== "turn") continue;
      const turn = item.because;
      const traveller = present.find(({ key }) => key === turn.for);
      if (!traveller || turn.likes.some((like) => !traveller.likes.includes(like))) {
        faults.push({
          what: "turn",
          day: day.index,
          slot: item.slot,
          detail: "turn_not_available",
          choices: [],
        });
        continue;
      }
      if (exempt.has(item.slot)) {
        hasExemption = true;
        continue;
      }
      today.add(turn.for);
      counts.set(turn.for, (counts.get(turn.for) ?? 0) + 1);
    }
    if (!hasExemption && openings >= present.length && present.some(({ key }) => !today.has(key))) {
      faults.push({ what: "turn", day: day.index, detail: "turn_missed", choices: [] });
    }
  }
  // Each requested reassignment can remove one counted turn from the original traveller.
  const allowedDifference = 1 + exempt.size;
  for (const keys of groups.values()) {
    const totals = keys.map((key) => counts.get(key) ?? 0);
    if (Math.max(...totals) - Math.min(...totals) > allowedDifference) {
      faults.push({ what: "turn", detail: "turn_balance", choices: [] });
      break;
    }
  }
  return faults;
}
