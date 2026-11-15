// A question carried to another place: the pure rules and constants. This file is imported by
// Convex, so it uses relative imports. Nothing here counts what a person did or orders places.

import { distanceMetres } from "../overture/dedupe";

/**
 * A question may be carried to a place at most this far from the place it is written at, in a
 * straight line between the two pins: a short walk.
 */
export const CARRY_MAX_METRES = 1000;

/** The places listed as somewhere a question could be carried to. */
export const CARRY_TARGETS_LIMIT = 50;

/** Questions carried to one place that its page shows. */
export const CARRIED_SHOWN_LIMIT = 5;

type Pin = { lat: number; lng: number };

/**
 * "Three doors" is live only while walk mode is on too: it needs the slip. Every place that decides
 * whether the feature applies asks this and nothing else.
 */
export function threadOn(features: { walk: boolean; thread: boolean }): boolean {
  return features.walk && features.thread;
}

/** Straight-line metres between two pins, and whether a question may be carried between them. */
export function carryDistance(from: Pin, to: Pin): { metres: number; allowed: boolean } {
  const metres = distanceMetres(from, to);
  return { metres, allowed: metres <= CARRY_MAX_METRES };
}

export type CarryCandidate = { id: string; pin: Pin };

/**
 * The places a question written at `from` may be carried to: within CARRY_MAX_METRES, never the
 * place itself, nearest first (ties by id, so the order is the same for everyone), at most
 * CARRY_TARGETS_LIMIT. Pass only places a signed-out visitor can see.
 */
export function nearestCarryTargets<T extends CarryCandidate>(
  from: { id: string; pin: Pin },
  places: readonly T[],
): (T & { metres: number })[] {
  return places
    .filter((place) => place.id !== from.id)
    .map((place) => ({ place, exact: distanceMetres(from.pin, place.pin) }))
    .filter(({ exact }) => exact <= CARRY_MAX_METRES)
    .sort((a, b) => a.exact - b.exact || a.place.id.localeCompare(b.place.id))
    .slice(0, CARRY_TARGETS_LIMIT)
    .map(({ place, exact }) => ({ ...place, metres: Math.round(exact) }));
}
