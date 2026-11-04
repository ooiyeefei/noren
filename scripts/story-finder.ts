import { existsSync } from "node:fs";
import { mkdir, open, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getRegionConfig } from "../src/lib/region/registry";
import { MENTION_PLATFORMS, type MentionPlatform } from "../src/lib/story-finder/mention";
import { createCliRunner, type ConvexRunner } from "./lib/convex-run";
import { createApifyClient, type ApifyClient } from "./lib/story-finder/apify";
import {
  collect,
  replay,
  searchedByRuns,
  type CollectFlags,
  type PlacesFile,
  type SavedRun,
} from "./lib/story-finder/runner";
import { createPageReader, type PageReader } from "./lib/story-finder/web-page";

const USAGE = `Usage: npx tsx scripts/story-finder.ts <command> [flags]

Commands
  collect   Search public posts about places on the map and stage them for checking.
  replay    Send saved results (.scratch/story-finder/<stamp>) to a deployment again, no new scraping.
  check     Check staged posts with the AI model (AI_MODEL_CHECK_MENTION on the deployment).
  attach    Link posts that passed the check but were not linked yet.
  hide      Never link these posts, and take down any already linked.

Common flags
  --steward <personId>     The steward running it (required). Demo accounts are refused.
  --deployment <name>      Convex deployment, e.g. joyful-capybara-123. Or --prod.
  --env-file <path>        Load variables (APIFY_TOKEN) from this file. Default: .env.local if present.

collect
  --region nagasaki        Region id.
  --sources a,b            Any of ${MENTION_PLATFORMS.join(", ")} (default: all).
  --limit 20               Places to search for (with --skip-searched: places not searched yet).
  --category a,b           Only these categories (places-to-visit categories only).
  --bbox w,s,e,n           Only places inside this box.
  --places <file>          Only these places: a text file of slugs, one per line; a # starts a
                           comment. --limit defaults to all of them.
  --per-place 5            Posts or reviews asked for per place.
  --batch-size 20          Places per actor run, where the actor allows several.
  --budget-usd 20          Stop before any run that could take the spend past this.
  --timeout-secs 900       Longest a single actor run may take.
  --dry-run                Print the planned runs and their cost; makes no call to Apify.
  --skip-searched          Leave out each place on the platforms an earlier collect searched it on
                           (every .scratch/story-finder/<stamp>/places.json, or for an older run,
                           the searches in its raw results).

replay
  --from <folder>          A .scratch/story-finder/<stamp> folder from an earlier collect.
  --sources a,b            Only the saved runs on these platforms (default: all).

check
  --limit 500              Most staged posts to check in this request.
  --no-attach              Only check; link later with the attach command.
  --requeue                Instead of checking: set back to pending every accepted post, and every
                           post rejected as place_not_named whose check did not say it is about
                           another place, so the next check reads them again. Linked and hidden
                           posts are never touched. Run check again afterwards.
  --requeue-ratings        The same, and also every post rejected as only a rating, for when the
                           check's idea of a story has changed.

attach
  --limit 100              Most checked posts to link in one call.

hide
  --ids <file>             A text file of candidate ids, one per line; a # starts a comment.`;

export type Command = "collect" | "replay" | "check" | "attach" | "hide";

export type Flags = {
  command: Command;
  steward: string;
  region: string;
  platforms: MentionPlatform[];
  limit?: number;
  categories?: string[];
  bbox?: [number, number, number, number];
  perPlace: number;
  batchSize: number;
  budgetUsd: number;
  timeoutSecs: number;
  dryRun: boolean;
  skipSearched: boolean;
  attach: boolean;
  requeue: boolean;
  requeueRatings?: boolean;
  from?: string;
  ids?: string;
  places?: string;
  prod: boolean;
  deployment?: string;
  envFile?: string;
};

