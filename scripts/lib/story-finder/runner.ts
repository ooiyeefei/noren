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
    text: string;
    author?: string;
    publishedAt?: number;
  }[];
};

type PlacePage = { page: FinderPlace[]; isDone: boolean; continueCursor: string };

export async function loadPlaces(
  convex: ConvexRunner,
  options: { regionId: string; limit: number; categories?: string[]; bbox?: number[] },
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
    places.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor !== null && places.length < options.limit);
  return places.slice(0, options.limit);
}

export function planRuns(
  places: readonly FinderPlace[],
  flags: Pick<CollectFlags, "platforms" | "perPlace" | "batchSize">,
) {
  return flags.platforms.flatMap((platform) =>
    COLLECTORS[platform].plan(places, { perPlace: flags.perPlace, batchSize: flags.batchSize }),
  );
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

async function ingest(
  convex: ConvexRunner,
  steward: string,
  candidates: readonly MentionCandidate[],
) {
  const totals = { inserted: 0, duplicate: 0, alreadyLinked: 0, skipped: 0 };
  for (let i = 0; i < candidates.length; i += 50) {
    const result = (await convex("storyFinder:ingest", {
      stewardPersonId: steward,
      candidates: candidates.slice(i, i + 50),
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
  const places = await loadPlaces(deps.convex, flags);
  const runs = planRuns(places, flags);
  const plan = summarisePlan(runs);
  deps.log({
    places: places.length,
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
  };
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
    const candidates = candidatesFrom(saved);
    await deps.save(`candidates/${run.platform}-${finished.id}.json`, candidates);
    const result = await ingest(deps.convex, flags.steward, candidates);
    totals.candidates += candidates.length;
    totals.inserted += result.inserted;
    totals.duplicate += result.duplicate;
    totals.alreadyLinked += result.alreadyLinked;
    totals.skipped += result.skipped;
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

/**
 * Sends saved runs to a deployment again with no new scraping: each search is matched to that
 * deployment's place by slug, since place ids differ between deployments.
 */
export async function replay(
  savedRuns: readonly SavedRun[],
  flags: { steward: string; regionId: string },
  deps: Pick<RunnerDeps, "convex" | "log">,
) {
  const places = await loadPlaces(deps.convex, {
    regionId: flags.regionId,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const bySlug = new Map(places.map((place) => [place.slug, place.placeId]));
  const all: MentionCandidate[] = [];
  let unmatched = 0;
  for (const saved of savedRuns) {
    if (!MENTION_PLATFORMS.includes(saved.run.platform)) continue;
    const queries = saved.run.queries.flatMap((q) => {
      const placeId = bySlug.get(q.slug);
      if (placeId === undefined) unmatched++;
      return placeId === undefined ? [] : [{ ...q, placeId }];
    });
    all.push(...candidatesFrom({ ...saved, run: { ...saved.run, queries } }));
  }
  const result = await ingest(deps.convex, flags.steward, all);
  const summary = {
    files: savedRuns.length,
    candidates: all.length,
    unmatchedSearches: unmatched,
    ...result,
  };
  deps.log({ replayed: summary });
  return summary;
}
