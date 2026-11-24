type Bounds = readonly [number, number, number, number];

/** The zoom the map opens at for a place: near enough that places show. */
export const START_ZOOM = 14;

export type MapStart = { lat: number; lng: number; zoom: number };

/**
 * Reads the map page's `at` parameter ("lat,lng"). Accepted only when both are finite numbers that
 * sit inside the bbox of a region that is on; anything else is ignored, so the map opens as usual.
 */
export function parseMapStart(
  raw: string | string[] | undefined,
  bounds: readonly Bounds[],
): MapStart | null {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== "string") return null;
  const parts = text.split(",");
  if (parts.length !== 2) return null;
  const [lat, lng] = parts.map((part) => (part.trim() === "" ? NaN : Number(part)));
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng))
    return null;
  const inside = bounds.some(
    ([west, south, east, north]) => lng >= west && lng <= east && lat >= south && lat <= north,
  );
  return inside ? { lat, lng, zoom: START_ZOOM } : null;
}

/** The address of the map opened at a pin. */
export function mapAt(pin: { lat: number; lng: number } | null | undefined): string {
  return pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng)
    ? `/map?at=${pin.lat},${pin.lng}`
    : "/map";
}
