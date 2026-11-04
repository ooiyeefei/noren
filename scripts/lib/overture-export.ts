import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExistingPlace } from "../../src/lib/overture/plan";

type Row = Record<string, unknown>;

async function jsonLines(path: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const row: unknown = JSON.parse(line);
    if (row && typeof row === "object" && !Array.isArray(row)) rows.push(row as Row);
  }
  return rows;
}

const pinOf = (value: unknown): { lat: number; lng: number } | null => {
  const pin = value as { lat?: unknown; lng?: unknown } | null | undefined;
  return typeof pin?.lat === "number" && typeof pin.lng === "number"
    ? { lat: pin.lat, lng: pin.lng }
    : null;
};

/**
 * The places of one region from a read-only export of the place, placeName, pin and placeExternalRef
 * tables (`npx convex data <table> --deployment <name> --limit 10000 --format jsonLines`, one file
 * each named <table>.jsonl). This is what `overtureSeed:existingPlaces` returns, for a dry run that
 * must not reach a deployment. Names and pin come from the copies on the place row, as the map reads
 * them, and from the tables for a row without copies.
 */
export async function readExistingFromExport(
  dir: string,
  regionId: string,
): Promise<ExistingPlace[]> {
  const [places, names, pins, refs] = await Promise.all(
    ["place", "placeName", "pin", "placeExternalRef"].map((table) =>
      jsonLines(join(dir, `${table}.jsonl`)),
    ),
  );
  const group = <T>(rows: Row[], pick: (row: Row) => T) => {
    const byPlace = new Map<string, T[]>();
    for (const row of rows) {
      const id = String(row.placeId);
      byPlace.set(id, [...(byPlace.get(id) ?? []), pick(row)]);
    }
    return byPlace;
  };
  const namesByPlace = group(names!, (row) => String(row.value));
  const refsByPlace = group(refs!, (row) => ({
    provider: String(row.provider),
    ref: String(row.ref),
  }));
  const pinByPlace = new Map(pins!.map((row) => [String(row.placeId), pinOf(row)]));
  return places!
    .filter((place) => place.regionId === regionId)
    .map((place) => {
      const id = String(place._id);
      const copied = Array.isArray(place.mapNames)
        ? (place.mapNames as Row[]).map((name) => String(name.value))
        : undefined;
      const publiclyReadable =
        (place.visibility === "public" && place.isMock === false) ||
        (place.visibility === "demo_public" &&
          place.demoPublicBasis === "fictional" &&
          place.isMock === true);
      return {
        id,
        category: typeof place.category === "string" ? place.category : undefined,
        pin: place.mapPin !== undefined ? pinOf(place.mapPin) : (pinByPlace.get(id) ?? null),
        names: copied ?? namesByPlace.get(id) ?? [],
        onMap: publiclyReadable && place.hiddenReason === undefined,
        refs: refsByPlace.get(id) ?? [],
      };
    });
}

/**
 * Tags (name, name:ja, name:en) of the OSM candidates marked as part of a brand, from an export of
 * the seedOsmCandidate table; empty when the export has none, as for a deployment without OSM data.
 */
export async function readKnownChainsFromExport(dir: string): Promise<Record<string, string>[]> {
  let rows: Row[];
  try {
    rows = await jsonLines(join(dir, "seedOsmCandidate.jsonl"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return rows.flatMap((row) => {
    const tags = row.tags as Record<string, unknown> | undefined;
    if (row.isChain !== true || !tags) return [];
    const picked: Record<string, string> = {};
    for (const key of ["name", "name:ja", "name:en"])
      if (typeof tags[key] === "string") picked[key] = tags[key];
    return [picked];
  });
}
