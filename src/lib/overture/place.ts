import type { Licence } from "../domain/constants";

/** One Overture place as scripts/fetch-overture-places.py writes it to the snapshot. */
export type OvertureSource = {
  property: string | null;
  dataset: string | null;
  license: string | null;
  recordId: string | null;
  updateTime: string | null;
  confidence: number | null;
};

export type OverturePlace = {
  /** The GERS identifier. */
  id: string;
  lat: number;
  lng: number;
  confidence: number | null;
  operatingStatus: string | null;
  basicCategory: string | null;
  /** Overture taxonomy path from the broad group to the place's own type; empty when unclassified. */
  hierarchy: string[];
  names: { primary: string; common: Record<string, string> };
  brand: { wikidata: string | null; name: string | null } | null;
  websites: string[];
  socials: string[];
  /** The first freeform address, kept for the steward's eyes; never shown on the map. */
  address: string | null;
  sources: OvertureSource[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((item) => (text(item) ? [text(item)!] : [])) : [];

/** Malformed rows are skipped independently; optional stats let CLI callers report omissions. */
export function parseOverturePlace(
  value: unknown,
  stats?: { skipped: number },
): OverturePlace | null {
  const row = record(value);
  const id = text(row?.id);
  const names = record(row?.names);
  const primary = text(names?.primary);
  const { lat, lng } = row ?? {};
  if (
    !row ||
    !id ||
    !primary ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    if (stats) stats.skipped++;
    return null;
  }
  const common: Record<string, string> = {};
  for (const [lang, name] of Object.entries(record(names?.common) ?? {}))
    if (text(name)) common[lang] = text(name)!;
  const brand = record(row.brand);
  const taxonomy = record(row.taxonomy);
  const address = Array.isArray(row.addresses) ? text(record(row.addresses[0])?.freeform) : null;
  return {
    id,
    lat,
    lng,
    confidence:
      typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : null,
    operatingStatus: text(row.operatingStatus),
    basicCategory: text(row.basicCategory),
    hierarchy: strings(taxonomy?.hierarchy),
    names: { primary, common },
    brand:
      brand && (text(brand.wikidata) || text(brand.name))
        ? { wikidata: text(brand.wikidata), name: text(brand.name) }
        : null,
    websites: strings(row.websites),
    socials: strings(row.socials),
    address,
    sources: Array.isArray(row.sources)
      ? row.sources.flatMap((source) => {
          const s = record(source);
          return s
            ? [
                {
                  property: typeof s.property === "string" ? s.property : null,
                  dataset: text(s.dataset),
                  license: text(s.license),
                  recordId: text(s.recordId),
                  updateTime: text(s.updateTime),
                  confidence: typeof s.confidence === "number" ? s.confidence : null,
                },
              ]
            : [];
        })
      : [],
  };
}

/**
 * Overture Places carries a licence per source dataset, not per theme (docs.overturemaps.org/attribution).
 * These are the three the Places theme uses; CC0-1.0 is stored under the "CC0" key the app already has.
 * A licence outside this table is never guessed at: the record is left out.
 */
export const OVERTURE_LICENCES: Readonly<Record<string, Licence>> = {
  "CDLA-Permissive-2.0": "CDLA-Permissive-2.0",
  "Apache-2.0": "Apache-2.0",
  "CC0-1.0": "CC0",
};
export const OVERTURE_STORED_LICENCES: readonly Licence[] = [
  ...new Set(Object.values(OVERTURE_LICENCES)),
];

/** The dataset that supplied the record itself (the source with no property), and its licence. */
export function baseSource(place: Pick<OverturePlace, "sources">): {
  dataset: string;
  licence: Licence;
} | null {
  const source = place.sources.find((item) => !item.property && item.dataset && item.license);
  const licence = source?.license ? OVERTURE_LICENCES[source.license] : undefined;
  return source?.dataset && licence ? { dataset: source.dataset, licence } : null;
}

const DATASET_NAMES: Readonly<Record<string, string>> = {
  meta: "Meta",
  microsoft: "Microsoft",
  foursquare: "Foursquare",
  alltheplaces: "AllThePlaces",
  uberall: "Uberall",
  opentravel: "OpenTravel Alliance",
};

/** The credit line stored with each reference; the acknowledgements page carries the full text. */
export function overtureAttribution(dataset: string, licence: Licence, release: string): string {
  const name = DATASET_NAMES[dataset.toLowerCase()] ?? dataset;
  return `Overture Maps Foundation (release ${release}); data from ${name}, ${licence}; https://docs.overturemaps.org/attribution/`;
}

export const OVERTURE_RELEASE = /^\d{4}-\d{2}-\d{2}\.\d+$/;
/** GERS identifiers are lowercase UUIDs. */
export const GERS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const OVERTURE_DATASET = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;

/** OSM-style name tags, so the OSM listing helpers (names, chain branches) read an Overture place. */
export function overtureNameTags(place: Pick<OverturePlace, "names">): Record<string, string> {
  const tags: Record<string, string> = { name: place.names.primary };
  if (place.names.common.ja) tags["name:ja"] = place.names.common.ja;
  if (place.names.common.en) tags["name:en"] = place.names.common.en;
  return tags;
}
