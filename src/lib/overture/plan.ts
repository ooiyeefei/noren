import type { Script } from "../domain/constants";
import { listingNames } from "../osm/listings";
import { branchOf, chainNames } from "../osm/tags";
import { categoryForTaxonomy, isChainErrand, isNotAPlaceName } from "./categories";
import { PlaceIndex, nameKeys, websiteKey, type IndexedPlace } from "./dedupe";
import { baseSource, overtureNameTags, type OverturePlace } from "./place";

/** A place already in Noren, as the importer needs it to find doubles. */
export type ExistingPlace = {
  id: string;
  category?: string;
  /** Null for a place with no pin yet, which cannot be matched by place. */
  pin: { lat: number; lng: number } | null;
  /** Every name in any language. */
  names: string[];
  /** On the public map now: public and not taken off as an errand or by a report. */
  onMap: boolean;
  /** Provider and reference of each external reference the place already has. */
  refs: { provider: string; ref: string }[];
};

export type PlannedName = { lang: string; script: Script; value: string; isPrimary: boolean };
export type PlannedPlace = {
  gers: string;
  lat: number;
  lng: number;
  category: string;
  names: PlannedName[];
  dataset: string;
  licence: string;
  confidence: number;
};
export type PlannedLink = {
  placeId: string;
  gers: string;
  lat: number;
  lng: number;
  dataset: string;
  licence: string;
  metres: number;
  by: "name" | "close name" | "website";
};

export type PlanOptions = {
  focusCategories: readonly string[];
  locales: readonly string[];
  /** west, south, east, north; places outside are left for a later import. */
  bbox: readonly [number, number, number, number];
  minConfidence: number;
  nameMetres?: number;
  closeMetres?: number;
  websiteMetres?: number;
  /**
   * OSM-style tags (name, name:ja, name:en) of listings that OpenStreetMap marks as part of a brand.
   * OSM tags brands more completely than Overture does, so their names also find branches here.
   */
  knownChains?: readonly Record<string, string>[];
  /** Most places the map may show after the import (listForMap reads at most 4,000). */
  mapBudget: number;
};

export type Plan = {
  total: number;
  inBbox: number;
  /** Passed the category, chain and confidence filters, before any duplicate check. */
  kept: number;
  skipped: Record<string, number>;
  /** Kept places by Noren category. */
  categories: Record<string, number>;
  /** How many places that pass category and chain filters have at least each confidence. */
  confidenceCurve: Record<string, number>;
  chainBranches: number;
  alreadyImported: number;
  duplicatesOfExisting: PlannedLink[];
  /** Kept places that repeat a better-scored Overture place; dropped, found again by the next run. */
  duplicatesWithinOverture: { gers: string; keep: string; by: PlannedLink["by"]; metres: number }[];
  add: PlannedPlace[];
  map: { onMapNow: number; afterImport: number; budget: number; withinBudget: boolean };
};

export const DEFAULT_NAME_METRES = 50;
export const DEFAULT_CLOSE_METRES = 25;
export const DEFAULT_WEBSITE_METRES = 100;
export const CONFIDENCE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;
const NAME_MAX = 120;

