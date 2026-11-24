import { orderAsWalk, walkingLeg, WALK_DETOUR, WALK_METRES_PER_MINUTE } from "../draw/route";
import { STRETCH_REST_MINUTES, type RouteDay } from "./days";
import { detourMetres, offRoadMinutes, type TripSettings } from "./roads";
import { clockMinutes, type Slot } from "./slots";
import type { LatLng, Plan, Rest, Stop } from "./types";

export type Draft = {
  slot: Slot;
  point: number;
  item: Omit<Stop, "at"> | Omit<Rest, "at">;
  pin?: LatLng;
  fixed?: number;
  keepTime?: boolean;
};

type Scheduled = { draft: Draft; item: Stop | Rest; arrival: number; start: number; end: number };
export type Timing = {
  items: Plan["days"][number]["items"];
  scheduled: Scheduled[];
  end: number;
};

function clockTime(minutes: number): string {
  const withinDay = Math.min(23 * 60 + 59, Math.max(0, Math.ceil(minutes)));
  return `${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`;
}

function legTo(from: LatLng, to: LatLng, trip: TripSettings): Stop["legBefore"] {
  const metres = detourMetres(from, to, trip);
  if (metres === 0) return undefined;
  if (metres <= trip.walkLimitMetres) {
    const walk =
      trip.detourFactor === WALK_DETOUR
        ? walkingLeg(from, to)
        : {
            metres: Math.round(metres),
            minutes: Math.max(1, Math.round(metres / WALK_METRES_PER_MINUTE)),
          };
    return { how: "walk", ...walk };
  }
  return { how: "drive", minutes: offRoadMinutes(from, to, trip), metres: Math.round(metres) };
}

function walkingOrder(point: LatLng, drafts: Draft[]): Draft[] {
  const ordered: Draft[] = [];
  let here = point;
  let visits: (Draft & { pin: LatLng })[] = [];
  function flush() {
    const walk = orderAsWalk(here, visits);
    ordered.push(...walk);
    here = walk.at(-1)?.pin ?? here;
    visits = [];
  }
  for (const draft of drafts) {
    // Untimed pins can change order. Numbered open slots keep their order and their draw key.
    if (draft.slot.kind === "pin" && draft.fixed === undefined && draft.pin) {
      visits.push({ ...draft, pin: draft.pin });
    } else {
      flush();
      ordered.push(draft);
      here = draft.pin ?? here;
    }
  }
  flush();
  return ordered;
}

function deferOpen(
  queue: Draft[],
  draft: Draft,
  arrival: number,
  here: LatLng,
  trip: TripSettings,
) {
  if (draft.slot.kind !== "open" || draft.fixed !== undefined) return false;
  const index = queue.findIndex((next) => next.fixed !== undefined);
  if (index === -1) return false;
  const next = queue[index]!;
  const travel = next.pin ? (legTo(draft.pin ?? here, next.pin, trip)?.minutes ?? 0) : 0;
  if (arrival + draft.item.minutes + travel <= next.fixed!) return false;
  const deferred = [draft];
  // Defer the remaining opens in the same gap too, preserving their numbered order.
  for (let i = 0; i < index; i++) {
    const preceding = queue[i]!;
    if (preceding.slot.kind === "open") deferred.push(preceding);
  }
  for (const open of deferred.slice(1)) queue.splice(queue.indexOf(open), 1);
  let after = queue.indexOf(next) + 1;
  while (queue[after]?.slot.kind === "after_lunch") after++;
  queue.splice(after, 0, ...deferred);
  return true;
}

/** Road points keep their order. Within each point, only the flexible open stops move as a group. */
export function timeDay(
  day: RouteDay,
  drafts: Draft[],
  trip: TripSettings,
  roadPins: ReadonlyMap<string, LatLng>,
): Timing {
  const items: Timing["items"] = [];
  const scheduled: Scheduled[] = [];
  let time = clockMinutes(trip.dayStart);
  for (const [index, point] of day.points.entries()) {
    const roadPin = roadPins.get(point.id)!;
    let here = roadPin;
    if (point.rest) {
      items.push({
        kind: "rest",
        why: "stretch",
        minutes: STRETCH_REST_MINUTES,
        at: clockTime(time),
      });
      time += STRETCH_REST_MINUTES;
    }

    const atPoint = drafts
      .filter((draft) => draft.point === index)
      .sort((a, b) => (a.fixed ?? a.slot.target) - (b.fixed ?? b.slot.target));
    const queue = walkingOrder(roadPin, atPoint);
    while (queue.length > 0) {
      const draft = queue.shift()!;
      const leg = draft.pin && legTo(here, draft.pin, trip);
      const arrival = Math.ceil(time + (leg?.minutes ?? 0));
      if (deferOpen(queue, draft, arrival, here, trip)) continue;
      const start =
        draft.keepTime && draft.fixed !== undefined
          ? draft.fixed
          : Math.max(arrival, draft.fixed ?? arrival);
      const at = clockTime(start);
      const item: Stop | Rest =
        draft.item.kind === "stop"
          ? { ...draft.item, at, ...(leg && { legBefore: leg }) }
          : { ...draft.item, at };
      const end = start + draft.item.minutes;
      items.push(item);
      scheduled.push({ draft, item, arrival, start, end });
      time = Math.max(arrival, end);
      if (draft.pin) here = draft.pin;
    }
    const drive = day.drives[index];
    if (drive) {
      // A detour is travelled both ways before the next segment of the road table.
      time += legTo(here, roadPin, trip)?.minutes ?? 0;
      items.push(drive);
      time += drive.minutes;
    }
  }
  return { items, scheduled, end: time };
}
