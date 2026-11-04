import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MAP_PLACE_LIMIT } from "../src/lib/domain/constants";
import { parseOverturePlace, type OverturePlace } from "../src/lib/overture/place";
import {
  planImport,
  type ExistingPlace,
  type Plan,
  type PlannedLink,
  type PlannedPlace,
} from "../src/lib/overture/plan";
import { getRegionConfig } from "../src/lib/region/registry";
import { createCliRunner, type ConvexRunner } from "./lib/convex-run";
import { readExistingFromExport, readKnownChainsFromExport } from "./lib/overture-export";

const attribution =
  "Overture Maps Foundation, overturemaps.org. Places data is licensed per source: CDLA-Permissive-2.0, Apache-2.0, CC0-1.0. https://docs.overturemaps.org/attribution/";

/**
 * The lowest Overture confidence the import lists. Measured on release 2026-10-21.0 for the whole
 * region: 4,420 places pass the category and chain filters, 4,044 of them with confidence 0.5 or
 * more, 3,788 at 0.6, 3,416 at 0.7, 2,515 at 0.8 and 1,926 at 0.9. OSM independently has 233 of them
 * (so they exist): 97% of those score 0.5 or more, 95% 0.6, 92% 0.7, 81% 0.8 and 74% 0.9. A floor of
 * 0.7 drops 1,004 places and loses 19 of the 233 known ones; 0.8 would drop 901 more and lose 25 more
 * known ones. Overture documents the score as how likely the place is to exist, without a cut-off.
 */
export const DEFAULT_MIN_CONFIDENCE = 0.7;
/** The map reads MAP_PLACE_LIMIT places; the rest is room for members' places and OSM growth. */
export const DEFAULT_MAP_BUDGET = MAP_PLACE_LIMIT - 200;
const PUBLISH_BATCH = 50;
const LINK_BATCH = 100;
const PAGE = 200;

export function parseFlags(argv: readonly string[]) {
  const flags = {
    region: "",
    release: "",
    deployment: undefined as string | undefined,
    steward: undefined as string | undefined,
    existingDir: undefined as string | undefined,
    dryRun: false,
    minConfidence: DEFAULT_MIN_CONFIDENCE,
    mapBudget: DEFAULT_MAP_BUDGET,
    bbox: undefined as [number, number, number, number] | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (
      ![
        "--region",
        "--release",
        "--deployment",
        "--steward",
        "--existing-dir",
        "--min-confidence",
        "--map-budget",
        "--bbox",
      ].includes(flag ?? "")
    )
      throw new Error(`Unknown flag ${flag}; use --help`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--region") flags.region = value;
    else if (flag === "--release") flags.release = value;
    else if (flag === "--deployment") flags.deployment = value;
    else if (flag === "--steward") flags.steward = value;
    else if (flag === "--existing-dir") flags.existingDir = value;
    else if (flag === "--min-confidence") {
      flags.minConfidence = Number(value);
      if (!(flags.minConfidence >= 0 && flags.minConfidence <= 1))
        throw new Error("--min-confidence must be between 0 and 1");
    } else if (flag === "--map-budget") {
      flags.mapBudget = Number(value);
      if (
        !Number.isInteger(flags.mapBudget) ||
        flags.mapBudget < 1 ||
        flags.mapBudget > MAP_PLACE_LIMIT
      )
        throw new Error(`--map-budget must be a whole number up to ${MAP_PLACE_LIMIT}`);
    } else {
      const parts = value.split(",").map(Number);
      const [west, south, east, north] = parts;
      if (
        parts.length !== 4 ||
        !parts.every(Number.isFinite) ||
        !(west! < east! && south! < north!)
      )
        throw new Error("--bbox needs west,south,east,north");
      flags.bbox = [west!, south!, east!, north!];
    }
  }
  const region = getRegionConfig(flags.region);
  if (!region) throw new Error("--region must name a configured region");
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(flags.release))
    throw new Error("--release must name an Overture release such as 2026-10-21.0");
  if (flags.existingDir !== undefined && !flags.dryRun)
    throw new Error("--existing-dir reads a local export, so it is for --dry-run only");
  if (flags.deployment === undefined && flags.existingDir === undefined)
    throw new Error("--deployment <name> is required (or --existing-dir with --dry-run)");
  if (!flags.dryRun && !flags.steward) throw new Error("--steward <personId> is required");
  if (flags.bbox) {
    const [west, south, east, north] = region.bbox;
    const [w, s, e, n] = flags.bbox;
    if (w < west || s < south || e > east || n > north)
      throw new Error("--bbox must lie inside the region bbox");
  }
  return { ...flags, bbox: flags.bbox ?? region.bbox };
}

