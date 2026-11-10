import { walkingLeg } from "@/lib/draw";
import { distanceMetres } from "@/lib/overture/dedupe";
import { neighbourhoodAt } from "@/lib/region/neighbourhoods";
import { bearingDegrees, compassPoint, type Compass } from "./direction";
import type { Pin, TodaysSlips } from "./types";

// Picking today's slip on the phone. The server sends the slip for every neighbourhood; which one
// is "mine" is worked out here from a position that never leaves the phone.

export type NeighbourhoodLike = {
  id: string;
  names: Readonly<Record<string, string>>;
  center: Pin;
  radiusMetres: number;
};

/**
 * The neighbourhood a position is in (the nearest centre among the circles that hold it, as the
 * map and the collection decide), or, outside every circle, the one with the nearest centre.
 */
export function nearestNeighbourhood<N extends NeighbourhoodLike>(
  neighbourhoods: readonly N[],
  position: Pin,
): N | undefined {
  const inside = neighbourhoodAt({ neighbourhoods: [...neighbourhoods] }, position);
  if (inside !== undefined) return neighbourhoods.find(({ id }) => id === inside.id);
  let nearest: { neighbourhood: N; metres: number } | undefined;
  for (const neighbourhood of neighbourhoods) {
    const metres = distanceMetres(neighbourhood.center, position);
    if (nearest === undefined || metres < nearest.metres) nearest = { neighbourhood, metres };
  }
  return nearest?.neighbourhood;
}

/** The slip for one neighbourhood, or for the whole region when the id is null. */
export function slipFor(slips: TodaysSlips, neighbourhoodId: string | null) {
  return slips.slips.find((slip) => (slip.neighbourhoodId ?? null) === neighbourhoodId);
}

export type Leg = {
  /** Walking distance, with the allowance for streets. */
  metres: number;
  minutes: number;
  compass: Compass;
  /** The straight line, for deciding that a place is right here. */
  straightMetres: number;
};

/** How far, how long on foot and which way, as the crow flies with the usual allowance for streets. */
export function legFrom(from: Pin, to: Pin): Leg {
  const { metres, minutes } = walkingLeg(from, to);
  return {
    metres,
    minutes,
    compass: compassPoint(bearingDegrees(from, to)),
    straightMetres: distanceMetres(from, to),
  };
}
