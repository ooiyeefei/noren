import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { regionSchema, type RegionConfig } from "./schema";

export { deriveRegionPolicy } from "./schema";
export type { RegionConfig, RegionPolicy } from "./schema";

const REGIONS_DIR = path.join(process.cwd(), "regions");

export type ParsedRegionFile = { ok: true; region: RegionConfig } | { ok: false; problem: string };

/** Pure: validates the text of one region file. `fileName` must be `<region id>.json`. */
export function parseRegionFile(fileName: string, text: string): ParsedRegionFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { ok: false, problem: `${fileName} is not valid JSON (${reason})` };
  }
  const result = regionSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, problem: `${fileName} is invalid:\n${z.prettifyError(result.error)}` };
  }
  const expectedId = fileName.replace(/\.json$/, "");
  if (result.data.id !== expectedId) {
    return {
      ok: false,
      problem: `${fileName} declares id "${result.data.id}" but the file name says "${expectedId}"`,
    };
  }
  return { ok: true, region: result.data };
}

export class RegionConfigError extends Error {
  override name = "RegionConfigError";
}

/**
 * Reads and validates every file in regions/. Throws one error that lists every problem.
 *
 * The turbopackIgnore markers stop the bundler tracing the whole project because `dir` is a
 * runtime value; regions/ ships with the server through `outputFileTracingIncludes` instead.
 */
export function loadRegions(dir: string = REGIONS_DIR): Map<string, RegionConfig> {
  let files: string[];
  try {
    files = readdirSync(/*turbopackIgnore: true*/ dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new RegionConfigError(`Cannot read the regions folder ${dir} (${reason})`);
  }
  if (files.length === 0) throw new RegionConfigError(`No region files found in ${dir}`);

  const regions = new Map<string, RegionConfig>();
  const problems: string[] = [];
  for (const file of files) {
    const text = readFileSync(path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
    const parsed = parseRegionFile(file, text);
    if (parsed.ok) regions.set(parsed.region.id, parsed.region);
    else problems.push(parsed.problem);
  }
  if (problems.length > 0) {
    throw new RegionConfigError(`Invalid region configuration:\n\n${problems.join("\n\n")}`);
  }
  return regions;
}

let cached: Map<string, RegionConfig> | undefined;

export function getRegions(): Map<string, RegionConfig> {
  cached ??= loadRegions();
  return cached;
}

export function getRegion(id: string): RegionConfig | undefined {
  return getRegions().get(id);
}

/**
 * The region this deployment serves: `REGION_ID` when set, else the only region file present.
 * With several region files and no `REGION_ID` there is no safe default, so it throws.
 */
export function getActiveRegion(): RegionConfig {
  const regions = getRegions();
  const wanted = process.env.REGION_ID;
  if (wanted) {
    const region = regions.get(wanted);
    if (!region) {
      throw new RegionConfigError(
        `REGION_ID is "${wanted}" but regions/ only has: ${[...regions.keys()].join(", ")}`,
      );
    }
    return region;
  }
  const [only, ...rest] = [...regions.values()];
  if (only && rest.length === 0) return only;
  throw new RegionConfigError(
    `Several regions exist (${[...regions.keys()].join(", ")}); set REGION_ID to choose one`,
  );
}