/** A text file of one value per line, where a # starts a comment. */
async function readListFile(path: string): Promise<string[]> {
  return (await readFile(path, "utf8"))
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function positive(flag: string, value: string, { integer = true } = {}): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number)))
    throw new Error(`${flag} must be a positive ${integer ? "whole number" : "number"}`);
  return number;
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseFlags(argv: readonly string[]): Flags {
  const [command, ...rest] = argv;
  if (
    command !== "collect" &&
    command !== "replay" &&
    command !== "check" &&
    command !== "attach" &&
    command !== "hide"
  )
    throw new Error(`Unknown command ${JSON.stringify(command ?? "")}; run with --help`);
  const flags: Flags = {
    command,
    steward: "",
    region: "nagasaki",
    platforms: [...MENTION_PLATFORMS],
    perPlace: 5,
    batchSize: 20,
    budgetUsd: 20,
    timeoutSecs: 900,
    dryRun: false,
    skipSearched: false,
    attach: true,
    requeue: false,
    prod: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    if (flag === "--dry-run") flags.dryRun = true;
    else if (flag === "--skip-searched") flags.skipSearched = true;
    else if (flag === "--prod") flags.prod = true;
    else if (flag === "--no-attach") flags.attach = false;
    else if (flag === "--requeue") flags.requeue = true;
    else if (flag === "--requeue-ratings") {
      flags.requeue = true;
      flags.requeueRatings = true;
    } else {
      const value = rest[++i];
      if (value === undefined || value.startsWith("--"))
        throw new Error(`Missing value for ${flag}`);
      switch (flag) {
        case "--steward":
          flags.steward = value;
          break;
        case "--region":
          flags.region = value;
          break;
        case "--sources": {
          const platforms = list(value);
          const unknown = platforms.filter(
            (p) => !(MENTION_PLATFORMS as readonly string[]).includes(p),
          );
          if (unknown.length || !platforms.length)
            throw new Error(
              `--sources takes ${MENTION_PLATFORMS.join(", ")}; got ${unknown.join(", ") || "nothing"}`,
            );
          flags.platforms = [...new Set(platforms)] as MentionPlatform[];
          break;
        }
        case "--limit":
          flags.limit = positive(flag, value);
          break;
        case "--category":
          flags.categories = list(value);
          break;
        case "--bbox": {
          const numbers = list(value).map(Number);
          const [west, south, east, north] = numbers as [number, number, number, number];
          if (
            numbers.length !== 4 ||
            numbers.some((n) => !Number.isFinite(n)) ||
            west >= east ||
            south >= north
          )
            throw new Error("--bbox is west,south,east,north in degrees");
          flags.bbox = [west, south, east, north];
          break;
        }
        case "--per-place":
          flags.perPlace = positive(flag, value);
          break;
        case "--batch-size":
          flags.batchSize = positive(flag, value);
          break;
        case "--budget-usd":
          flags.budgetUsd = positive(flag, value, { integer: false });
          break;
        case "--timeout-secs":
          flags.timeoutSecs = positive(flag, value);
          break;
        case "--ids":
          flags.ids = value;
          break;
        case "--places":
          flags.places = value;
          break;
        case "--from":
          flags.from = value;
          break;
        case "--deployment":
          flags.deployment = value;
          break;
        case "--env-file":
          flags.envFile = value;
          break;
        default:
          throw new Error(`Unknown flag ${flag}`);
      }
    }
  }
  if (!/^[a-z0-9]{20,40}$/.test(flags.steward))
    throw new Error("--steward must be the steward's person id");
  if (!getRegionConfig(flags.region)) throw new Error("--region must name a configured region");
  if (flags.prod && flags.deployment)
    throw new Error("Use either --prod or --deployment, not both");
  if (flags.command === "replay" && !flags.from) throw new Error("replay needs --from <folder>");
  if (flags.command === "hide" && !flags.ids) throw new Error("hide needs --ids <file>");
  if (flags.requeue && flags.command !== "check")
    throw new Error("--requeue belongs to the check command");
  if (flags.perPlace > 50) throw new Error("--per-place is at most 50");
  if (flags.batchSize > 100) throw new Error("--batch-size is at most 100");
  return flags;
}

async function readSavedRuns(folder: string): Promise<SavedRun[]> {
  const raw = resolve(folder, "raw");
  const dir = existsSync(raw) ? raw : folder;
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  const runs: SavedRun[] = [];
  for (const name of names) {
    const saved = JSON.parse(await readFile(resolve(dir, name), "utf8")) as SavedRun;
    if (saved?.version === 1 && saved.run && Array.isArray(saved.items))
      runs.push({ ...saved, collectionId: saved.collectionId || basename(folder) });
  }
  return runs;
}

async function readSaved(folder: string): Promise<SavedRun[]> {
  const runs = await readSavedRuns(folder);
  if (!runs.length) throw new Error(`No saved runs in ${folder}`);
  return runs;
}

/**
 * What every earlier collect under `root` searched: its places.json, or, for a run from before
 * places.json was written, the searches in its saved raw results.
 */
async function readSearched(root: string, log: (value: unknown) => void) {
  const runs: { places?: PlacesFile; saved?: SavedRun[] }[] = [];
  const fromRaw: string[] = [];
  const entries = existsSync(root) ? await readdir(root, { withFileTypes: true }) : [];
  for (const entry of entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const folder = resolve(root, entry.name);
    const placesPath = resolve(folder, "places.json");
    if (existsSync(placesPath)) {
      const places = JSON.parse(await readFile(placesPath, "utf8")) as PlacesFile;
      if (places?.version === 1 && places.places) {
        runs.push({ places });
        continue;
      }
    }
    if (!existsSync(resolve(folder, "raw"))) continue;
    runs.push({ saved: await readSavedRuns(folder) });
    fromRaw.push(entry.name);
  }
  const searched = searchedByRuns(runs);
  log({ skipSearched: { runs: runs.length, readFromRawResults: fromRaw, places: searched.size } });
  return searched;
}

