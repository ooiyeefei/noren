import { travellersOn } from "./checks";
import { STRETCH_REST_MINUTES, type RouteDay } from "./days";
import type { TripSettings } from "./roads";
import type { Turn } from "./turns";
import type { KeptStop, NeedKind, Pin, Stop, TripRequest } from "./types";

export type Slot = {
  id: string;
  point: number;
  target: number;
  fixed?: number;
  minutes?: number;
} & (
  | { kind: "meal" }
  | { kind: "need"; need: NeedKind }
  | { kind: "pin"; pin: Pin }
  | { kind: "after_lunch" }
  | { kind: "open"; because: Extract<Stop["because"], { kind: "wild" | "turn" }> }
);

export function clockMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export function mealMinutes(trip: TripSettings): number {
  return trip.minutesAtStop.restaurant ?? trip.minutesAtStop.other ?? 45;
}

/** Use a stable estimate for where on the route a timed slot can fall. */
function pointByTime(day: RouteDay, trip: TripSettings, at: number): number {
  const available = at - clockMinutes(trip.dayStart);
  return Math.max(
    0,
    day.points.findLastIndex(({ elapsed }) => {
      const breaks = Math.floor(elapsed / trip.guesses.stretchMinutes);
      return elapsed + (breaks + 1) * STRETCH_REST_MINUTES <= available;
    }),
  );
}

export function slotsFor(
  request: TripRequest,
  day: RouteDay,
  trip: TripSettings,
  pointForPin: (pin: Pin) => number,
): Slot[] {
  const { party } = request;
  const start = clockMinutes(trip.dayStart);
  const prefix = `d${day.index}`;
  const travellers = travellersOn(party, day.index);
  const slots: Slot[] = (["lunch", "dinner"] as const).map((meal) => {
    const target = clockMinutes(party.meals[meal]);
    return {
      kind: "meal",
      id: `${prefix}.${meal}`,
      point: pointByTime(day, trip, target),
      target,
      fixed: target,
    };
  });
  const lunch = slots[0]!;
  for (const traveller of travellers) {
    if (traveller.rests) {
      slots.push({
        kind: "after_lunch",
        id: `${prefix}.after_lunch.${traveller.key}`,
        point: lunch.point,
        target: lunch.target + 1,
        minutes: traveller.rests.minutes,
      });
    }
  }

  const needs = party.needs
    .filter(({ who }) => !who || travellers.some(({ key }) => who.includes(key)))
    .sort((a, b) => a.at.localeCompare(b.at));
  needs.forEach((need, index) => {
    const target = clockMinutes(need.at);
    slots.push({
      kind: "need",
      need: need.kind,
      id: `${prefix}.need${index + 1}`,
      target,
      fixed: target,
      minutes: need.minutes,
      point: pointByTime(day, trip, target),
    });
  });

  for (const pin of request.pins) {
    if (pin.day !== day.index) continue;
    const point = pointForPin(pin);
    const fixed = pin.at === undefined ? undefined : clockMinutes(pin.at);
    slots.push({
      kind: "pin",
      id: `${prefix}.pin.${pin.id}`,
      pin,
      point,
      target: fixed ?? start + day.points[point]!.elapsed,
      fixed,
      minutes: pin.minutes,
    });
  }

  // This is where a later wave can hand the open slot to a traveller.
  const end = day.points.length - 1;
  const openStart = day.driveMinutes === 0 ? start : start + day.driveMinutes + mealMinutes(trip);
  for (let index = 0; index < trip.turnsPerDay[party.fullness]; index++) {
    const target = openStart + index * 90;
    slots.push({
      kind: "open",
      id: `${prefix}.open${index + 1}`,
      target,
      point: end,
      because: { kind: "wild" },
    });
  }
  return slots.sort((a, b) => a.target - b.target);
}

export function keptSlots(
  keeps: KeptStop[],
  slots: Slot[],
  day: RouteDay,
  trip: TripSettings,
): Slot[] {
  const known = new Set(slots.map(({ id }) => id));
  const extra = keeps
    .filter(({ slot }) => !known.has(slot))
    .map((keep): Slot => {
      if (keep.because.kind === "paired") {
        const baseId = keep.slot.replace(/\.pair$/, "");
        const base = slots.find(({ id }) => id === baseId);
        const held = keeps.find(({ slot }) => slot === baseId && baseId !== keep.slot);
        if (base?.kind === "open") {
          const target = held?.hold === "time" ? clockMinutes(held.at) : base.target;
          return { ...base, id: keep.slot, target: target + 0.001 };
        }
      }
      const target = clockMinutes(keep.at);
      const elapsed = target - clockMinutes(trip.dayStart);
      const point = Math.max(
        0,
        day.points.findLastIndex((entry) => entry.elapsed <= elapsed),
      );
      return { id: keep.slot, kind: "open", point, target, because: { kind: "wild" } };
    });
  return [...slots, ...extra].sort((a, b) => a.target - b.target);
}

export function giveTurn(slot: Slot, turn: Turn | undefined): Slot {
  return slot.kind === "open" && turn ? { ...slot, because: turn } : slot;
}
