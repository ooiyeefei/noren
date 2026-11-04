import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PublicPlace } from "../../src/lib/chains/plan";

type Row = Record<string, unknown>;

/** Tables the chain rules read. The last seven say a place has a story, a post, an owner or a page. */
export const EXPORT_TABLES = [
  "place",
  "placeName",
  "placeExternalRef",
  "story",
  "source",
  "placeOwner",
  "note",
  "claim",
  "pageVersion",
  "interview",
] as const;
/** The most rows `convex data` returns in one call (it refuses 50,001); production holds a fifth of this. */
export const EXPORT_LIMIT = 20_000;

export type ExecLike = (
  file: string,
  args: string[],
  options: { cwd: string; maxBuffer: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => unknown;

/**
 * Reads every table with `npx convex data <table> --deployment <name> --format jsonLines`, which
 * changes nothing, and saves each as <dir>/<table>.jsonl so the run can be repeated offline.
 */
export async function exportFromDeployment(
  deployment: string,
  dir: string,
  cwd: string,
  exec: ExecLike = execFile,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const table of EXPORT_TABLES) {
    const stdout = await new Promise<string>((resolve, reject) => {
      exec(
        "npx",
        [
          "convex",
          "data",
          table,
          "--deployment",
          deployment,
          "--limit",
          String(EXPORT_LIMIT),
          "--format",
          "jsonLines",
        ],
        { cwd, maxBuffer: 256 * 1024 * 1024 },
        (error, out, err) => {
          if (error) reject(new Error(err.trim() || error.message));
          else resolve(out);
        },
      );
    });
    // `convex data` prints a sentence, not rows, for an empty table.
    const rows = stdout.split("\n").filter((line) => line.trim().startsWith("{"));
    if (rows.length >= EXPORT_LIMIT)
      throw new Error(`${table} has ${EXPORT_LIMIT} rows or more; raise EXPORT_LIMIT`);
    await writeFile(join(dir, `${table}.jsonl`), rows.map((row) => `${row}\n`).join(""));
  }
}

async function jsonLines(path: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const row: unknown = JSON.parse(line);
    if (row && typeof row === "object" && !Array.isArray(row)) rows.push(row as Row);
  }
  return rows;
}

/**
 * The places on the public map of one region, from an export: real, public, and not already taken off
 * as an errand or by a report. Names come from the copies on the place row, as the map reads them, and
 * from the placeName table for a row without copies.
 */
export async function readPublicPlaces(dir: string, regionId: string): Promise<PublicPlace[]> {
  const table = (name: (typeof EXPORT_TABLES)[number]) => jsonLines(join(dir, `${name}.jsonl`));
  const [places, names, refs] = await Promise.all([
    table("place"),
    table("placeName"),
    table("placeExternalRef"),
  ]);
  const group = <T>(rows: Row[], pick: (row: Row) => T) => {
    const byPlace = new Map<string, T[]>();
    for (const row of rows) {
      const id = String(row.placeId);
      byPlace.set(id, [...(byPlace.get(id) ?? []), pick(row)]);
    }
    return byPlace;
  };
  const namesByPlace = group(names, (row) => ({
    value: String(row.value),
    isPrimary: row.isPrimary === true,
  }));
  const refsByPlace = group(refs, (row) => ({
    provider: String(row.provider),
    ref: String(row.ref),
  }));
  const protection = new Map<string, Set<string>>();
  const protect = (placeId: unknown, reason: string) => {
    const id = String(placeId);
    protection.set(id, (protection.get(id) ?? new Set()).add(reason));
  };
  const reasons: [(typeof EXPORT_TABLES)[number], string][] = [
    ["story", "has a story"],
    ["source", "has a linked post"],
    ["placeOwner", "has a confirmed owner"],
    ["note", "has a visitor note"],
    ["claim", "has a claim"],
    ["pageVersion", "has a page"],
    ["interview", "has an interview"],
  ];
  for (const [name, reason] of reasons)
    for (const row of await table(name)) protect(row.placeId, reason);
  for (const place of places)
    if (place.sharedAt !== undefined) protect(place._id, "added by a member");

  return places
    .filter(
      (place) =>
        place.regionId === regionId &&
        place.visibility === "public" &&
        place.isMock === false &&
        place.hiddenReason === undefined,
    )
    .map((place) => {
      const id = String(place._id);
      const copied = Array.isArray(place.mapNames)
        ? (place.mapNames as Row[]).map((name) => ({
            value: String(name.value),
            isPrimary: name.isPrimary === true,
          }))
        : undefined;
      const all = copied ?? namesByPlace.get(id) ?? [];
      // The primary name first, so reports say what the map says.
      const ordered = [...all].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      return {
        id,
        category: typeof place.category === "string" ? place.category : undefined,
        names: [...new Set(ordered.map((name) => name.value))],
        refs: refsByPlace.get(id) ?? [],
        protectedBy: [...(protection.get(id) ?? [])].sort(),
      };
    });
}
