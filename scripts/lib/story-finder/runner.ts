import {
  MENTION_PLATFORMS,
  type MentionCandidate,
  type MentionPlatform,
} from "../../../src/lib/story-finder/mention";
import type { ConvexRunner } from "../convex-run";
import { Budget, runCostUsd, type ApifyClient, type ApifyRun } from "./apify";
import { COLLECTORS, web, webCandidate, type WebHit } from "./collectors";
import type { FinderPlace, PlannedRun } from "./types";
import type { PageReader } from "./web-page";

export type CollectFlags = {
  steward: string;
  regionId: string;
  platforms: MentionPlatform[];
  limit: number;
  categories?: string[];
  bbox?: [number, number, number, number];
  budgetUsd: number;
  perPlace: number;
  batchSize: number;
  timeoutSecs: number;
  dryRun: boolean;
  /** This collect run's name (its scratch folder); the per-author limit counts within it. */
  collectionId: string;
  /**
   * Places searched by earlier runs, by slug, with the platforms each was searched on
   * (--skip-searched). A place is not searched again on those platforms, and --limit counts only
   * places with a requested platform still to search.
   */
  searched?: SearchedPlaces;
};

/** Slug to the platforms a place was searched on. */
export type SearchedPlaces = ReadonlyMap<string, ReadonlySet<MentionPlatform>>;

/** places.json in a collect run's folder: what that run searched, by place slug. */
export type PlacesFile = {
  version: 1;
  collectionId: string;
  places: Record<string, MentionPlatform[]>;
};

export type RunnerDeps = {
  convex: ConvexRunner;
  /** Unset in a dry run, which makes no call to Apify at all. */
  apify?: ApifyClient;
  readPage: PageReader;
  /** Writes a JSON file under the run's scratch folder and returns its path. */
  save: (name: string, data: unknown) => Promise<string>;
  log: (value: unknown) => void;
};

/** A saved run: enough to rebuild its candidates for any deployment without scraping again. */
export type SavedRun = {
  version: 1;
  savedAt: string;
  /** The collect run it came from. */
  collectionId: string;
  run: PlannedRun;
  apifyRun: Pick<ApifyRun, "id" | "status" | "usageTotalUsd" | "chargedEventCounts"> & {
    costUsd: number;
  };
  items: unknown[];
  /** For web runs: what each result page said, read once. */
  pages?: {
    /** Where the page was read, after any redirects. */
    url: string;
    /** The search result's address. */
    hitUrl?: string;
    query: string;
    title?: string;
    /** The part of the page around the place's name; the whole page is not kept. */
    text: string;
    /** True when the whole page carried an ad label (the page reader checks it before cutting). */
    adMarker?: boolean;
    author?: string;
    publishedAt?: number;
  }[];
};

type PlacePage = { page: FinderPlace[]; isDone: boolean; continueCursor: string };

/** The first `limit` places to search, passing over those `keep` turns down (they do not count). */
export async function loadPlaces(
  convex: ConvexRunner,
  options: {
    regionId: string;
    limit: number;
    categories?: string[];
    bbox?: number[];
    keep?: (place: FinderPlace) => boolean;
  },
): Promise<FinderPlace[]> {
  const places: FinderPlace[] = [];
  let cursor: string | null = null;
  do {
    const page = (await convex("storyFinder:placesToSearch", {
      regionId: options.regionId,
      paginationOpts: { numItems: 200, cursor },
      ...(options.categories?.length ? { categories: options.categories } : {}),
      ...(options.bbox ? { bbox: options.bbox } : {}),
    })) as PlacePage;
    places.push(...(options.keep ? page.page.filter(options.keep) : page.page));
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor !== null && places.length < options.limit);
  return places.slice(0, options.limit);
}

/** Whether a place still has one of the platforms to be searched on. */
function stillToSearch(
  place: FinderPlace,
  platforms: readonly MentionPlatform[],
  searched: SearchedPlaces | undefined,
) {
  const done = searched?.get(place.slug);
  return !done || platforms.some((platform) => !done.has(platform));
}

