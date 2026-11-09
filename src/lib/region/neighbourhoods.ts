import { distanceMetres } from "../overture/dedupe";
import type { Neighbourhood, RegionConfig } from "./schema";

type Pin = { lat: number; lng: number };

/** The nearest neighbourhood whose circle holds the pin; the circles overlap in the city centre. */
export function neighbourhoodAt(
  region: Pick<RegionConfig, "neighbourhoods"> | undefined,
  pin: Pin,
): Neighbourhood | undefined {
  let nearest: { neighbourhood: Neighbourhood; metres: number } | undefined;
  for (const neighbourhood of region?.neighbourhoods ?? []) {
    const metres = distanceMetres(neighbourhood.center, pin);
    if (metres <= neighbourhood.radiusMetres && (!nearest || metres < nearest.metres)) {
      nearest = { neighbourhood, metres };
    }
  }
  return nearest?.neighbourhood;
}

/** The town a place is in, in both languages, for a shared story's hashtags. */
export type TownNames = { en: string; ja: string };

/**
 * The nearest town whose circle holds the pin; the region's own name when no circle does, or the
 * place has no pin. A name the region lacks in one language stands in for the other.
 */
export function townOf(
  region: Pick<RegionConfig, "towns" | "name">,
  pin: Pin | null | undefined,
): TownNames {
  let nearest: { names: Record<string, string>; metres: number } | undefined;
  if (pin)
    for (const town of region.towns ?? []) {
      const metres = distanceMetres(town.center, pin);
      if (metres <= town.radiusMetres && (!nearest || metres < nearest.metres))
        nearest = { names: town.names, metres };
    }
  const names = nearest?.names ?? region.name;
  const first = Object.values(names)[0] ?? "";
  return { en: names.en ?? names.ja ?? first, ja: names.ja ?? names.en ?? first };
}
