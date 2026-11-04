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