export function planRuns(
  places: readonly FinderPlace[],
  flags: Pick<CollectFlags, "platforms" | "perPlace" | "batchSize" | "searched">,
) {
  return flags.platforms.flatMap((platform) => {
    const toSearch = places.filter((place) => !flags.searched?.get(place.slug)?.has(platform));
    return toSearch.length
      ? COLLECTORS[platform].plan(toSearch, {
          perPlace: flags.perPlace,
          batchSize: flags.batchSize,
        })
      : [];
  });
}

function money(usd: number) {
  return Math.round(usd * 1000) / 1000;
}

export function summarisePlan(runs: readonly PlannedRun[]) {
  const byPlatform: Record<
    string,
    { runs: number; searches: number; estimatedUsd: number; capUsd: number }
  > = {};
  for (const run of runs) {
    const row = (byPlatform[run.platform] ??= { runs: 0, searches: 0, estimatedUsd: 0, capUsd: 0 });
    row.runs++;
    row.searches += run.queries.length;
    row.estimatedUsd = money(row.estimatedUsd + run.estimatedUsd);
    row.capUsd = money(row.capUsd + run.maxTotalChargeUsd);
  }
  return {
    byPlatform,
    estimatedUsd: money(runs.reduce((sum, run) => sum + run.estimatedUsd, 0)),
    worstCaseUsd: money(runs.reduce((sum, run) => sum + run.maxTotalChargeUsd, 0)),
  };
}

/**
 * The most bytes one storyFinder:ingest call's arguments may take as JSON. `npx convex run` gets
 * them as one command-line argument, and Linux refuses an argument over 128 KiB (MAX_ARG_STRLEN:
 * "spawn E2BIG"); a web page's text alone can be over 20 KB.
 */
export const INGEST_MAX_BYTES = 90_000;
/** And at most this many candidates per call (storyFinder.ingest takes up to 100). */
const INGEST_MAX_CANDIDATES = 50;

/**
 * Splits candidates into ingest calls whose arguments, as the JSON convex-run sends, stay within
 * `maxBytes`. A candidate too large to send even alone is left out and counted, not sent.
 */
export function ingestBatches(
  steward: string,
  candidates: readonly MentionCandidate[],
  maxBytes = INGEST_MAX_BYTES,
) {
  // JSON.stringify({ stewardPersonId, candidates: batch }) is this, plus each candidate's JSON,
  // plus a comma between candidates.
  const envelope = Buffer.byteLength(JSON.stringify({ stewardPersonId: steward, candidates: [] }));
  const batches: MentionCandidate[][] = [];
  let batch: MentionCandidate[] = [];
  let bytes = envelope;
  let tooLarge = 0;
  for (const candidate of candidates) {
    const size = Buffer.byteLength(JSON.stringify(candidate));
    if (envelope + size > maxBytes) {
      tooLarge++;
      continue;
    }
    if (batch.length && (bytes + 1 + size > maxBytes || batch.length >= INGEST_MAX_CANDIDATES)) {
      batches.push(batch);
      batch = [];
      bytes = envelope;
    }
    bytes += (batch.length ? 1 : 0) + size;
    batch.push(candidate);
  }
  if (batch.length) batches.push(batch);
  return { batches, tooLarge };
}

async function ingest(
  convex: ConvexRunner,
  steward: string,
  candidates: readonly MentionCandidate[],
) {
  const { batches, tooLarge } = ingestBatches(steward, candidates);
  const totals = { inserted: 0, duplicate: 0, alreadyLinked: 0, skipped: 0, tooLarge };
  for (const batch of batches) {
    const result = (await convex("storyFinder:ingest", {
      stewardPersonId: steward,
      candidates: batch,
    })) as { inserted: number; duplicate: number; alreadyLinked: number; skipped: unknown[] };
    totals.inserted += result.inserted;
    totals.duplicate += result.duplicate;
    totals.alreadyLinked += result.alreadyLinked;
    totals.skipped += result.skipped.length;
  }
  return totals;
}

