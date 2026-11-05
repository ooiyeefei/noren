import { distanceMetres } from "@/lib/overture/dedupe";

type Point = { lat: number; lng: number };
type PlaceLike = { pin: Point | null };
type PanelLike<P> = { index: number; dyed: boolean; places: readonly P[] };

/**
 * FR-116: the nearest place on a panel the person hasn't dyed, in a straight line from where they
 * last were. Null when every panel is dyed or no undyed panel has a place with a pin.
 */
export function nextPanel<P extends PlaceLike>(
  panels: readonly PanelLike<P>[],
  from: Point,
): { panelIndex: number; place: P; metres: number } | null {
  let nearest: { panelIndex: number; place: P; metres: number } | null = null;
  for (const panel of panels) {
    if (panel.dyed) continue;
    for (const place of panel.places) {
      if (place.pin === null) continue;
      const metres = Math.round(distanceMetres(from, place.pin));
      if (nearest === null || metres < nearest.metres) {
        nearest = { panelIndex: panel.index, place, metres };
      }
    }
  }
  return nearest;
}
