import { VISIT_SHOP_TYPES } from "../osm/categories";
import { keyLength, keyedName, startsWithBrandKey, type KeyedName } from "./names";

/**
 * Brand names from the OpenStreetMap Name Suggestion Index (github.com/osmlab/name-suggestion-index,
 * BSD-3-Clause), the community-kept list of brands with the places they operate in. Noren reads the
 * brand trees (not operators, flags or transit), keeps the brands that operate in Japan and in the
 * region, and calls a place a chain when its name starts with one of a brand's names and the brand's
 * kind of business fits the place's category.
 */

export type NsiItem = {
  id: string;
  displayName: string;
  locationSet?: { include?: unknown[]; exclude?: unknown[] };
  matchNames?: string[];
  tags?: Record<string, string>;
};
export type NsiData = {
  _meta?: { version?: string };
  nsi: Record<string, { items: NsiItem[] }>;
};
/** A custom area of the index (a prefecture, a region of Japan), as GeoJSON. */
export type NsiFeature = {
  id?: string;
  geometry?: { type: string; coordinates: unknown };
};

/** Where an NSI brand operates relative to the region. */
export type Coverage = "japan" | "world" | "region";

export type NsiBrand = {
  id: string;
  displayName: string;
  /** The tree the brand is listed under, for example brands/shop/convenience. */
  path: string;
  coverage: Coverage;
  /** Noren categories a place of this brand can be in. */
  categories: readonly string[];
  /** Normalised names and aliases of three characters or more. */
  keys: readonly string[];
};

export const MIN_BRAND_KEY_LENGTH = 3;

const FOOD_AND_DRINK_AMENITIES = new Set([
  "restaurant",
  "fast_food",
  "food_court",
  "ice_cream",
  "cafe",
  "bar",
  "pub",
  "biergarten",
  "nightclub",
]);
// Shops that sell something to eat, which Overture and OSM file as a shop or as a place to eat.
const FOOD_SHOPS = new Set([
  "bakery",
  "coffee",
  "tea",
  "confectionery",
  "pastry",
  "ice_cream",
  "chocolate",
  "deli",
]);
const MUSIC_SHOPS = new Set(["musical_instrument", "music", "records", "video"]);
const STAY_TOURISM = new Set(["hotel", "motel", "hostel", "guest_house", "apartment", "chalet"]);
const SIGHT_TOURISM = new Set([
  "attraction",
  "theme_park",
  "zoo",
  "aquarium",
  "museum",
  "gallery",
  "artwork",
  "viewpoint",
]);
const BATH_LEISURE = new Set(["sauna", "public_bath"]);

/**
 * The Noren categories a brand's tree can describe, so that a bar named "Roots" is never read as a
 * clothes brand and a hotel is never read as a bakery. An empty list (offices, banks, pharmacies,
 * fuel, anything Noren does not map) never matches.
 */
export function categoriesForPath(path: string): readonly string[] {
  const [tree, key, value] = path.split("/");
  if (tree !== "brands" || !key || !value) return [];
  if (key === "amenity") {
    // Overture files some take-away counters and delis as shops, so a place to eat fits a shop too.
    if (FOOD_AND_DRINK_AMENITIES.has(value)) return ["restaurant", "cafe", "bar", "shop"];
    if (BATH_LEISURE.has(value)) return ["bath"];
    return [];
  }
  if (key === "shop") {
    if (MUSIC_SHOPS.has(value)) return ["music_shop", "shop"];
    if (value === "art") return ["gallery", "shop"];
    if (FOOD_SHOPS.has(value)) return ["shop", "restaurant", "cafe"];
    // Only the kinds of shop the map lists. A clothes, car or electronics brand would otherwise match
    // a second-hand bookshop whose name starts alike.
    return VISIT_SHOP_TYPES.includes(value) ? ["shop"] : [];
  }
  if (key === "craft") return ["shop"];
  if (key === "tourism") {
    if (STAY_TOURISM.has(value)) return ["stay"];
    if (SIGHT_TOURISM.has(value)) return ["attraction", "museum", "gallery"];
    return [];
  }
  if (key === "leisure") {
    if (BATH_LEISURE.has(value)) return ["bath"];
    return ["attraction"];
  }
  return [];
}

const NAME_TAG =
  /^(brand|name|alt_name|short_name|official_name)(:(ja|en|ja-Hira|ja-Hrkt|ja-Latn|ja_kana|ja_rm))?$|^brand:short$/u;

/** The names a brand goes by in Japanese, English and kana, normalised, at least three characters. */
export function brandKeys(item: NsiItem): string[] {
  const names = [item.displayName, ...(item.matchNames ?? [])];
  for (const [tag, value] of Object.entries(item.tags ?? {}))
    if (NAME_TAG.test(tag) && typeof value === "string") names.push(...value.split(";"));
  const keys = new Set<string>();
  for (const name of names) {
    if (typeof name !== "string") continue;
    const { key } = keyedName(name);
    if (keyLength(key) >= MIN_BRAND_KEY_LENGTH) keys.add(key);
  }
  return [...keys];
}

type Point = { lat: number; lng: number };

