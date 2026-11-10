import { drawWeight, sampleWithoutReplacement, uniformFromRng, walkingLeg } from "@/lib/draw";
import type { Rng } from "@/lib/draw";
import { DETOUR_MAX_METRES, DETOUR_MIN_METRES } from "./constants";
import { isUsableFix, placesByDistance } from "./proximity";
import type { Fix, WalkPlace } from "./types";

export type Detour = { place: WalkPlace; metres: number; minutes: number };

/**
 * A gentle detour, drawn on the phone: one place a short walk away, picked by the same fair random
 * draw as everything else (src/lib/draw). A place nobody has written about is three times as likely
 * as one that has a story, and any place in the ring can come up. Nothing here asks Noren anything,
 * and nothing is recorded: the pick is the phone's alone.
 */
export function drawDetour(input: {
  fix: Fix;
  places: readonly WalkPlace[];
  /** Places already suggested on this walk. */
  suggested: ReadonlySet<string>;
  rng: Rng;
}): Detour | null {
  if (!isUsableFix(input.fix)) return null;
  const ring = placesByDistance(input.fix, input.places).filter(
    ({ place, metres }) =>
      metres >= DETOUR_MIN_METRES &&
      metres <= DETOUR_MAX_METRES &&
      !input.suggested.has(place.slug),
  );
  const [chosen] = sampleWithoutReplacement(
    ring,
    1,
    ({ place }) =>
      drawWeight(
        { recentSuggestions: 0, hasStory: place.hasStory, matchesInterest: false },
        { wildCard: true, ignoreExposure: true },
      ),
    uniformFromRng(input.rng),
  );
  if (chosen === undefined) return null;
  return {
    place: chosen.place,
    metres: Math.round(chosen.metres),
    minutes: walkingLeg(input.fix, chosen.place.pin).minutes,
  };
}
