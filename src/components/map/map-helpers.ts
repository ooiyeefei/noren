import type { MapView } from "@/components/explore/helpers";

export const MAPLIBRE_WORKER_PATH = "/maplibre/maplibre-gl-worker.mjs";

export function isWorkerFailure(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error !== null && typeof error === "object" && "message" in error
        ? error.message
        : undefined;
  return typeof message === "string" && /worker/i.test(message);
}

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  href?: string;
  isMock: boolean;
  hasStory?: boolean;
  categoryLabel?: string;
  distanceLabel?: string;
};
export type LngLatBounds = [[number, number], [number, number]];

export function markersToFeatures(
  markers: readonly MapMarker[],
  selectedId?: string | null,
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { id: string; hasStory: boolean; isMock: boolean };
  }>;
} {
  return {
    type: "FeatureCollection",
    features: markers
      .filter((marker) => marker.id !== selectedId)
      .map((marker) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [marker.lng, marker.lat] },
        properties: {
          id: marker.id,
          hasStory: Boolean(marker.hasStory),
          isMock: marker.isMock,
        },
      })),
  };
}

export function visibleView(
  map: {
    getCanvas(): { clientWidth: number; clientHeight: number };
    unproject(point: [number, number]): { lat: number; lng: number };
    getZoom(): number;
  },
  padding: Partial<{ top: number; bottom: number; left: number; right: number }>,
): MapView {
  const { clientWidth: width, clientHeight: height } = map.getCanvas();
  const left = Math.min(width, Math.max(0, padding.left ?? 0));
  const right = Math.max(left, width - Math.max(0, padding.right ?? 0));
  const top = Math.min(height, Math.max(0, padding.top ?? 0));
  const bottom = Math.max(top, height - Math.max(0, padding.bottom ?? 0));
  const corners = [
    map.unproject([left, top]),
    map.unproject([right, top]),
    map.unproject([left, bottom]),
    map.unproject([right, bottom]),
  ];
  const center = map.unproject([(left + right) / 2, (top + bottom) / 2]);
  return {
    west: Math.min(...corners.map((point) => point.lng)),
    south: Math.min(...corners.map((point) => point.lat)),
    east: Math.max(...corners.map((point) => point.lng)),
    north: Math.max(...corners.map((point) => point.lat)),
    center: { lat: center.lat, lng: center.lng },
    zoom: map.getZoom(),
  };
}

export function boundsFor(
  markers: readonly Pick<MapMarker, "lat" | "lng">[],
  fallback: readonly [number, number, number, number],
): LngLatBounds {
  if (!markers.length)
    return [
      [fallback[0], fallback[1]],
      [fallback[2], fallback[3]],
    ];
  const west = Math.min(...markers.map((marker) => marker.lng));
  const east = Math.max(...markers.map((marker) => marker.lng));
  const south = Math.min(...markers.map((marker) => marker.lat));
  const north = Math.max(...markers.map((marker) => marker.lat));
  const dx = Math.max((east - west) * 0.1, 0.001);
  const dy = Math.max((north - south) * 0.1, 0.001);
  return [
    [Math.max(-180, west - dx), Math.max(-90, south - dy)],
    [Math.min(180, east + dx), Math.min(90, north + dy)],
  ];
}

export function attributionText(attribution: readonly string[]): string {
  if (!attribution.length || attribution.some((line) => !line.trim())) {
    throw new Error("Map attribution must not be empty");
  }
  return attribution.join(" | ");
}

export function normalisePoint(point: { lat: number; lng: number }): { lat: number; lng: number } {
  const clamp = (value: number, limit: number) =>
    Number(Math.max(-limit, Math.min(limit, Number.isNaN(value) ? 0 : value)).toFixed(6));
  return { lat: clamp(point.lat, 90), lng: clamp(point.lng, 180) };
}

export const NOREN_PATH = "M2 2H26V30H15V21H13V30H2Z";
export function markerPresentation(marker: MapMarker, demo: string, selected = false) {
  return {
    label: marker.isMock ? `${marker.label} (${demo})` : marker.label,
    fill: marker.hasStory ? "#f2c14e" : "#23305c",
    stroke: marker.hasStory ? "#23305c" : "#ffffff",
    strokeWidth: marker.hasStory ? "2" : "1",
    className: selected
      ? "h-8 w-7 scale-[1.2] ring-2 ring-ai ring-offset-2 focus-visible:outline-2"
      : "h-8 w-7 focus-visible:outline-2 focus-visible:outline-offset-2",
  };
}

export function setMarkerSelection(
  element: Pick<HTMLElement, "classList" | "setAttribute">,
  selected: boolean,
): void {
  // MapLibre owns positioning classes on this element; preserve them when selecting.
  for (const name of ["scale-[1.2]", "ring-2", "ring-ai", "ring-offset-2"]) {
    element.classList.toggle(name, selected);
  }
  element.setAttribute("aria-pressed", String(selected));
}
