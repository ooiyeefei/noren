import { keyedUniform } from "./rng";
import { sampleWithoutReplacement } from "./sample";
import { drawWeight } from "./weights";

// The daily slip, as a pure function. The connector's draw_omikuji (convex/connector.ts) and walk
// mode's "every neighbourhood at once" both call it, so a slip is the same wherever it is asked for.

/**
 * The seed that fixes a slip: the region, the date in the region's time, and the neighbourhood
 * ("-" for the whole region). Everyone who asks with the same seed gets the same place.
 */
export function omikujiSeed(
  regionId: string,
  day: string,
  neighbourhoodId: string | undefined,
): string {
  return `${regionId}|${day}|${neighbourhoodId ?? "-"}`;
}

/**
 * Draws one place from the pool for a seed. Each place's number comes from the seed and its own id
 * (keyedUniform), so another listing appearing does not change the slip. The odds ignore the
 * exposure ledger on purpose: asking must not change the answer. Undefined for an empty pool.
 */
export function chooseOmikuji<T extends { id: string; hasStory: boolean }>(
  pool: readonly T[],
  seed: string,
): T | undefined {
  const [chosen] = sampleWithoutReplacement(
    pool,
    1,
    (place) =>
      drawWeight(
        { recentSuggestions: 0, hasStory: place.hasStory, matchesInterest: false },
        { wildCard: true, ignoreExposure: true },
      ),
    (place) => keyedUniform(seed, place.id),
  );
  return chosen;
}
