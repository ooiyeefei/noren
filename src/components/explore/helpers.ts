import type { PlaceListItem } from "@/components/places/place-list";
import type { Locale } from "@/lib/i18n";

export type Position = { lat: number; lng: number };
export type SheetHeight = "peek" | "half" | "full";
/** The part of the explore map a person can see (not under the sheet or the search bar). */
export type MapView = {
  west: number;
  south: number;
  east: number;
  north: number;
  center: Position;
  zoom: number;
};
export const GUIDE_STORAGE_KEY = "noren.guide.v1";
/** The filter chip for places someone has shared a story about; no region category uses this key. */
export const STORIES_FILTER = "stories";

export function normaliseSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .trim();
}

export function haversine(from: Position, to: Position): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function distanceLabel(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

export function exploreItems(
  items: readonly PlaceListItem[],
  options: {
    search: string;
    category: string;
    locale: Locale;
    position?: Position | null;
    view?: MapView | null;
  },
): PlaceListItem[] {
  const query = normaliseSearch(options.search);
  const view = options.view;
  const origin = options.position ?? view?.center;
  return items
    .filter(
      (item) =>
        (options.category === "" ||
          (options.category === "demo"
            ? item.isMock
            : options.category === STORIES_FILTER
              ? Boolean(item.hasStory)
              : item.category === options.category)) &&
        (query !== "" ||
          !view ||
          (item.pin != null &&
            item.pin.lat >= view.south &&
            item.pin.lat <= view.north &&
            (view.west <= view.east
              ? item.pin.lng >= view.west && item.pin.lng <= view.east
              : item.pin.lng >= view.west || item.pin.lng <= view.east))) &&
        (item.names ?? [item.name, item.secondaryName ?? ""]).some((name) =>
          normaliseSearch(name).includes(query),
        ),
    )
    .map((item) => ({
      ...item,
      distance: options.position && item.pin ? haversine(options.position, item.pin) : undefined,
    }))
    .sort((a, b) => {
      if (Boolean(a.hasStory) !== Boolean(b.hasStory)) return a.hasStory ? -1 : 1;
      const distance = origin
        ? (a.pin ? haversine(origin, a.pin) : Infinity) -
          (b.pin ? haversine(origin, b.pin) : Infinity)
        : 0;
      if (distance && !Number.isNaN(distance)) return distance;
      return a.name.localeCompare(b.name, options.locale);
    });
}

/** A request to move the map so these points are in view; a new object is a new request. */
export type MapFit = { points: Position[] };

const FIT_NEAREST = 5;

/**
 * Where to move the map after the category filter changes: to the nearest matches when none of
 * them is in view (13 baths and none near the city centre), or null to leave the map alone.
 */
export function fitForFilter(
  items: readonly PlaceListItem[],
  options: Parameters<typeof exploreItems>[1],
): MapFit | null {
  const view = options.view;
  if (!view || exploreItems(items, options).length > 0) return null;
  const origin = options.position ?? view.center;
  const points = exploreItems(items, { ...options, view: null })
    .flatMap((item) => (item.pin ? [{ lat: item.pin.lat, lng: item.pin.lng }] : []))
    .sort((a, b) => haversine(origin, a) - haversine(origin, b))
    .slice(0, FIT_NEAREST);
  return points.length > 0 ? { points } : null;
}

// Pass a getter so even browsers that throw while accessing localStorage are safe.
export function guideIsVisible(storage: () => Pick<Storage, "getItem">): boolean {
  try {
    return storage().getItem(GUIDE_STORAGE_KEY) !== "dismissed";
  } catch {
    return true;
  }
}
export function dismissGuide(storage: () => Pick<Storage, "setItem">): boolean {
  try {
    storage().setItem(GUIDE_STORAGE_KEY, "dismissed");
    return false;
  } catch {
    return true;
  }
}
export function draggedSheet(height: SheetHeight, delta: number): SheetHeight {
  const heights: SheetHeight[] = ["peek", "half", "full"];
  return heights[
    Math.max(0, Math.min(2, heights.indexOf(height) + (delta < -40 ? 1 : delta > 40 ? -1 : 0)))
  ]!;
}

export function locateInBrowser(
  geolocation: () => Pick<Geolocation, "getCurrentPosition"> | undefined,
  onPosition: (position: Position) => void,
  onError: () => void,
): void {
  try {
    const location = geolocation();
    if (!location) {
      onError();
      return;
    }
    location.getCurrentPosition(
      (result) => onPosition({ lat: result.coords.latitude, lng: result.coords.longitude }),
      onError,
      { timeout: 10000, maximumAge: 60000 },
    );
  } catch {
    onError();
  }
}

// viewportHeight is the map area beneath the site header.
export function explorePadding(sheet: SheetHeight, viewportHeight: number, top = 132) {
  // Sheet heights are capped by the same 132px inset as the sheet CSS.
  const available = Math.max(0, viewportHeight - 132);
  const height =
    sheet === "peek" ? 264 : sheet === "half" ? (viewportHeight * 55) / 100 : available;
  return { top, bottom: Math.min(height, available), left: 0, right: 0 };
}
