import { homeRegionConfig } from "../region/registry";
import type { RegionConfig } from "../region/schema";
import { CATEGORY_KEYS, isChainFromTags, pickTags } from "./tags";

export type ParsedCandidate = {
  osmType: "node" | "way" | "relation";
  osmId: number;
  tags: Record<string, string>;
  lat: number;
  lng: number;
  isChain: boolean;
  osmVersion?: number;
  osmTimestamp?: string;
};

type ImportBox = { id: string; bbox: RegionConfig["bbox"] };

export function importBoxes(region: RegionConfig): ImportBox[] {
  if (region.id === homeRegionConfig().id) return [{ id: region.id, bbox: region.bbox }];
  // Road endpoints such as Kuala Lumpur have no town entry.
  return (region.towns ?? []).map(({ id, center, radiusMetres }) => {
    const latitude = ((radiusMetres / 6371000) * 180) / Math.PI;
    const longitude = latitude / Math.cos((center.lat * Math.PI) / 180);
    const [west, south, east, north] = region.bbox;
    return {
      id,
      bbox: [
        Math.max(west, center.lng - longitude),
        Math.max(south, center.lat - latitude),
        Math.min(east, center.lng + longitude),
        Math.min(north, center.lat + latitude),
      ],
    };
  });
}

export function insideImportBox(
  { lat, lng }: { lat: number; lng: number },
  [west, south, east, north]: RegionConfig["bbox"],
) {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export function buildQuery({
  bbox,
  timeoutSeconds,
}: {
  bbox: readonly [number, number, number, number];
  timeoutSeconds: number;
}): string {
  const [west, south, east, north] = bbox;
  if (
    !bbox.every(Number.isFinite) ||
    west > east ||
    south > north ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > 180
  )
    throw new Error("Invalid Overpass bbox or timeout (1–180 seconds)");
  const keys = CATEGORY_KEYS.join("|");
  return `[out:json][timeout:${timeoutSeconds}];\nnwr["name"][~"^(${keys})$"~"."](${south},${west},${north},${east});\nout center meta tags;`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Malformed elements are skipped independently; optional stats let CLI callers report omissions. */
export function parseOverpass(
  json: unknown,
  stats?: { skipped: number },
  nameLanguages: readonly string[] = ["ja", "en"],
): ParsedCandidate[] {
  const elements = record(json)?.elements;
  if (!Array.isArray(elements)) return [];
  const candidates: ParsedCandidate[] = [];
  for (const element of elements) {
    const row = record(element);
    const type = row?.type;
    // Derive the flag before the storage allowlist strips brand tags.
    const isChain = isChainFromTags(row?.tags);
    const tags = pickTags(row?.tags, nameLanguages);
    const point = type === "node" ? row : record(row?.center);
    const lat = point?.lat;
    const lng = point?.lon;
    if (
      !row ||
      (type !== "node" && type !== "way" && type !== "relation") ||
      typeof row.id !== "number" ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      !tags.name ||
      !CATEGORY_KEYS.some((key) => tags[key]) ||
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      if (stats) stats.skipped++;
      continue;
    }
    candidates.push({
      osmType: type as ParsedCandidate["osmType"],
      osmId: row.id,
      tags,
      lat,
      lng,
      isChain,
      ...(typeof row.version === "number" && Number.isSafeInteger(row.version) && row.version > 0
        ? { osmVersion: row.version }
        : {}),
      ...(typeof row.timestamp === "string" ? { osmTimestamp: row.timestamp } : {}),
    });
  }
  return candidates;
}
