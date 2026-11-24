import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  areaRegionSchema,
  overlayAreaRegion,
  regionSchema,
  type AreaRegion,
  type RegionConfig,
} from "./schema";

export { deriveRegionPolicy } from "./schema";
export type { RegionConfig, RegionPolicy } from "./schema";

const REGIONS_DIR = path.join(process.cwd(), "regions");

type RegionFile = { kind: "whole"; region: RegionConfig } | { kind: "area"; region: AreaRegion };

export type ParsedRegionFile = ({ ok: true } & RegionFile) | { ok: false; problem: string };

/** Pure: validates the text of one region file. `fileName` must be `<region id>.json`. */
export function parseRegionFile(fileName: string, text: string): ParsedRegionFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { ok: false, problem: `${fileName} is not valid JSON (${reason})` };
  }

  const whole = regionSchema.safeParse(json);
  let parsed: RegionFile;
  if (whole.success) {
    parsed = { kind: "whole", region: whole.data };
  } else {
    const area = areaRegionSchema.safeParse(json);
    if (!area.success) {
      const score = (error: z.ZodError) =>
        error.issues.reduce(
          (total, issue) => total + (issue.code === "unrecognized_keys" ? issue.keys.length : 1),
          0,
        );
      const useWhole = score(whole.error) <= score(area.error);
      const error = useWhole ? whole.error : area.error;
      return {
        ok: false,
        problem: `${fileName} is invalid:\nReading as a ${useWhole ? "whole region" : "region area"}:\n${z.prettifyError(error)}`,
      };
    }
    parsed = { kind: "area", region: area.data };
  }

  const expectedId = fileName.replace(/\.json$/, "");
  if (parsed.region.id !== expectedId) {
    return {
      ok: false,
      problem: `${fileName} declares id "${parsed.region.id}" but the file name says "${expectedId}"`,
    };
  }
  return { ok: true, ...parsed };
}

export class RegionConfigError extends Error {
  override name = "RegionConfigError";
}

function selectHome(files: Map<string, RegionFile>, wanted: string | undefined): RegionConfig {
  const ids = [...files.keys()].join(", ");
  const whole = [...files.values()].filter((file) => file.kind === "whole");
  const homeId = wanted || (files.has("nagasaki") ? "nagasaki" : undefined);
  if (homeId) {
    const file = files.get(homeId);
    if (!file) {
      throw new RegionConfigError(`REGION_ID is "${homeId}" but regions/ only has: ${ids}`);
    }
    if (file.kind === "area") {
      throw new RegionConfigError(
        `${homeId}.json is an area; the home region must be a whole region`,
      );
    }
    return file.region;
  }

  const [only, ...rest] = whole;
  if (only && rest.length === 0) return only.region;
  if (!only) throw new RegionConfigError(`No whole region exists (${ids})`);
  throw new RegionConfigError(`Several regions exist (${ids}); set REGION_ID to choose one`);
}

function throwProblems(problems: string[]) {
  if (problems.length > 0) {
    throw new RegionConfigError(`Invalid region configuration:\n\n${problems.join("\n\n")}`);
  }
}

/**
 * Reads and validates every file in regions/. Throws one error that lists every problem.
 *
 * The turbopackIgnore markers stop the bundler tracing the whole project because `dir` is a
 * runtime value; regions/ ships with the server through `outputFileTracingIncludes` instead.
 */
function loadRegionDirectory(dir: string, wanted: string | undefined) {
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

  const parsedFiles = new Map<string, RegionFile>();
  const problems: string[] = [];
  for (const file of files) {
    const text = readFileSync(path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
    const parsed = parseRegionFile(file, text);
    if (parsed.ok) parsedFiles.set(parsed.region.id, parsed);
    else problems.push(parsed.problem);
  }
  throwProblems(problems);

  const home = selectHome(parsedFiles, wanted);
  const regions = new Map<string, RegionConfig>();
  for (const [id, file] of parsedFiles) {
    if (file.kind === "whole") {
      regions.set(id, file.region);
      continue;
    }
    const result = overlayAreaRegion(home, file.region);
    if (result.success) regions.set(id, result.data);
    else problems.push(`${id}.json is invalid:\n${z.prettifyError(result.error)}`);
  }
  throwProblems(problems);
  return { home, regions };
}

export function loadRegions(dir: string = REGIONS_DIR): Map<string, RegionConfig> {
  return loadRegionDirectory(dir, process.env.REGION_ID).regions;
}

let cached:
  { wanted: string | undefined; data: ReturnType<typeof loadRegionDirectory> } | undefined;

function getRegionDirectory() {
  const wanted = process.env.REGION_ID;
  if (!cached || cached.wanted !== wanted) {
    cached = { wanted, data: loadRegionDirectory(REGIONS_DIR, wanted) };
  }
  return cached.data;
}

export function getRegions(): Map<string, RegionConfig> {
  return getRegionDirectory().regions;
}

export function getRegion(id: string): RegionConfig | undefined {
  return getRegions().get(id);
}

export function getActiveRegion(): RegionConfig {
  return getRegionDirectory().home;
}
