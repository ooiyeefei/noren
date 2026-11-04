import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prefectureOf, type RecordAddress } from "../../src/lib/chains/local";
import type { SnapshotRecord } from "../../src/lib/chains/plan";

type Manifest = { release: string; region: string; count: number; sha256: string };

/**
 * The whole Overture snapshot of a region (scripts/fetch-overture-places.py), errands included, as
 * the chain rules read it. The rows are checked against the manifest's count and SHA-256, so a
 * partly written or edited file is refused.
 */
export async function readChainSnapshot(jsonlPath: string) {
  const manifestPath = jsonlPath.replace(/\.jsonl$/u, ".manifest.json");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  } catch (error) {
    throw new Error(`No manifest next to the snapshot at ${manifestPath}`, { cause: error });
  }
  const bytes = await readFile(jsonlPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== manifest.sha256)
    throw new Error("The snapshot does not match the SHA-256 in its manifest; fetch it again");
  const records: SnapshotRecord[] = [];
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  for (const line of bytes.toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      id?: unknown;
      lat?: unknown;
      lng?: unknown;
      names?: { primary?: unknown };
      brand?: { name?: unknown; wikidata?: unknown } | null;
      addresses?: RecordAddress[] | null;
    };
    const name = text(row.names?.primary);
    if (
      typeof row.id !== "string" ||
      !name ||
      typeof row.lat !== "number" ||
      typeof row.lng !== "number"
    )
      continue;
    const brand = row.brand
      ? { name: text(row.brand.name), wikidata: text(row.brand.wikidata) }
      : null;
    records.push({
      id: row.id,
      name,
      lat: row.lat,
      lng: row.lng,
      brand: brand && (brand.name || brand.wikidata) ? brand : null,
      prefecture: prefectureOf(row.addresses ?? []),
    });
  }
  if (records.length !== manifest.count)
    throw new Error(
      `The snapshot has ${records.length} usable rows but its manifest counts ${manifest.count}`,
    );
  return { records, release: manifest.release, count: manifest.count };
}