function inRing(point: Point, ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

function inPolygon(point: Point, rings: readonly (readonly (readonly number[])[])[]): boolean {
  const [outer, ...holes] = rings;
  return outer !== undefined && inRing(point, outer) && !holes.some((hole) => inRing(point, hole));
}

/** Whether a GeoJSON area of the index holds the point. */
export function featureHolds(feature: NsiFeature | undefined, point: Point): boolean {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  if (geometry.type === "Polygon") return inPolygon(point, geometry.coordinates as number[][][]);
  if (geometry.type === "MultiPolygon")
    return (geometry.coordinates as number[][][][]).some((polygon) => inPolygon(point, polygon));
  return false;
}

// Location codes that hold Japan: the country, the world, and the UN regions around it.
const JAPAN_CODES = new Set(["jp", "001", "142", "030"]);

/**
 * How a brand's location set reaches the point, or null when it does not (a brand of other countries,
 * or of other prefectures of Japan). A set that lists the country or the world reaches all of Japan.
 */
export function coverageOf(
  locationSet: NsiItem["locationSet"],
  point: Point,
  features: ReadonlyMap<string, NsiFeature>,
): Coverage | null {
  const reaches = (token: unknown): Coverage | null => {
    if (typeof token !== "string") return null; // circles around a point are never a whole region
    const code = token.toLowerCase();
    if (code === "001") return "world";
    if (JAPAN_CODES.has(code)) return "japan";
    return code.endsWith(".geojson") && featureHolds(features.get(code), point) ? "region" : null;
  };
  const include = (locationSet?.include ?? []).map(reaches).filter((item) => item !== null);
  if (include.length === 0) return null;
  if ((locationSet?.exclude ?? []).some((token) => reaches(token) !== null)) return null;
  // The widest reach wins, so a brand listed for Japan and for a prefecture counts as Japan.
  return include.includes("japan") ? "japan" : include.includes("world") ? "world" : "region";
}

export type NsiStats = {
  version: string;
  itemsInBrandTrees: number;
  keptJapan: number;
  keptWorld: number;
  keptRegion: number;
  notInJapan: number;
  withoutUsableName: number;
  inapplicableCategory: number;
};

/** The brands that operate in Japan and in the point's region, from the whole index. */
export function nsiBrands(
  data: NsiData,
  features: ReadonlyMap<string, NsiFeature>,
  point: Point,
): { brands: NsiBrand[]; stats: NsiStats } {
  const stats: NsiStats = {
    version: data._meta?.version ?? "unknown",
    itemsInBrandTrees: 0,
    keptJapan: 0,
    keptWorld: 0,
    keptRegion: 0,
    notInJapan: 0,
    withoutUsableName: 0,
    inapplicableCategory: 0,
  };
  const brands: NsiBrand[] = [];
  for (const [path, tree] of Object.entries(data.nsi)) {
    if (!path.startsWith("brands/")) continue;
    for (const item of tree.items) {
      stats.itemsInBrandTrees++;
      const coverage = coverageOf(item.locationSet, point, features);
      if (coverage === null) {
        stats.notInJapan++;
        continue;
      }
      const categories = categoriesForPath(path);
      if (categories.length === 0) {
        stats.inapplicableCategory++;
        continue;
      }
      const keys = brandKeys(item);
      if (keys.length === 0) {
        stats.withoutUsableName++;
        continue;
      }
      if (coverage === "japan") stats.keptJapan++;
      else if (coverage === "world") stats.keptWorld++;
      else stats.keptRegion++;
      brands.push({ id: item.id, displayName: item.displayName, path, coverage, categories, keys });
    }
  }
  brands.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path));
  return { brands, stats };
}

export type BrandMatch = { brand: NsiBrand; key: string };

/** Finds the brand a place's name starts with, among brands whose kind of business fits its category. */
export class BrandMatcher {
  private readonly byInitial = new Map<string, { key: string; brand: NsiBrand }[]>();

  constructor(brands: readonly NsiBrand[]) {
    for (const brand of brands)
      for (const key of brand.keys) {
        const initial = key.slice(0, 1);
        const list = this.byInitial.get(initial) ?? [];
        list.push({ key, brand });
        this.byInitial.set(initial, list);
      }
    // The longest name first, so "ホテルルートイン" wins over a shorter brand with the same start.
    for (const list of this.byInitial.values())
      list.sort(
        (a, b) =>
          b.key.length - a.key.length ||
          a.brand.id.localeCompare(b.brand.id) ||
          a.brand.path.localeCompare(b.brand.path),
      );
  }

  /** The best match among the names of one place, or null. */
  match(names: readonly string[], category: string | undefined): BrandMatch | null {
    if (category === undefined) return null;
    let best: BrandMatch | null = null;
    for (const name of names) {
      const keyed: KeyedName = keyedName(name);
      for (const entry of this.byInitial.get(keyed.key.slice(0, 1)) ?? []) {
        if (best && entry.key.length <= best.key.length) break;
        if (!entry.brand.categories.includes(category)) continue;
        if (startsWithBrandKey(keyed, entry.key)) {
          best = { brand: entry.brand, key: entry.key };
          break;
        }
      }
    }
    return best;
  }
}
