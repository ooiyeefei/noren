import { withinReach } from "@/lib/collection/reach";
import { distanceMetres } from "@/lib/overture/dedupe";
import { MAX_USABLE_ACCURACY_METRES, STORY_RADIUS_METRES } from "./constants";
import type { Fix, WalkPlace } from "./types";

/** A reading good enough to act on: real numbers, and an error under the limit. */
export function isUsableFix(fix: Fix): boolean {
  return (
    Number.isFinite(fix.lat) &&
    Number.isFinite(fix.lng) &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy >= 0 &&
    fix.accuracy <= MAX_USABLE_ACCURACY_METRES
  );
}

/**
 * Whether a place is in range: the straight-line distance, less what the phone's own error may
 * give back (up to the collection's allowance), is within the radius. Same rule as "I'm here".
 */
export function isInRange(
  distance: number,
  accuracy: number,
  accuracyAllowanceMetres: number,
  radiusMetres: number = STORY_RADIUS_METRES,
): boolean {
  return withinReach(distance, accuracy, { checkInMetres: radiusMetres, accuracyAllowanceMetres });
}

export type PlaceAt = { place: WalkPlace; metres: number };

/** Every place with its distance from the reading, nearest first. */
export function placesByDistance(fix: Fix, places: readonly WalkPlace[]): PlaceAt[] {
  return places
    .map((place) => ({ place, metres: distanceMetres(fix, place.pin) }))
    .sort((a, b) => a.metres - b.metres);
}

/** Places in range of the reading, nearest first. Nothing is in range of an unusable reading. */
export function placesInRange(
  fix: Fix,
  places: readonly WalkPlace[],
  accuracyAllowanceMetres: number,
  radiusMetres: number = STORY_RADIUS_METRES,
): PlaceAt[] {
  if (!isUsableFix(fix)) return [];
  return placesByDistance(fix, places).filter(({ metres }) =>
    isInRange(metres, fix.accuracy, accuracyAllowanceMetres, radiusMetres),
  );
}