export async function runStoryFinder(
  argv: readonly string[],
  options: {
    cwd: string;
    env: Record<string, string | undefined>;
    log: (value: unknown) => void;
    now: () => number;
    loadEnvFile?: (path: string) => void;
    convex?: ConvexRunner;
    apify?: ApifyClient;
    readPage?: PageReader;
  },
) {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
    options.log(USAGE);
    return;
  }
  const flags = parseFlags(argv);
  const envFile =
    flags.envFile ?? (existsSync(resolve(options.cwd, ".env.local")) ? ".env.local" : undefined);
  if (envFile) (options.loadEnvFile ?? process.loadEnvFile)(resolve(options.cwd, envFile));
  const convex =
    options.convex ??
    createCliRunner({ prod: flags.prod, deployment: flags.deployment, cwd: options.cwd });
  const target = flags.prod ? "production" : (flags.deployment ?? "the default dev deployment");

  if (flags.command === "check" && flags.requeue) {
    options.log({ target });
    const requeued = { accepted: 0, rejected: 0 };
    for (const status of ["accepted", "rejected"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const page = (await convex("storyFinder:requeue", {
          stewardPersonId: flags.steward,
          status,
          paginationOpts: { numItems: 100, cursor },
          ...(flags.requeueRatings ? { ratings: true } : {}),
        })) as { requeued: number; isDone: boolean; continueCursor: string };
        requeued[status] += page.requeued;
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }
    options.log({
      requeued: { ...requeued, total: requeued.accepted + requeued.rejected },
      next: "run check again to read them",
    });
    return requeued;
  }
  if (flags.command === "check") {
    options.log({ target });
    options.log(
      await convex("storyFinder:startCheck", {
        stewardPersonId: flags.steward,
        limit: flags.limit ?? 500,
        attach: flags.attach,
      }),
    );
    return;
  }
  if (flags.command === "hide") {
    options.log({ target });
    const ids = await readListFile(resolve(options.cwd, flags.ids!));
    let hidden = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const done = (await convex("storyFinder:hideMany", {
        stewardPersonId: flags.steward,
        candidateIds: ids.slice(i, i + 50),
      })) as { hidden: number };
      hidden += done.hidden;
    }
    options.log({ hidden });
    return;
  }
  if (flags.command === "attach") {
    options.log({ target });
    options.log(
      await convex("storyFinder:attachAcceptedBatch", {
        stewardPersonId: flags.steward,
        limit: flags.limit ?? 100,
      }),
    );
    return;
  }
  if (flags.command === "replay") {
    options.log({ target });
    return await replay(
      await readSaved(resolve(options.cwd, flags.from!)),
      { steward: flags.steward, regionId: flags.region, platforms: flags.platforms },
      {
        convex,
        log: options.log,
      },
    );
  }

  const stamp = new Date(options.now()).toISOString().replace(/[:.]/g, "-");
  const folder = resolve(options.cwd, ".scratch/story-finder", stamp);
  const save = async (name: string, data: unknown) => {
    const path = resolve(folder, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.partial`, JSON.stringify(data, null, 1));
    await rename(`${path}.partial`, path);
    return path;
  };
  const slugs = flags.places
    ? new Set(await readListFile(resolve(options.cwd, flags.places)))
    : undefined;
  const collectFlags: CollectFlags = {
    steward: flags.steward,
    regionId: flags.region,
    platforms: flags.platforms,
    limit: flags.limit ?? slugs?.size ?? 20,
    ...(slugs ? { slugs } : {}),
    categories: flags.categories,
    bbox: flags.bbox,
    budgetUsd: flags.budgetUsd,
    perPlace: flags.perPlace,
    batchSize: flags.batchSize,
    timeoutSecs: flags.timeoutSecs,
    dryRun: flags.dryRun,
    collectionId: stamp,
    ...(flags.skipSearched
      ? { searched: await readSearched(resolve(options.cwd, ".scratch/story-finder"), options.log) }
      : {}),
  };
  options.log({ target, dryRun: flags.dryRun });
  if (flags.dryRun)
    return await collect(collectFlags, {
      convex,
      readPage: async () => ({ ok: false, reason: "network" }),
      save,
      log: options.log,
    });

  const token = options.env.APIFY_TOKEN?.trim();
  if (!options.apify && !token) throw new Error("APIFY_TOKEN is not set (use --env-file)");
  if (token && /\s/.test(token)) throw new Error("APIFY_TOKEN contains whitespace; set it again");
  // The budget is kept in this process, so two collections at once could spend it twice.
  const lockDir = resolve(options.cwd, ".scratch/story-finder");
  await mkdir(lockDir, { recursive: true });
  const lockPath = resolve(lockDir, ".collect.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    throw new Error(
      "Another collection holds .scratch/story-finder/.collect.lock; if it crashed, check it has stopped before removing the lock",
    );
  }
  try {
    return await collect(collectFlags, {
      convex,
      apify: options.apify ?? createApifyClient({ token: token! }),
      readPage: options.readPage ?? createPageReader(),
      save,
      log: options.log,
    });
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runStoryFinder(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    now: Date.now,
    log: (value) => console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2)),
  }).catch((error: unknown) => {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${name}: ${message || "(no message)"}`);
    process.exitCode = 1;
  });
