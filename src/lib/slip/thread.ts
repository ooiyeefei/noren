// Choosing the next door of a thread. Pure and deterministic: the same pool, thread and seed give the
// same stop for everyone. This file is imported by Convex, so it uses relative imports. It looks at
// no viewer and no position, and it counts nothing a person did.

import { chooseOmikuji } from "../draw/omikuji";
import { distanceMetres } from "../overture/dedupe";
import { THREAD_MAX_METRES, THREAD_MIN_METRES } from "../walk/constants";

/** Further doors after the slip's own place. */
export const THREAD_STOPS = 2;

type Pin = { lat: number; lng: number };
export type ThreadPlace = { id: string; hasStory: boolean; pin: Pin };

/** A story at the place we leave, as far as the choice needs it: its question's address, and its age. */
export type CarriedFromHere = { storyId: string; addedAt: number; toPlaceId: string };

export type NextStop<T extends ThreadPlace> =
  { via: "carried"; place: T; storyId: string } | { via: "draw"; place: T };

/** The seed for stop `stop` (1 or 2) of a slip: the slip's own seed and the stop's number. */
export function threadSeed(slipSeed: string, stop: number): string {
  return `${slipSeed}|thread|${stop}`;
}

/**
 * The stop after `from`.
 *
 * 1. Carried: the newest story at `from` whose question is addressed to another place that is in the
 *    pool and not yet in the thread. That place is the next stop.
 * 2. Otherwise a draw: the pool's places between THREAD_MIN_METRES and THREAD_MAX_METRES from `from`
 *    in a straight line, not yet in the thread, chosen by chooseOmikuji with `seed`.
 *
 * Undefined when neither finds a place. `inThread` holds the ids already used, `from` included.
 */
export function chooseNextStop<T extends ThreadPlace>(input: {
  from: ThreadPlace;
  pool: readonly T[];
  inThread: readonly string[];
  carried: readonly CarriedFromHere[];
  seed: string;
}): NextStop<T> | undefined {
  const { from, pool, inThread, carried, seed } = input;
  const used = new Set([...inThread, from.id]);
  const byId = new Map(pool.map((place) => [place.id, place]));
  const leadsOn = [...carried]
    .filter(({ toPlaceId }) => !used.has(toPlaceId) && byId.has(toPlaceId))
    .sort((a, b) => b.addedAt - a.addedAt || a.storyId.localeCompare(b.storyId))[0];
  if (leadsOn !== undefined)
    return { via: "carried", place: byId.get(leadsOn.toPlaceId)!, storyId: leadsOn.storyId };
  const candidates = pool.filter((place) => {
    if (used.has(place.id)) return false;
    const metres = distanceMetres(from.pin, place.pin);
    return metres >= THREAD_MIN_METRES && metres <= THREAD_MAX_METRES;
  });
  const drawn = chooseOmikuji(candidates, seed);
  return drawn === undefined ? undefined : { via: "draw", place: drawn };
}