/** Reads every web result page once (sequentially, politely) and keeps what it said. */
async function readPages(
  hits: readonly WebHit[],
  readPage: PageReader,
  log: (value: unknown) => void,
) {
  const pages: NonNullable<SavedRun["pages"]> = [];
  const refused: Record<string, number> = {};
  for (const hit of hits) {
    const page = await readPage(hit.url, hit.planned.names);
    if (!page.ok) {
      refused[page.reason] = (refused[page.reason] ?? 0) + 1;
      continue;
    }
    pages.push({
      url: page.url,
      hitUrl: hit.url,
      query: hit.planned.query,
      title: hit.title,
      text: page.text,
      ...(page.adMarker ? { adMarker: true } : {}),
      author: page.author,
      publishedAt: page.publishedAt,
    });
  }
  if (Object.keys(refused).length) log({ webPagesSkipped: refused });
  return pages;
}

/** The candidates a saved run yields; works the same on a fresh run and a replayed one. */
export function candidatesFrom(saved: SavedRun): MentionCandidate[] {
  const context = { runId: saved.apifyRun.id, collectionId: saved.collectionId };
  const collector = COLLECTORS[saved.run.platform];
  if (saved.run.platform !== "web") return collector.normalise(saved.items, saved.run, context);
  return (saved.pages ?? []).flatMap((page) => {
    const planned = saved.run.queries.find((q) => q.query === page.query);
    if (!planned) return [];
    const made = webCandidate(
      { url: page.hitUrl ?? page.url, title: page.title, planned },
      page,
      saved.run,
      context,
    );
    return made ? [made] : [];
  });
}

/**
 * Plans the runs, then (unless a dry run) starts them one at a time within the budget, saves each
 * run's raw results under .scratch, and sends the candidates to storyFinder:ingest.
 */
export async function collect(flags: CollectFlags, deps: RunnerDeps) {
  const searched = flags.searched;
  const places = await loadPlaces(deps.convex, {
    ...flags,
    ...(searched ? { keep: (place) => stillToSearch(place, flags.platforms, searched) } : {}),
  });
  const runs = planRuns(places, flags);
  const plan = summarisePlan(runs);
  deps.log({
    places: places.length,
    ...(searched ? { skippingSearchedPlaces: searched.size } : {}),
    plannedRuns: runs.length,
    ...plan,
    budgetUsd: flags.budgetUsd,
  });
  if (flags.dryRun) {
    for (const run of runs.slice(0, 3))
      deps.log({
        example: {
          actorId: run.actorId,
          input: run.input,
          maxTotalChargeUsd: run.maxTotalChargeUsd,
        },
      });
    return { ...plan, started: 0, spentUsd: 0, stoppedByBudget: false };
  }
  if (!deps.apify) throw new Error("APIFY_TOKEN is needed for a real run");
  const budget = new Budget(flags.budgetUsd);
  await deps.save("plan.json", { flags, ...plan, runs });
  const totals = {
    started: 0,
    candidates: 0,
    inserted: 0,
    duplicate: 0,
    alreadyLinked: 0,
    skipped: 0,
    tooLarge: 0,
  };
  // What this run has searched, saved after each actor run so --skip-searched can read it later.
  const searchedNow = new Map<string, Set<MentionPlatform>>();
  let stoppedByBudget = false;
  for (const run of runs) {
    if (!budget.allows(run)) {
      stoppedByBudget = true;
      deps.log({
        stopped: "budget",
        spentUsd: money(budget.spentUsd),
        nextRunCapUsd: run.maxTotalChargeUsd,
        budgetUsd: flags.budgetUsd,
        runsLeft: runs.length - totals.started,
      });
      break;
    }
    const started = await deps.apify.start(run, { timeoutSecs: flags.timeoutSecs });
    totals.started++;
    const finished = await deps.apify.wait(started.id);
    const costUsd = runCostUsd(finished);
    budget.record(costUsd);
    const items = await deps.apify.items(finished.defaultDatasetId);
    const saved: SavedRun = {
      version: 1,
      savedAt: new Date().toISOString(),
      collectionId: flags.collectionId,
      run,
      apifyRun: {
        id: finished.id,
        status: finished.status,
        usageTotalUsd: finished.usageTotalUsd,
        chargedEventCounts: finished.chargedEventCounts,
        costUsd,
      },
      items,
    };
    if (run.platform === "web")
      saved.pages = await readPages(web.hits(items, run, flags.perPlace), deps.readPage, deps.log);
    const file = await deps.save(`raw/${run.platform}-${finished.id}.json`, saved);
    // Recorded once the results are saved, before ingesting: a failed ingest can be replayed.
    for (const query of run.queries) addSearched(searchedNow, query.slug, run.platform);
    await deps.save("places.json", placesFile(flags.collectionId, searchedNow));
    const candidates = candidatesFrom(saved);
    await deps.save(`candidates/${run.platform}-${finished.id}.json`, candidates);
    const result = await ingest(deps.convex, flags.steward, candidates);
    totals.candidates += candidates.length;
    totals.inserted += result.inserted;
    totals.duplicate += result.duplicate;
    totals.alreadyLinked += result.alreadyLinked;
    totals.skipped += result.skipped;
    totals.tooLarge += result.tooLarge;
    deps.log({
      run: finished.id,
      platform: run.platform,
      status: finished.status,
      items: items.length,
      candidates: candidates.length,
      ...result,
      costUsd: money(costUsd),
      spentUsd: money(budget.spentUsd),
      saved: file,
    });
  }
  const summary = { ...plan, ...totals, spentUsd: money(budget.spentUsd), stoppedByBudget };
  deps.log({ done: summary });
  return summary;
}

