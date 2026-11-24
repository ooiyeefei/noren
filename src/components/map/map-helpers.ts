import type { Map as LibreMap } from "maplibre-gl";
import type { MapView } from "@/components/explore/helpers";
import { cellOf, cellsForView, type ViewBounds, type ViewCells } from "@/lib/geo/geohash";
import type { AerialPhoto } from "@/lib/region/schema";

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

export const AERIAL_PHOTO_LAYER = "aerial-photo";

/**
 * Shows or hides the aerial photos under the map's first label layer, so street and place names stay
 * on top. The photos are added on first use, so a map nobody switches makes no requests for them.
 */
export function showAerialPhoto(
  map: Pick<LibreMap, "getSource" | "addSource" | "addLayer" | "getStyle" | "setLayoutProperty">,
  aerial: AerialPhoto,
  visible: boolean,
): void {
  if (!map.getSource(AERIAL_PHOTO_LAYER)) {
    if (!visible) return;
    map.addSource(AERIAL_PHOTO_LAYER, {
      type: "raster",
      tiles: [aerial.tiles],
      tileSize: 256,
      minzoom: aerial.minZoom,
      maxzoom: aerial.maxZoom,
    });
    const labels = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
    map.addLayer(
      {
        id: AERIAL_PHOTO_LAYER,
        type: "raster",
        source: AERIAL_PHOTO_LAYER,
        minzoom: aerial.minZoom,
      },
      labels,
    );
  }
  map.setLayoutProperty(AERIAL_PHOTO_LAYER, "visibility", visible ? "visible" : "none");
}

export const NOREN_PATH = "M2 2H26V30H15V21H13V30H2Z";
export function markerPresentation(marker: MapMarker, demo: string, selected = false) {
  return {
    label: marker.isMock ? `${marker.label} (${demo})` : marker.label,
    fill: marker.hasStory ? "#f2c14e" : "#23305c",
    stroke: marker.hasStory ? "#23305c" : "#ffffff",
    strokeWidth: marker.hasStory ? "2" : "1",
    className: selected
      ? `h-8 w-7 ${SELECTED_CLASSES.join(" ")} focus-visible:outline-2`
      : "h-8 w-7 focus-visible:outline-2 focus-visible:outline-offset-2",
  };
}

/**
 * MapLibre places a marker with an inline transform on this element, and the CSS scale, rotate
 * and translate properties compose with it, so a scale here would scale the position too and the
 * marker would drift from its place. The selected noren grows only inside the element.
 */
const SELECTED_CLASSES = ["[&>svg]:scale-[1.2]", "ring-2", "ring-ai", "ring-offset-4"];

export function setMarkerSelection(
  element: Pick<HTMLElement, "classList" | "setAttribute">,
  selected: boolean,
): void {
  // MapLibre owns positioning classes on this element; preserve them when selecting.
  for (const name of SELECTED_CLASSES) {
    element.classList.toggle(name, selected);
  }
  element.setAttribute("aria-pressed", String(selected));
}

/**
 * Roughly what the map shows when it opens at this centre and zoom, before the map has said what it
 * really shows. It is a little wider than a phone or a desktop window needs, and is narrowed until
 * its cells fit one request, so the first answer arrives while the map is still starting.
 */
export function openingBounds(center: {
  lat: number;
  lng: number;
  zoom: number;
}): ViewBounds | null {
  const tile = 360 / 2 ** center.zoom;
  const squash = Math.max(0.05, Math.cos((center.lat * Math.PI) / 180));
  for (const tiles of [4, 3, 2, 1.5, 1]) {
    const lng = (tile * tiles) / 2;
    const lat = lng * squash;
    const bounds = {
      west: center.lng - lng,
      east: center.lng + lng,
      south: Math.max(-90, center.lat - lat),
      north: Math.min(90, center.lat + lat),
    };
    if (cellsForView(bounds) !== null) return bounds;
  }
  return null;
}

type Pinned = { _id: string; pin: { lat: number; lng: number } | null };

/** The view widened by two views on each side: places further out than this are let go. */
function keepBounds(view: ViewBounds) {
  const width = view.east >= view.west ? view.east - view.west : view.east + 360 - view.west;
  const height = view.north - view.south;
  const west = view.west - width * 2;
  return {
    west,
    total: width * 5,
    south: view.south - height * 2,
    north: view.north + height * 2,
  };
}