type Manifest = { release: string; region: string; count: number; retrievedAt: string };

export async function readSnapshot(directory: string, region: string, release: string) {
  const base = resolve(directory, ".scratch/overture", release, `places-${region}`);
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(`${base}.manifest.json`, "utf8")) as Manifest;
  } catch (error) {
    throw new Error(
      `No snapshot for release ${release}; run scripts/fetch-overture-places.py first (see its header)`,
      { cause: error },
    );
  }
  const retrievedAt = Date.parse(manifest.retrievedAt);
  if (manifest.release !== release || manifest.region !== region || !Number.isFinite(retrievedAt))
    throw new Error("The snapshot manifest does not match --release and --region");
  const stats = { skipped: 0 };
  const places: OverturePlace[] = [];
  for (const line of (await readFile(`${base}.jsonl`, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const place = parseOverturePlace(JSON.parse(line) as unknown, stats);
    if (place) places.push(place);
  }
  if (places.length + stats.skipped !== manifest.count)
    throw new Error(
      "The snapshot has a different number of rows than its manifest; fetch it again",
    );
  return { places, skipped: stats.skipped, retrievedAt };
}

type ExistingPage = {
  page: {
    _id: string;
    category?: string;
    onMap: boolean;
    names: string[];
    pin: { lat: number; lng: number } | null;
    refs: { provider: string; ref: string }[];
  }[];
  isDone: boolean;
  continueCursor: string;
};

async function readExistingFromDeployment(run: ConvexRunner, regionId: string) {
  const existing: ExistingPlace[] = [];
  let cursor: string | null = null;
  do {
    const result = (await run("overtureSeed:existingPlaces", {
      regionId,
      paginationOpts: { numItems: PAGE, cursor },
    })) as ExistingPage;
    for (const place of result.page) existing.push({ ...place, id: place._id });
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor !== null);
  return existing;
}

async function readKnownChainsFromDeployment(run: ConvexRunner, regionId: string) {
  const chains: Record<string, string>[] = [];
  let cursor: string | null = null;
  do {
    const result = (await run("overtureSeed:osmChainTags", {
      regionId,
      paginationOpts: { numItems: PAGE, cursor },
    })) as { page: Record<string, string>[]; isDone: boolean; continueCursor: string };
    chains.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor !== null);
  return chains;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

/** An even spread through the list, so the examples are not only the most confident places. */
function sample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]!);
}

function report(plan: Plan, place: (gers: string) => string | undefined) {
  return {
    totalInSnapshot: plan.total,
    inBbox: plan.inBbox,
    skippedBeforeDuplicateCheck: plan.skipped,
    keptAfterCategoryChainAndConfidence: plan.kept,
    keptByCategory: plan.categories,
    confidenceCurveAmongCategoryAndChainKept: plan.confidenceCurve,
    unbrandedChainBranchesFoundByName: plan.chainBranches,
    alreadyImported: plan.alreadyImported,
    duplicatesOfExistingPlaces: plan.duplicatesOfExisting.length,
    duplicatesFoundBy: countBy(plan.duplicatesOfExisting, (link) => link.by),
    duplicatesWithinOverture: plan.duplicatesWithinOverture.length,
    newPlaces: plan.add.length,
    newByCategory: countBy(plan.add, (item) => item.category),
    newByLicence: countBy(plan.add, (item) => `${item.dataset} ${item.licence}`),
    map: plan.map,
    twentyExampleNewNames: sample(plan.add, 20).map(
      (item) => `${place(item.gers)} [${item.category}, confidence ${item.confidence.toFixed(2)}]`,
    ),
  };
}

