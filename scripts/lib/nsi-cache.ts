import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NsiData, NsiFeature } from "../../src/lib/chains/nsi";

/**
 * The OpenStreetMap Name Suggestion Index release the chain rules read, pinned so a rerun finds the
 * same brands. Source: github.com/osmlab/name-suggestion-index (BSD-3-Clause, Copyright (c) the
 * Name Suggestion Index contributors), as published on npm and served by jsDelivr. Both files are
 * downloaded once into .scratch/nsi/<version>/ and checked against the SHA-256 recorded here, which
 * equals the file inside the npm tarball whose integrity hash the registry published.
 */
export const NSI_VERSION = "8.0.20261101";
export const NSI_FILES: Readonly<Record<string, string>> = {
  "nsi.min.json": "618c91e449b6871a65f2f4fcade65c64322505a0b77e14869c0d0a921c95ae3c",
  "featureCollection.min.json": "397b22dc0937958921aa1ab7ee1d9efdeb3f2c438efe3aa5e7fafbc2fe60a2b2",
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type FetchBytes = (url: string) => Promise<Uint8Array>;

const defaultFetch: FetchBytes = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Fetching ${url} failed with HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

async function cachedFile(
  directory: string,
  file: string,
  fetchBytes: FetchBytes,
): Promise<{ bytes: Uint8Array; downloaded: boolean }> {
  const expected = NSI_FILES[file]!;
  const path = join(directory, file);
  try {
    const bytes = await readFile(path);
    if (sha256(bytes) === expected) return { bytes, downloaded: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const url = `https://cdn.jsdelivr.net/npm/name-suggestion-index@${NSI_VERSION}/dist/json/${file}`;
  const bytes = await fetchBytes(url);
  if (sha256(bytes) !== expected)
    throw new Error(`${file} from ${url} does not match the pinned SHA-256; refusing to use it`);
  await mkdir(directory, { recursive: true });
  await writeFile(`${path}.partial`, bytes);
  await rename(`${path}.partial`, path);
  return { bytes, downloaded: true };
}

/** The pinned index and its custom areas, downloaded into `<cacheRoot>/nsi/<version>` when missing. */
export async function loadNsi(cacheRoot: string, fetchBytes: FetchBytes = defaultFetch) {
  const directory = join(cacheRoot, "nsi", NSI_VERSION);
  const nsi = await cachedFile(directory, "nsi.min.json", fetchBytes);
  const areas = await cachedFile(directory, "featureCollection.min.json", fetchBytes);
  const data = JSON.parse(Buffer.from(nsi.bytes).toString("utf8")) as NsiData;
  const collection = JSON.parse(Buffer.from(areas.bytes).toString("utf8")) as {
    features: NsiFeature[];
  };
  const features = new Map<string, NsiFeature>();
  for (const feature of collection.features) if (feature.id) features.set(feature.id, feature);
  if (data._meta?.version !== NSI_VERSION)
    throw new Error(`The index says version ${data._meta?.version}, not ${NSI_VERSION}`);
  return { data, features, version: NSI_VERSION, downloaded: nsi.downloaded || areas.downloaded };
}