/**
 * The places the map holds after a new answer. Places the map already held stay, so nothing
 * flickers while the next answer is on its way; the cells this answer covered are replaced by what
 * it says (a place hidden since then goes); and places far outside the view are dropped so memory
 * stays bounded.
 */
export function mergeLoaded<T extends Pinned>(
  held: ReadonlyMap<string, T> | null,
  rows: readonly T[],
  answered: ViewCells,
  view: ViewBounds,
): Map<string, T> {
  const covered = new Set(answered.cells);
  const keep = keepBounds(view);
  const next = new Map<string, T>();
  for (const [id, row] of held ?? []) {
    const pin = row.pin;
    if (pin === null) continue;
    if (covered.has(cellOf(pin).slice(0, answered.precision))) continue;
    const across = (((pin.lng - keep.west) % 360) + 360) % 360;
    if (keep.total < 360 && across > keep.total) continue;
    if (pin.lat < keep.south || pin.lat > keep.north) continue;
    next.set(id, row);
  }
  for (const row of rows) next.set(row._id, row);
  return next;
}

export type TownMarker = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** How far the town reaches; the larger town keeps its button when two would overlap. */
  radiusMetres: number;
};

/** One marker for each town, named in the reader's language, with no count on it. */
export function townMarkers(
  towns: readonly {
    id: string;
    names: Readonly<Record<string, string>>;
    center: { lat: number; lng: number };
    radiusMetres: number;
  }[],
  locale: string,
  fallbackLocale: string,
): TownMarker[] {
  return towns.map((town) => ({
    id: town.id,
    label:
      town.names[locale] ??
      town.names[fallbackLocale] ??
      town.names.en ??
      Object.values(town.names)[0] ??
      town.id,
    lat: town.center.lat,
    lng: town.center.lng,
    radiusMetres: town.radiusMetres,
  }));
}

/** MapLibre draws a 512-pixel tile at each zoom, so the world is this many pixels wide. */
const WORLD_PIXELS = 512;
/** A town button is at least 44 pixels high; its width follows its text (see `buttonBox`). */
const BUTTON_HEIGHT = 44;
const BUTTON_PADDING = 32;
const BUTTON_GAP = 4;

function pixelsAt(point: { lat: number; lng: number }, zoom: number): { x: number; y: number } {
  const world = WORLD_PIXELS * 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * world,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world,
  };
}

/** Roughly how wide a town's button is: its text at 15 pixels, wide letters counted double. */
function buttonWidth(label: string): number {
  let width = BUTTON_PADDING;
  for (const letter of label) width += (letter.codePointAt(0) ?? 0) >= 0x2e80 ? 16 : 8.5;
  return width;
}

/**
 * The towns whose buttons are shown at this zoom, so that no button covers another. Towns are taken
 * in a fixed order (larger radius first, then id); a town is shown only if its button does not touch
 * one already shown, and is left out otherwise, until the map is zoomed in far enough for both to fit.
 * Nothing about the order depends on where the map is looking, so a button does not jump between moves.
 */
export function layoutTowns(towns: readonly TownMarker[], zoom: number): TownMarker[] {
  const ordered = [...towns].sort(
    (a, b) => b.radiusMetres - a.radiusMetres || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const shown: { town: TownMarker; x: number; y: number; half: number }[] = [];
  for (const town of ordered) {
    const { x, y } = pixelsAt(town, zoom);
    const half = buttonWidth(town.label) / 2;
    const touches = shown.some(
      (other) =>
        Math.abs(other.x - x) < other.half + half + BUTTON_GAP &&
        Math.abs(other.y - y) < BUTTON_HEIGHT + BUTTON_GAP,
    );
    if (!touches) shown.push({ town, x, y, half });
  }
  return shown.map((entry) => entry.town);
}

/** The region the view's centre is inside, or null: only regions that are on are looked at. */
export function regionAtCentre<T extends { bounds: readonly [number, number, number, number] }>(
  centre: { lat: number; lng: number },
  regions: Readonly<Record<string, T>>,
): T | null {
  for (const id of Object.keys(regions).sort()) {
    const region = regions[id]!;
    const [west, south, east, north] = region.bounds;
    if (centre.lng >= west && centre.lng <= east && centre.lat >= south && centre.lat <= north)
      return region;
  }
  return null;
}

/** The zoom a town's marker moves the map to: near enough that a view is a few cells. */
export const TOWN_ZOOM = 12;
