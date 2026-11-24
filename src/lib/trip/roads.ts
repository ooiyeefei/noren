import { distanceMetres } from "../overture/dedupe";
import type { Drive, LatLng, RegionTripSettings } from "./types";

type Roads = NonNullable<RegionTripSettings["roads"]>;
export type TripSettings = NonNullable<RegionTripSettings["trip"]>;

/** Dijkstra over the road table. Each recorded segment works in both directions. */
export function quickestPath(roads: Roads, from: string, to: string): Drive[] | undefined {
  const remaining = new Set(roads.points.map(({ id }) => id));
  if (!remaining.has(from) || !remaining.has(to)) return undefined;
  const times = new Map([[from, 0]]);
  const previous = new Map<string, Drive>();

  while (remaining.size > 0) {
    let nearest: string | undefined;
    let best = Infinity;
    for (const id of remaining) {
      const time = times.get(id) ?? Infinity;
      if (time < best) {
        nearest = id;
        best = time;
      }
    }
    if (nearest === undefined) return undefined;
    if (nearest === to) {
      const path: Drive[] = [];
      for (let leg = previous.get(to); leg; leg = previous.get(leg.from)) path.push(leg);
      return path.reverse();
    }
    remaining.delete(nearest);
    for (const segment of roads.segments) {
      const next =
        segment.from === nearest ? segment.to : segment.to === nearest ? segment.from : undefined;
      if (next === undefined || !remaining.has(next)) continue;
      const time = best + segment.minutes;
      if (time >= (times.get(next) ?? Infinity)) continue;
      times.set(next, time);
      previous.set(next, {
        kind: "drive",
        from: nearest,
        to: next,
        minutes: segment.minutes,
        kilometres: segment.kilometres,
        estimated: true,
      });
    }
  }
  return undefined;
}

export function detourMetres(from: LatLng, to: LatLng, trip: TripSettings): number {
  return distanceMetres(from, to) * trip.detourFactor;
}

export function townDriveMinutes(metres: number, trip: TripSettings): number {
  return Math.ceil((metres * 60) / (trip.townSpeedKmh * 1000));
}

export function offRoadMinutes(
  from: LatLng,
  to: LatLng,
  trip: TripSettings,
  recordedMinutes?: number,
): number {
  return recordedMinutes ?? townDriveMinutes(detourMetres(from, to, trip), trip);
}

export function closestPoint(
  points: readonly { id: string }[],
  pin: LatLng,
  roadPins: ReadonlyMap<string, LatLng>,
): number {
  let closest = 0;
  let best = Infinity;
  for (const [index, point] of points.entries()) {
    const metres = distanceMetres(pin, roadPins.get(point.id)!);
    if (metres < best) {
      closest = index;
      best = metres;
    }
  }
  return closest;
}
