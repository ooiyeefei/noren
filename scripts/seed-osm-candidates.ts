import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { geoUserAgent } from "../src/lib/geo";
import { categoryForTags } from "../src/lib/osm/categories";
import { buildQuery, parseOverpass } from "../src/lib/osm/overpass";
import { namesFromTags } from "../src/lib/osm/tags";
import { getRegionConfig } from "../src/lib/region/registry";
import { createCliRunner, type ConvexRunner } from "./lib/convex-run";
import {
  DEFAULT_OVERPASS_ENDPOINT,
  fetchOverpass,
  httpsEndpoint,
  overpassCacheKey,
} from "./lib/overpass-fetch";

export function parseFlags(argv: readonly string[]) {
  let region = "";
  let endpoint = DEFAULT_OVERPASS_ENDPOINT;
  let dryRun = false;
  let prod = false;
  let refresh = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dry-run") dryRun = true;
    else if (flag === "--prod") prod = true;
    else if (flag === "--refresh") refresh = true;
    else if (flag === "--region" || flag === "--endpoint") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      if (flag === "--region") region = value;
      else endpoint = httpsEndpoint(value);
    } else throw new Error(`Unknown flag ${flag}`);
  }
  if (!region || !getRegionConfig(region))
    throw new Error("--region must name a configured region");
  return { region, endpoint, dryRun, prod, refresh };
}

export async function runSeed(
  argv: readonly string[],
  options: {
    env: Readonly<Record<string, string | undefined>>;
    cwd: string;
    fetch: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    run?: ConvexRunner;
    log: (value: unknown) => void;
  },
) {
  if (argv.includes("--help")) {
    options.log(
      "Usage: npx tsx scripts/seed-osm-candidates.ts --region nagasaki [--dry-run] [--refresh] [--endpoint <https url>] [--prod]\nRequires GEO_USER_AGENT='Noren/0.1 (+https://noren.yooi.me)'. Uses Convex admin CLI credentials for internal osmSeed:importCandidates. Dry run fetches/caches once but sends nothing to Convex. Daily UTC cache keyed by endpoint and query; --refresh ignores existing cache. Sequential requests, up to 3 retries after 30 seconds. Alternative endpoint only when the owner requests it.\n© OpenStreetMap contributors — ODbL-1.0 — https://www.openstreetmap.org/copyright",
    );
    return;
  }
  const flags = parseFlags(argv);
  const userAgent = geoUserAgent(options.env);
  if (!userAgent) throw new Error("A valid GEO_USER_AGENT is required");
  const region = getRegionConfig(flags.region)!;
  const now = options.now();
  const directory = resolve(options.cwd, ".scratch/osm-cache");
  await mkdir(directory, { recursive: true });
  // App-wide lock prevents overlapping CLI processes, even for different regions/endpoints.
  const lockPath = resolve(directory, ".import.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    throw new Error(
      "Another OSM import holds .scratch/osm-cache/.import.lock; if it crashed, verify it has stopped before removing the lock",
    );
  }
  try {
    const query = buildQuery({ bbox: region.bbox, timeoutSeconds: 120 });
    const cachePath = resolve(
      directory,
      overpassCacheKey({
        region: region.id,
        date: new Date(now).toISOString().slice(0, 10),
        endpoint: flags.endpoint,
        query,
      }),
    );
    let json: unknown;
    if (!flags.refresh) {
      try {
        json = JSON.parse(await readFile(cachePath, "utf8"));
        options.log("Using today's cached Overpass response");
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
          throw new Error("Cannot read daily OSM cache; inspect it before retrying", {
            cause: error,
          });
      }
    }
    if (json === undefined) {
      json = await fetchOverpass({
        query,
        endpoint: flags.endpoint,
        userAgent,
        fetch: options.fetch,
        sleep: options.sleep,
      });
      const temporary = `${cachePath}.partial`;
      const file = await open(temporary, "w");
      try {
        await file.writeFile(JSON.stringify(json));
      } finally {
        await file.close();
      }
      await rename(temporary, cachePath);
    }
    const retrievedAt = (await stat(cachePath)).mtimeMs;
    const stats = { skipped: 0 };
    const candidates = parseOverpass(json, stats);
    const counts: Record<string, number> = {};
    const focusCategories = region.categories?.filter((category) => category.focus) ?? [];
    const focusCounts = Object.fromEntries(
      focusCategories.map((category) => [category.key, { local: 0, chain: 0 }]),
    );
    for (const candidate of candidates) {
      const category = categoryForTags(candidate.tags);
      counts[category] = (counts[category] ?? 0) + 1;
      const split = focusCounts[category];
      if (split) split[candidate.isChain ? "chain" : "local"]++;
    }
    options.log({
      candidates: candidates.length,
      skipped: stats.skipped,
      categories: counts,
      focusCategories: focusCounts,
      firstFiveNames: candidates.slice(0, 5).map((candidate) => namesFromTags(candidate.tags)),
    });
    if (!flags.dryRun) {
      const run = options.run ?? createCliRunner({ prod: flags.prod, cwd: options.cwd });
      for (let i = 0; i < candidates.length; i += 100)
        options.log(
          await run("osmSeed:importCandidates", {
            regionId: region.id,
            retrievedAt,
            candidates: candidates.slice(i, i + 100),
          }),
        );
    }
    options.log(
      "© OpenStreetMap contributors — ODbL-1.0 — https://www.openstreetmap.org/copyright",
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runSeed(process.argv.slice(2), {
    env: process.env,
    cwd: process.cwd(),
    fetch,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    now: Date.now,
    log: console.log,
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "OSM import failed");
    process.exitCode = 1;
  });
