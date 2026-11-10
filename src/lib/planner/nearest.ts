import { neighbourhoodAt } from "../region/neighbourhoods";
import type { RegionConfig } from "../region/schema";
import { distanceMetres } from "../overture/dedupe";
import type { LocationRead } from "../collection/location";

// "Nearest to me", worked out on the phone. The reading goes in, a neighbourhood's id comes out, and
// the reading is dropped: only the id is ever sent to Noren, so a person's location never reaches it
// (the privacy notice's promise). Nothing here returns, stores or logs coordinates.

/** Beyond this far from every neighbourhood's centre, "nearest" would be a guess, so the page asks instead. */
export const NEAREST_MAX_METRES = 5000;

export type NearestResult =
  | { kind: "found"; neighbourhoodId: string }
  | { kind: "far" }
  | { kind: "denied" | "unavailable" | "timeout" | "unsupported" };

export function nearestNeighbourhoodId(
  read: LocationRead,
  region: Pick<RegionConfig, "neighbourhoods">,
): NearestResult {
  if (read.kind !== "read") return { kind: read.kind };
  const pin = { lat: read.lat, lng: read.lng };
  const inside = neighbourhoodAt(region, pin);
  if (inside !== undefined) return { kind: "found", neighbourhoodId: inside.id };
  let nearest: { id: string; metres: number } | undefined;
  for (const neighbourhood of region.neighbourhoods ?? []) {
    const metres = distanceMetres(neighbourhood.center, pin);
    if (nearest === undefined || metres < nearest.metres) {
      nearest = { id: neighbourhood.id, metres };
    }
  }
  return nearest !== undefined && nearest.metres <= NEAREST_MAX_METRES
    ? { kind: "found", neighbourhoodId: nearest.id }
    : { kind: "far" };
}