function bump(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * The whole import decision, with no I/O: which Overture places Noren lists, which of them are doubles
 * of places it already has (they get a reference, not a place), and what the map would hold after.
 */
export function planImport(
  places: readonly OverturePlace[],
  existing: readonly ExistingPlace[],
  options: PlanOptions,
): Plan {
  const nameMetres = options.nameMetres ?? DEFAULT_NAME_METRES;
  const closeMetres = options.closeMetres ?? DEFAULT_CLOSE_METRES;
  const websiteMetres = options.websiteMetres ?? DEFAULT_WEBSITE_METRES;
  const [west, south, east, north] = options.bbox;
  const insideBbox = (place: OverturePlace) =>
    place.lng >= west && place.lng <= east && place.lat >= south && place.lat <= north;
  const plan: Plan = {
    total: places.length,
    inBbox: 0,
    kept: 0,
    skipped: {},
    categories: {},
    confidenceCurve: Object.fromEntries(CONFIDENCE_STEPS.map((step) => [String(step), 0])),
    chainBranches: 0,
    alreadyImported: 0,
    duplicatesOfExisting: [],
    duplicatesWithinOverture: [],
    add: [],
    map: { onMapNow: 0, afterImport: 0, budget: options.mapBudget, withinBudget: true },
  };

  // Chains Overture brands or OSM marks as a brand, and the unbranded branches named after them
  // ("リンガーハット長崎稲佐橋店").
  const chains = new Map<string, string>();
  for (const place of places)
    if (place.brand)
      for (const name of chainNames(overtureNameTags(place))) chains.set(name, place.id);
  for (const tags of options.knownChains ?? [])
    for (const name of chainNames(tags)) if (!chains.has(name)) chains.set(name, "osm");
  const isChain = new Map<string, boolean>();
  for (const place of places) {
    const branded = place.brand !== null;
    const branch = !branded && branchOf(overtureNameTags(place), chains.keys()) !== undefined;
    if (branch && insideBbox(place)) plan.chainBranches++;
    isChain.set(place.id, branded || branch);
  }

  const imported = new Set(
    existing.flatMap((place) =>
      place.refs.filter((ref) => ref.provider === "overture").map((ref) => ref.ref),
    ),
  );

  const kept: { place: OverturePlace; planned: PlannedPlace; keys: string[] }[] = [];
  for (const place of places) {
    const skip = (reason: string) => bump(plan.skipped, reason);
    if (!insideBbox(place)) continue;
    plan.inBbox++;
    if (place.operatingStatus !== null && place.operatingStatus !== "open")
      skip("closed or closing");
    else {
      const category = categoryForTaxonomy(place.hierarchy, place.names.primary);
      const names = listingNames(overtureNameTags(place), options.locales);
      const source = baseSource(place);
      if (category === null) skip("not a place to visit (category)");
      else if (isNotAPlaceName(place.names.primary)) skip("name is a stop, district or office");
      else if (!options.focusCategories.includes(category)) skip("not a focus category");
      else if (isChain.get(place.id) && isChainErrand(category)) skip("chain");
      else {
        // The confidence curve counts what the category and chain filters kept.
        if (place.confidence !== null)
          for (const step of CONFIDENCE_STEPS)
            if (place.confidence >= step) bump(plan.confidenceCurve, String(step));
        if (place.confidence === null || place.confidence < options.minConfidence)
          skip("below confidence floor");
        else if (!names.length || names.some((name) => name.value.length > NAME_MAX))
          skip("no valid name");
        else if (!source) skip("licence not recognised");
        else {
          plan.kept++;
          bump(plan.categories, category);
          kept.push({
            place,
            keys: nameKeys(names.map((name) => name.value)),
            planned: {
              gers: place.id,
              lat: place.lat,
              lng: place.lng,
              category,
              names,
              dataset: source.dataset,
              licence: source.licence,
              confidence: place.confidence,
            },
          });
        }
      }
    }
  }

  const index = new PlaceIndex(
    { nameMetres, closeMetres, websiteMetres },
    existing.flatMap((place): IndexedPlace[] =>
      place.pin
        ? [
            {
              id: place.id,
              ...place.pin,
              keys: nameKeys(place.names),
              // Places from OSM carry no website, so a website match needs two Overture records.
              websites: [],
              category: place.category,
            },
          ]
        : [],
    ),
  );
  plan.map.onMapNow = existing.filter((place) => place.onMap).length;

  // The most confident record of a double wins; the id breaks ties so a rerun chooses the same one.
  kept.sort(
    (a, b) =>
      b.planned.confidence - a.planned.confidence ||
      b.place.websites.length - a.place.websites.length ||
      a.place.id.localeCompare(b.place.id),
  );
  const existingIds = new Set(existing.map((place) => place.id));
  for (const { place, planned, keys } of kept) {
    if (imported.has(place.id)) {
      plan.alreadyImported++;
      continue;
    }
    const candidate: IndexedPlace = {
      id: place.id,
      lat: place.lat,
      lng: place.lng,
      keys,
      websites: place.websites.flatMap((site) => websiteKey(site) ?? []),
      category: planned.category,
    };
    const match = index.find(candidate);
    if (match && existingIds.has(match.place.id))
      plan.duplicatesOfExisting.push({
        placeId: match.place.id,
        gers: place.id,
        lat: place.lat,
        lng: place.lng,
        dataset: planned.dataset,
        licence: planned.licence,
        metres: Math.round(match.metres),
        by: match.by,
      });
    else if (match)
      plan.duplicatesWithinOverture.push({
        gers: place.id,
        keep: match.place.id,
        by: match.by,
        metres: Math.round(match.metres),
      });
    else {
      plan.add.push(planned);
      index.add(candidate);
    }
  }
  plan.map.afterImport = plan.map.onMapNow + plan.add.length;
  plan.map.withinBudget = plan.map.afterImport <= options.mapBudget;
  return plan;
}
