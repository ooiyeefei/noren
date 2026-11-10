import { distanceMetres } from "../overture/dedupe";

// Putting drawn stops in a sensible walking order, and estimating each leg. Plain geometry: it
// looks only at where the places are, never at anything about them.

export type Pin = { lat: number; lng: number };

/**
 * Stops are drawn from places within this many metres of the start, so a walk is a walk. About
 * 20 minutes on foot in a straight line.
 */
export const WALK_RADIUS_METRES = 1500;

/** Streets are not straight, so a leg is the straight-line distance times this. */
export const WALK_DETOUR = 1.3;

/** A comfortable walking pace, in metres a minute (4.8 km/h). */
export const WALK_METRES_PER_MINUTE = 80;

export type Leg = { metres: number; minutes: number };

/** An estimate from the straight line between two pins, not a street route. */
export function walkingLeg(from: Pin, to: Pin): Leg {
  const metres = distanceMetres(from, to) * WALK_DETOUR;
  return {
    metres: Math.round(metres / 10) * 10,
    minutes: Math.max(1, Math.round(metres / WALK_METRES_PER_MINUTE)),
  };
}

/**
 * Nearest neighbour: from the start, go to the closest stop, then the closest one left, and so
 * on. Not the shortest possible route, but sensible for up to five stops. Ties keep the draw order.
 */
export function orderAsWalk<T extends { pin: Pin }>(start: Pin, stops: readonly T[]): T[] {
  const left = [...stops];
  const ordered: T[] = [];
  let here = start;
  while (left.length > 0) {
    let best = 0;
    let bestMetres = Infinity;
    left.forEach((stop, index) => {
      const metres = distanceMetres(here, stop.pin);
      if (metres < bestMetres) {
        best = index;
        bestMetres = metres;
      }
    });
    const [next] = left.splice(best, 1);
    ordered.push(next!);
    here = next!.pin;
  }
  return ordered;
}

/** The start, then each stop, as legs: start to the first stop, first to second, and so on. */
export function legsOf(start: Pin, ordered: readonly { pin: Pin }[]): Leg[] {
  let here = start;
  return ordered.map((stop) => {
    const leg = walkingLeg(here, stop.pin);
    here = stop.pin;
    return leg;
  });
}