function addSearched(
  searched: Map<string, Set<MentionPlatform>>,
  slug: string,
  platform: MentionPlatform,
) {
  let platforms = searched.get(slug);
  if (platforms === undefined) searched.set(slug, (platforms = new Set()));
  platforms.add(platform);
}

export function placesFile(
  collectionId: string,
  searched: ReadonlyMap<string, ReadonlySet<MentionPlatform>>,
): PlacesFile {
  return {
    version: 1,
    collectionId,
    places: Object.fromEntries([...searched].map(([slug, platforms]) => [slug, [...platforms]])),
  };
}

/**
 * Everything earlier runs searched: each run's places.json, or, for a run from before places.json
 * was written, the searches in its saved raw results (every saved run's queries were searched).
 */
export function searchedByRuns(
  runs: readonly { places?: PlacesFile; saved?: readonly SavedRun[] }[],
): Map<string, Set<MentionPlatform>> {
  const searched = new Map<string, Set<MentionPlatform>>();
  const add = (slug: string, platform: MentionPlatform) => {
    if (MENTION_PLATFORMS.includes(platform)) addSearched(searched, slug, platform);
  };
  for (const run of runs) {
    if (run.places)
      for (const [slug, platforms] of Object.entries(run.places.places))
        for (const platform of platforms) add(slug, platform);
    else
      for (const saved of run.saved ?? [])
        for (const query of saved.run.queries) add(query.slug, saved.run.platform);
  }
  return searched;
}

/**
 * Sends saved runs to a deployment again with no new scraping: each search is matched to that
 * deployment's place by slug, since place ids differ between deployments. With `platforms`, only
 * runs on those platforms are sent. Candidates go through the same cut and byte-sized batches as a
 * fresh collect.
 */
export async function replay(
  savedRuns: readonly SavedRun[],
  flags: { steward: string; regionId: string; platforms?: readonly MentionPlatform[] },
  deps: Pick<RunnerDeps, "convex" | "log">,
) {
  const chosen = savedRuns.filter(
    (saved) =>
      MENTION_PLATFORMS.includes(saved.run.platform) &&
      (!flags.platforms || flags.platforms.includes(saved.run.platform)),
  );
  const places = await loadPlaces(deps.convex, {
    regionId: flags.regionId,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const bySlug = new Map(places.map((place) => [place.slug, place.placeId]));
  const all: MentionCandidate[] = [];
  let unmatched = 0;
  for (const saved of chosen) {
    const queries = saved.run.queries.flatMap((q) => {
      const placeId = bySlug.get(q.slug);
      if (placeId === undefined) unmatched++;
      return placeId === undefined ? [] : [{ ...q, placeId }];
    });
    all.push(...candidatesFrom({ ...saved, run: { ...saved.run, queries } }));
  }
  const result = await ingest(deps.convex, flags.steward, all);
  const summary = {
    files: chosen.length,
    filesOtherPlatforms: savedRuns.length - chosen.length,
    candidates: all.length,
    unmatchedSearches: unmatched,
    ...result,
  };
  deps.log({ replayed: summary });
  return summary;
}