export async function runImport(
  argv: readonly string[],
  options: {
    cwd: string;
    run?: ConvexRunner;
    log: (value: unknown) => void;
  },
) {
  if (argv.includes("--help")) {
    options.log(
      [
        "Usage: npx tsx scripts/import-overture-places.ts --region nagasaki --release <release> --deployment <name> --steward <personId> [--dry-run]",
        "       npx tsx scripts/import-overture-places.ts --region nagasaki --release <release> --dry-run --existing-dir <export dir>",
        "Reads the snapshot written by scripts/fetch-overture-places.py (.scratch/overture/<release>/) and the places already in the deployment, drops categories that are errands and chains, drops places below the confidence floor, finds doubles of places Noren already has (same or similar name within 50 m, or the same website) and adds an Overture reference to them, and publishes the rest as public places that are not yet confirmed.",
        `Options: --min-confidence <0-1> (default ${DEFAULT_MIN_CONFIDENCE}), --bbox <west,south,east,north> (default: the region), --map-budget <n> (default ${DEFAULT_MAP_BUDGET}; the map reads ${MAP_PLACE_LIMIT}).`,
        "--deployment names the Convex deployment (for example careful-bee-139 for production); it is read with the internal overtureSeed:existingPlaces and written with overtureSeed:linkDuplicates and overtureSeed:publishPlaces, so deploy first. A dry run writes nothing; with --existing-dir it reads a local export (npx convex data place|placeName|pin|placeExternalRef --deployment <name> --limit 10000 --format jsonLines > <dir>/<table>.jsonl) instead of the deployment. The import refuses to run if the map would pass the budget; narrow it with --bbox.",
      ].join("\n"),
    );
    options.log(attribution);
    return;
  }
  const flags = parseFlags(argv);
  const region = getRegionConfig(flags.region)!;
  const snapshot = await readSnapshot(options.cwd, flags.region, flags.release);
  const run =
    options.run ??
    (flags.existingDir === undefined
      ? createCliRunner({ prod: false, deployment: flags.deployment, cwd: options.cwd })
      : undefined);
  const existing =
    flags.existingDir !== undefined
      ? await readExistingFromExport(resolve(options.cwd, flags.existingDir), flags.region)
      : await readExistingFromDeployment(run!, flags.region);
  const knownChains =
    flags.existingDir !== undefined
      ? await readKnownChainsFromExport(resolve(options.cwd, flags.existingDir))
      : await readKnownChainsFromDeployment(run!, flags.region);
  const plan = planImport(snapshot.places, existing, {
    knownChains,
    focusCategories: region.categories?.filter((item) => item.focus).map((item) => item.key) ?? [],
    locales: region.locales,
    bbox: flags.bbox,
    minConfidence: flags.minConfidence,
    mapBudget: flags.mapBudget,
  });
  const nameOf = new Map(snapshot.places.map((item) => [item.id, item.names.primary]));
  options.log({
    release: flags.release,
    bbox: flags.bbox,
    minConfidence: flags.minConfidence,
    existingPlaces: existing.length,
    osmChainListingsUsedForChainNames: knownChains.length,
    existingSource: flags.existingDir ?? `deployment ${flags.deployment}`,
    snapshotRowsSkippedAsMalformed: snapshot.skipped,
    ...report(plan, (gers) => nameOf.get(gers)),
  });
  if (flags.dryRun) {
    options.log("Dry run: nothing was written.");
    options.log(attribution);
    return;
  }
  if (!plan.map.withinBudget)
    throw new Error(
      `The map would hold ${plan.map.afterImport} places, over the budget of ${plan.map.budget} (the map reads ${MAP_PLACE_LIMIT}). Narrow the import with --bbox west,south,east,north and run the dry run again.`,
    );
  const args = {
    regionId: flags.region,
    stewardPersonId: flags.steward,
    release: flags.release,
    retrievedAt: snapshot.retrievedAt,
  };
  const totals = { linked: 0, published: 0, skipped: {} as Record<string, number> };
  const countSkips = (skipped: readonly { reason: string }[]) => {
    for (const { reason } of skipped) totals.skipped[reason] = (totals.skipped[reason] ?? 0) + 1;
  };
  // References first: a place that is already on the map is never made twice, even if a rerun stops here.
  const links: PlannedLink[] = plan.duplicatesOfExisting;
  for (let i = 0; i < links.length; i += LINK_BATCH) {
    const result = (await run!("overtureSeed:linkDuplicates", {
      ...args,
      links: links
        .slice(i, i + LINK_BATCH)
        .map(({ placeId, gers, lat, lng, dataset, licence }) => ({
          placeId,
          gers,
          lat,
          lng,
          dataset,
          licence,
        })),
    })) as { linked: number; skipped: { reason: string }[] };
    totals.linked += result.linked;
    countSkips(result.skipped);
  }
  const places: PlannedPlace[] = plan.add;
  for (let i = 0; i < places.length; i += PUBLISH_BATCH) {
    const result = (await run!("overtureSeed:publishPlaces", {
      ...args,
      places: places
        .slice(i, i + PUBLISH_BATCH)
        .map(({ gers, lat, lng, category, names, dataset, licence }) => ({
          gers,
          lat,
          lng,
          category,
          names,
          dataset,
          licence,
        })),
    })) as { published: unknown[]; skipped: { reason: string }[] };
    totals.published += result.published.length;
    countSkips(result.skipped);
  }
  options.log(totals);
  options.log(attribution);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runImport(process.argv.slice(2), { cwd: process.cwd(), log: console.log }).catch(
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? `Overture import failed: ${error.name}: ${error.message || "(no message)"}`
          : `Overture import failed: ${String(error)}`,
      );
      process.exitCode = 1;
    },
  );
