import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEXT_MAX, type MentionCandidate } from "../../src/lib/story-finder/mention";
import { createCliRunner } from "../../scripts/lib/convex-run";
import {
  Budget,
  createApifyClient,
  runCostUsd,
  type ApifyClient,
  type ApifyRun,
} from "../../scripts/lib/story-finder/apify";
import {
  collect,
  INGEST_MAX_BYTES,
  ingestBatches,
  replay,
  summarisePlan,
  type CollectFlags,
  type SavedRun,
} from "../../scripts/lib/story-finder/runner";
import type { FinderPlace, PlannedRun } from "../../scripts/lib/story-finder/types";
import { parseFlags, runStoryFinder } from "../../scripts/story-finder";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const STEWARD = "kd7mockstewardmockstewardmock001";
// Fictional places only.
const places: FinderPlace[] = [1, 2, 3].map((n) => ({
  placeId: `mockplace${n}`,
  slug: `fictional-place-${n}`,
  category: "cafe",
  names: [{ lang: "ja", script: "kanji", value: `架空の店${n}`, isPrimary: true }],
  pin: null,
}));

function fakeConvex(list = places) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const convex = vi.fn(async (fn: string, args: unknown) => {
    calls.push({ fn, args: args as Record<string, unknown> });
    if (fn === "storyFinder:placesToSearch")
      return { page: list, isDone: true, continueCursor: "" };
    if (fn === "storyFinder:ingest") {
      const sent = (args as { candidates: unknown[] }).candidates;
      return { inserted: sent.length, duplicate: 0, alreadyLinked: 0, skipped: [] };
    }
    return { ok: true };
  });
  return { convex, calls };
}

function fakeApify(costUsd: number, items: (run: PlannedRun) => unknown[] = () => []) {
  const started: PlannedRun[] = [];
  const apify: ApifyClient = {
    start: vi.fn(async (run: PlannedRun) => {
      started.push(run);
      return {
        id: `mockrun${started.length}`,
        status: "RUNNING",
        defaultDatasetId: `ds${started.length}`,
      };
    }),
    wait: vi.fn(async (id: string) => ({
      id,
      status: "SUCCEEDED",
      defaultDatasetId: id.replace("mockrun", "ds"),
      usageTotalUsd: costUsd,
    })),
    items: vi.fn(async (datasetId: string) => items(started[Number(datasetId.slice(2)) - 1]!)),
  };
  return { apify, started };
}

const flags = (overrides: Partial<CollectFlags> = {}): CollectFlags => ({
  steward: STEWARD,
  regionId: "nagasaki",
  platforms: ["facebook"],
  limit: 20,
  budgetUsd: 20,
  perPlace: 5,
  batchSize: 20,
  timeoutSecs: 600,
  dryRun: false,
  collectionId: "mock-collection-1",
  ...overrides,
});

describe("Budget", () => {
  it("allows a run only when the spend so far plus the run's cap stays within the limit", () => {
    const budget = new Budget(1);
    expect(budget.allows({ maxTotalChargeUsd: 1 })).toBe(true);
    budget.record(0.6);
    expect(budget.allows({ maxTotalChargeUsd: 0.4 })).toBe(true);
    expect(budget.allows({ maxTotalChargeUsd: 0.41 })).toBe(false);
    budget.record(-5);
    expect(budget.spentUsd).toBe(0.6);
    expect(budget.remainingUsd).toBeCloseTo(0.4);
    expect(() => new Budget(0)).toThrow();
    expect(() => new Budget(Number.NaN)).toThrow();
  });

  it("a run's cost is usageTotalUsd, or its charged events when that is missing or lower", () => {
    const run: ApifyRun = { id: "r", status: "SUCCEEDED", defaultDatasetId: "d" };
    expect(runCostUsd({ ...run, usageTotalUsd: 0.25 })).toBe(0.25);
    expect(runCostUsd({ ...run, usageTotalUsd: null })).toBe(0);
    expect(
      runCostUsd({
        ...run,
        usageTotalUsd: 0.01,
        chargedEventCounts: { result: 10, "actor-start": 1 },
        pricingInfo: {
          pricingPerEvent: {
            actorChargeEvents: {
              result: { eventPriceUsd: 0.006 },
              "actor-start": { eventPriceUsd: 0.001 },
            },
          },
        },
      }),
    ).toBeCloseTo(0.061);
  });
});

describe("collect", () => {
  it("stops before a run that could take the spend past the budget", async () => {
    const { convex } = fakeConvex();
    const { apify, started } = fakeApify(0.03);
    const logs: unknown[] = [];
    // Facebook runs one place each, capped at 0.039; 0.03 + 0.03 + 0.039 > 0.08.
    const result = await collect(flags({ budgetUsd: 0.08 }), {
      convex,
      apify,
      readPage: vi.fn(),
      save: async (name) => name,
      log: (value) => logs.push(value),
    });
    expect(started).toHaveLength(2);
    expect(result).toMatchObject({ started: 2, stoppedByBudget: true, spentUsd: 0.06 });
    expect(logs).toContainEqual(expect.objectContaining({ stopped: "budget", runsLeft: 1 }));
  });

  it("searches once for branches that share a name", async () => {
    const twin = { ...places[0]!, placeId: "mockplace9", slug: "fictional-place-9" };
    const { convex } = fakeConvex([places[0]!, twin, places[1]!]);
    const { apify } = fakeApify(0);
    const logs: unknown[] = [];
    await collect(flags({ platforms: ["reddit"] }), {
      convex,
      apify,
      readPage: vi.fn(),
      save: async (name) => name,
      log: (value) => logs.push(value),
    });
    expect(logs).toContainEqual(expect.objectContaining({ places: 2 }));
  });

  it("a branch searched earlier still speaks for a later one of the same name", async () => {
    const twin = { ...places[0]!, placeId: "mockplace9", slug: "fictional-place-9" };
    const { convex } = fakeConvex([places[0]!, twin, places[1]!]);
    const { apify } = fakeApify(0);
    const logs: unknown[] = [];
    await collect(
      flags({
        platforms: ["reddit"],
        searched: new Map([[places[0]!.slug, new Set(["reddit" as const])]]),
      }),
      {
        convex,
        apify,
        readPage: vi.fn(),
        save: async (name) => name,
        log: (value) => logs.push(value),
      },
    );
    expect(logs).toContainEqual(expect.objectContaining({ places: 1 }));
  });

  it("a cap larger than the whole budget starts nothing", async () => {
    const { convex } = fakeConvex();
    const { apify, started } = fakeApify(0);
    const result = await collect(flags({ platforms: ["google_reviews"], budgetUsd: 0.4 }), {
      convex,
      apify,
      readPage: vi.fn(),
      save: async (name) => name,
      log: () => {},
    });
    expect(started).toHaveLength(0);
    expect(result).toMatchObject({ started: 0, stoppedByBudget: true });
  });

  it("saves each run's raw results and ingests its candidates in batches of 50", async () => {
    const { convex, calls } = fakeConvex(places.slice(0, 1));
    const { apify } = fakeApify(0.02, () =>
      Array.from({ length: 60 }, (_, i) => ({
        url: `https://www.facebook.com/mockpage/posts/${1000 + i}`,
        text: `架空の店1のテスト用の投稿 ${i}`,
      })),
    );
    const saved = new Map<string, unknown>();
    const result = await collect(flags({ budgetUsd: 1 }), {
      convex,
      apify,
      readPage: vi.fn(),
      save: async (name, data) => {
        saved.set(name, data);
        return name;
      },
      log: () => {},
    });
    expect([...saved.keys()]).toEqual([
      "plan.json",
      "raw/facebook-mockrun1.json",
      "places.json",
      "candidates/facebook-mockrun1.json",
    ]);
    expect(saved.get("places.json")).toMatchObject({
      places: { "fictional-place-1": ["facebook"] },
    });
    const raw = saved.get("raw/facebook-mockrun1.json") as SavedRun;
    expect(raw.items).toHaveLength(60);
    expect(raw.run.queries[0]!.slug).toBe("fictional-place-1");
    const ingests = calls.filter((call) => call.fn === "storyFinder:ingest");
    expect(ingests.map((call) => (call.args.candidates as unknown[]).length)).toEqual([50, 10]);
    expect(ingests[0]!.args.stewardPersonId).toBe(STEWARD);
    expect(result).toMatchObject({ candidates: 60, inserted: 60, spentUsd: 0.02 });
    expect(apify.start).toHaveBeenCalledWith(
      expect.objectContaining({ maxTotalChargeUsd: 0.039 }),
      {
        timeoutSecs: 600,
      },
    );
  });

  it("reads web results' pages once and keeps what they said", async () => {
    const { convex } = fakeConvex(places.slice(0, 1));
    const { apify } = fakeApify(0.01, () => [
      {
        searchQuery: { term: '"架空の店1" 長崎 ブログ' },
        organicResults: [
          { url: "https://blog.example.com/a", title: "A" },
          { url: "https://blog.example.com/b", title: "B" },
        ],
      },
    ]);
    // The first result redirected to the blog's new address; the page reader followed it.
    const readPage = vi.fn(async (url: string) =>
      url.endsWith("/a")
        ? {
            ok: true as const,
            url: "https://blog.example.com/2026/a",
            text: "架空の店1についてのテスト用の記事。",
            author: "Mock Blog",
          }
        : { ok: false as const, reason: "robots" as const },
    );
    const saved = new Map<string, unknown>();
    await collect(flags({ platforms: ["web"], budgetUsd: 1 }), {
      convex,
      apify,
      readPage,
      save: async (name, data) => {
        saved.set(name, data);
        return name;
      },
      log: () => {},
    });
    expect(readPage).toHaveBeenCalledTimes(2);
    const raw = saved.get("raw/web-mockrun1.json") as SavedRun;
    expect(raw.collectionId).toBe("mock-collection-1");
    expect(raw.pages).toEqual([
      expect.objectContaining({
        url: "https://blog.example.com/2026/a",
        hitUrl: "https://blog.example.com/a",
        author: "Mock Blog",
      }),
    ]);
    expect(saved.get("candidates/web-mockrun1.json")).toEqual([
      expect.objectContaining({
        platform: "web",
        url: "https://blog.example.com/2026/a",
        authorName: "Mock Blog",
        placeId: "mockplace1",
        collectionId: "mock-collection-1",
      }),
    ]);
  });

  it("replays saved results into another deployment by matching places by slug", async () => {
    const run: PlannedRun = {
      platform: "facebook",
      actorId: "apify/facebook-search-scraper",
      input: {},
      queries: [
        {
          placeId: "oldid",
          slug: "fictional-place-2",
          query: "架空の店2 長崎",
          searchedFor: "架空の店2",
          names: [],
          pin: null,
        },
      ],
      estimatedUsd: 0.03,
      maxTotalChargeUsd: 0.039,
      maxItems: 5,
    };
    const saved: SavedRun = {
      version: 1,
      savedAt: "2026-11-04T00:00:00.000Z",
      collectionId: "mock-collection-9",
      run,
      apifyRun: { id: "mockrun9", status: "SUCCEEDED", costUsd: 0.03 },
      items: [{ url: "https://www.facebook.com/mockpage/posts/9", text: "架空の店2のテスト投稿" }],
    };
    const { convex, calls } = fakeConvex();
    const result = await replay(
      [saved],
      { steward: STEWARD, regionId: "nagasaki" },
      { convex, log: () => {} },
    );
    expect(result).toMatchObject({ candidates: 1, inserted: 1, unmatchedSearches: 0 });
    const sent = calls.find((call) => call.fn === "storyFinder:ingest")!.args.candidates as {
      placeId: string;
      collectionId: string;
    }[];
    expect(sent[0]!.placeId).toBe("mockplace2");
    expect(sent[0]).toMatchObject({ collectionId: "mock-collection-9", runId: "mockrun9" });
  });
});

/** The bytes of one storyFinder:ingest call's arguments, as convex-run sends them. */
const argBytes = (args: Record<string, unknown>) => Buffer.byteLength(JSON.stringify(args));
const ingestCalls = (calls: { fn: string; args: Record<string, unknown> }[]) =>
  calls.filter((call) => call.fn === "storyFinder:ingest");
/** A made-up page about fictional place 1, longer than TEXT_MAX, naming it after 9000 characters. */
const longPage = (i: number) =>
  `${"架空のブログの前置きです。".repeat(700)}架空の店1についてのテスト用の記事${i}。${"二階から港が見えます。".repeat(200)}`;

function webRun(slugs: string[]): PlannedRun {
  return {
    platform: "web",
    actorId: "apify/google-search-scraper",
    input: {},
    queries: slugs.map((slug, i) => ({
      placeId: `oldid${i}`,
      slug,
      query: `"架空の店${i + 1}" 長崎 ブログ`,
      searchedFor: `架空の店${i + 1}`,
      names: [`架空の店${i + 1}`],
      pin: null,
    })),
    estimatedUsd: 0.01,
    maxTotalChargeUsd: 0.5,
    maxItems: 5,
  };
}

describe("ingest batches (spawn E2BIG)", () => {
  const candidate = (text: string, title?: string): MentionCandidate => ({
    placeId: "mockplace1",
    platform: "web",
    url: "https://blog.example.com/a",
    canonicalUrl: "https://blog.example.com/a",
    text,
    ...(title ? { title } : {}),
    searchedFor: "架空の店1",
    query: "架空の店1 長崎",
    actorId: "mock/actor",
    runId: "mockrun1",
    collectionId: "mock-collection-1",
  });

  it("keeps every call's arguments under the byte limit, and refuses one too large alone", () => {
    const pages = Array.from({ length: 30 }, (_, i) =>
      candidate(`${"架".repeat(TEXT_MAX - 3)}${i}`),
    );
    const huge = candidate("架空の店1", "題".repeat(40_000));
    const { batches, tooLarge } = ingestBatches(STEWARD, [
      ...pages.slice(0, 15),
      huge,
      ...pages.slice(15),
    ]);
    expect(tooLarge).toBe(1);
    expect(batches.flat()).toEqual(pages);
    for (const batch of batches)
      expect(argBytes({ stewardPersonId: STEWARD, candidates: batch })).toBeLessThanOrEqual(
        INGEST_MAX_BYTES,
      );
    // About 24 KB each: three to a call, not fifty.
    expect(batches.map((batch) => batch.length)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    // Small candidates still go fifty at a time.
    expect(
      ingestBatches(
        STEWARD,
        Array.from({ length: 60 }, () => candidate("架空の店1")),
      ).batches.map((batch) => batch.length),
    ).toEqual([50, 10]);
  });

  it("collect cuts long web pages around the place and sends them in byte-sized calls", async () => {
    const { convex, calls } = fakeConvex(places.slice(0, 1));
    const { apify } = fakeApify(0.01, () => [
      {
        searchQuery: { term: '"架空の店1" 長崎 ブログ' },
        organicResults: [
          ...Array.from({ length: 12 }, (_, i) => ({
            url: `https://blog${i}.example.com/a`,
            title: "Mock",
          })),
          // A search result whose title alone is past the limit.
          { url: "https://blog-huge.example.com/a", title: "題".repeat(40_000) },
        ],
      },
    ]);
    const readPage = vi.fn(async (url: string) => ({
      ok: true as const,
      url,
      text: longPage(Number(new URL(url).hostname.replace(/\D/g, "") || 99)),
    }));
    const result = await collect(flags({ platforms: ["web"], perPlace: 20, budgetUsd: 1 }), {
      convex,
      apify,
      readPage,
      save: async (name) => name,
      log: () => {},
    });
    const ingests = ingestCalls(calls);
    expect(ingests.length).toBeGreaterThan(1);
    for (const call of ingests) {
      expect(argBytes(call.args)).toBeLessThanOrEqual(INGEST_MAX_BYTES);
      for (const sent of call.args.candidates as MentionCandidate[]) {
        expect(sent.text.length).toBeLessThanOrEqual(TEXT_MAX);
        expect(sent.text).toContain("架空の店1についてのテスト用の記事");
      }
    }
    expect(ingests.flatMap((call) => call.args.candidates as unknown[])).toHaveLength(12);
    expect(result).toMatchObject({ candidates: 13, inserted: 12, tooLarge: 1 });
  });

  it("replay --sources web sends only web runs, through the same cut and batches", async () => {
    const web: SavedRun = {
      version: 1,
      savedAt: "2026-11-04T00:00:00.000Z",
      collectionId: "mock-collection-9",
      run: webRun(["fictional-place-1"]),
      apifyRun: { id: "mockweb", status: "SUCCEEDED", costUsd: 0.01 },
      items: [],
      pages: Array.from({ length: 8 }, (_, i) => ({
        url: `https://blog${i}.example.com/a`,
        query: '"架空の店1" 長崎 ブログ',
        title: "Mock",
        text: longPage(i),
      })),
    };
    const facebook: SavedRun = {
      ...web,
      run: {
        ...web.run,
        platform: "facebook",
        queries: [{ ...web.run.queries[0]!, query: "架空の店1 長崎" }],
      },
      apifyRun: { id: "mockfb", status: "SUCCEEDED", costUsd: 0.03 },
      items: [{ url: "https://www.facebook.com/mockpage/posts/9", text: "架空の店1のテスト投稿" }],
      pages: undefined,
    };
    const { convex, calls } = fakeConvex();
    const result = await replay(
      [facebook, web],
      { steward: STEWARD, regionId: "nagasaki", platforms: ["web"] },
      { convex, log: () => {} },
    );
    expect(result).toMatchObject({ files: 1, filesOtherPlatforms: 1, candidates: 8, inserted: 8 });
    const sent = ingestCalls(calls).flatMap((call) => {
      expect(argBytes(call.args)).toBeLessThanOrEqual(INGEST_MAX_BYTES);
      return call.args.candidates as MentionCandidate[];
    });
    expect(sent.every((c) => c.platform === "web" && c.text.length <= TEXT_MAX)).toBe(true);
    expect(sent[0]!.placeId).toBe("mockplace1");
  });
});

describe("replay sets the ad flag from the whole saved post", () => {
  const DISCLOSURE = "※この記事はプロモーションを含みます";
  const filler = "架空の旅行記の前置きです。".repeat(900);
  const savedFacebook = (items: unknown[]): SavedRun => ({
    version: 1,
    savedAt: "2026-11-04T00:00:00.000Z",
    collectionId: "mock-collection-9",
    run: {
      platform: "facebook",
      actorId: "apify/facebook-search-scraper",
      input: {},
      queries: [
        {
          placeId: "oldid",
          slug: "fictional-place-2",
          query: "架空の店2 長崎",
          searchedFor: "架空の店2",
          names: ["架空の店2"],
          pin: null,
        },
      ],
      estimatedUsd: 0.03,
      maxTotalChargeUsd: 0.039,
      maxItems: 5,
    },
    apifyRun: { id: "mockrun9", status: "SUCCEEDED", costUsd: 0.03 },
    items,
  });
  const sentCandidates = async (saved: SavedRun) => {
    const { convex, calls } = fakeConvex();
    await replay([saved], { steward: STEWARD, regionId: "nagasaki" }, { convex, log: () => {} });
    return ingestCalls(calls).flatMap((call) => call.args.candidates as MentionCandidate[]);
  };

  it("flags a post whose disclosure the stored window leaves out, and leaves a plain post alone", async () => {
    const sent = await sentCandidates(
      savedFacebook([
        {
          url: "https://www.facebook.com/mockpage/posts/1",
          text: `架空の店2のテスト投稿。${filler}${DISCLOSURE}`,
        },
        {
          url: "https://www.facebook.com/mockpage/posts/2",
          text: `架空の店2のテスト投稿。${filler}`,
        },
      ]),
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]!.text.length).toBeLessThanOrEqual(TEXT_MAX);
    expect(sent[0]!.text).not.toContain(DISCLOSURE);
    expect(sent[0]!.adMarker).toBe(true);
    expect(sent[1]).not.toHaveProperty("adMarker");
  });

  it("carries the flag a web page was saved with, as its text is only the window", async () => {
    const web: SavedRun = {
      ...savedFacebook([]),
      run: { ...webRun(["fictional-place-1"]) },
      pages: [
        {
          url: "https://blog.example.com/a",
          query: '"架空の店1" 長崎 ブログ',
          title: "Mock",
          text: "架空の店1に行きました。",
          adMarker: true,
        },
        {
          url: "https://blog.example.com/b",
          query: '"架空の店1" 長崎 ブログ',
          title: "Mock",
          text: "架空の店1に行きました。",
        },
      ],
    };
    const sent = await sentCandidates(web);
    expect(sent.map((c) => c.adMarker)).toEqual([true, undefined]);
  });
});

describe("replay --sources google_reviews repairs the rows already ingested", () => {
  const query = (n: number) => `架空の店${n} 長崎`;
  const review = (tag: string) => ({
    name: "Mock",
    text: `架空の店2のテスト用の口コミ ${tag}`,
    reviewUrl: `https://www.google.com/maps/reviews/data=${tag}`,
  });
  const saved: SavedRun = {
    version: 1,
    savedAt: "2026-11-04T00:00:00.000Z",
    collectionId: "mock-collection-9",
    run: {
      platform: "google_reviews",
      actorId: "compass/crawler-google-places",
      input: {},
      queries: [2, 3].map((n) => ({
        placeId: "oldid",
        slug: `fictional-place-${n}`,
        query: query(n),
        searchedFor: `架空の店${n}`,
        names: [`架空の店${n}`],
        pin: null,
      })),
      estimatedUsd: 0.03,
      maxTotalChargeUsd: 0.5,
      maxItems: 2,
    },
    apifyRun: { id: "mockgoogle", status: "SUCCEEDED", costUsd: 0.03 },
    items: [
      { searchString: query(2), title: "架空の店2 本店", reviews: [review("kept")] },
      {
        searchString: query(3),
        title: "架空の店3",
        permanentlyClosed: true,
        reviews: [review("closed1"), review("closed2")],
      },
      { searchString: query(2), title: "別の店", reviews: [review("wrong")] },
    ],
  };

  function repairing(result: Record<string, unknown>) {
    const base = fakeConvex();
    const convex = vi.fn(async (fn: string, args: unknown) =>
      fn === "storyFinder:repairListings"
        ? (base.calls.push({ fn, args: args as Record<string, unknown> }), result)
        : base.convex(fn, args),
    );
    return { convex, calls: base.calls };
  }

  it("sends the listing's name for kept reviews and a rejection for the others, and prints the closed places", async () => {
    const { convex, calls } = repairing({
      retitled: 1,
      rejected: 3,
      missing: 0,
      notChanged: [
        { canonicalUrl: "https://www.google.com/maps/reviews/data=closed2", status: "attached" },
      ],
    });
    const logs: unknown[] = [];
    const result = await replay(
      [saved],
      { steward: STEWARD, regionId: "nagasaki", platforms: ["google_reviews"] },
      { convex, log: (value) => logs.push(value) },
    );
    // Only the kept review is ingested; the other three never are.
    const sent = ingestCalls(calls).flatMap((call) => call.args.candidates as MentionCandidate[]);
    expect(sent.map((c) => [c.placeId, c.title])).toEqual([["mockplace2", "架空の店2 本店"]]);
    const fixes = calls.filter((call) => call.fn === "storyFinder:repairListings");
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.args).toMatchObject({ stewardPersonId: STEWARD });
    expect(fixes[0]!.args.fixes).toEqual([
      {
        placeId: "mockplace2",
        canonicalUrl: sent[0]!.canonicalUrl,
        title: "架空の店2 本店",
      },
      {
        placeId: "mockplace3",
        canonicalUrl: expect.stringContaining("closed1"),
        reject: "closed_listing",
      },
      {
        placeId: "mockplace3",
        canonicalUrl: expect.stringContaining("closed2"),
        reject: "closed_listing",
      },
      {
        placeId: "mockplace2",
        canonicalUrl: expect.stringContaining("wrong"),
        reject: "wrong_listing",
      },
    ]);
    expect(result).toMatchObject({
      wrongListing: 1,
      closedListing: 2,
      repaired: { retitled: 1, rejected: 3, notChanged: [{ status: "attached" }] },
    });
    // The places to review are printed last.
    expect(logs.at(-1)).toEqual({
      googleListingsLeftOut: expect.objectContaining({
        closedPlaces: [{ place: "架空の店3", slug: "fictional-place-3", listing: "架空の店3" }],
      }),
    });
  });

  it("makes no repair call when no Google run is replayed", async () => {
    const { convex, calls } = repairing({});
    await replay(
      [saved],
      { steward: STEWARD, regionId: "nagasaki", platforms: ["web"] },
      { convex, log: () => {} },
    );
    expect(calls.some((call) => call.fn === "storyFinder:repairListings")).toBe(false);
  });
});

describe("hide", () => {
  it("needs a file of ids", () => {
    expect(() => parseFlags(["hide", "--steward", STEWARD])).toThrow(/--ids/);
  });

  it("sends the file's ids in batches, leaving out comments and blank lines", async () => {
    const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
    mkdirSync(scratch, { recursive: true });
    const cwd = mkdtempSync(join(scratch, "hide-test-"));
    try {
      const ids = Array.from({ length: 51 }, (_, i) => `mockcandidate${i}`);
      writeFileSync(
        join(cwd, "ids.txt"),
        `# thin\n\n${ids.map((id) => `${id}  # a reason`).join("\n")}\n`,
      );
      const calls: { fn: string; args: { candidateIds: string[] } }[] = [];
      const convex = vi.fn(async (fn: string, args: unknown) => {
        const sent = args as { candidateIds: string[] };
        calls.push({ fn, args: sent });
        return { hidden: sent.candidateIds.length };
      });
      const logs: unknown[] = [];
      await runStoryFinder(["hide", "--steward", STEWARD, "--ids", "ids.txt"], {
        cwd,
        env: {},
        now: () => 0,
        loadEnvFile: vi.fn(),
        convex,
        log: (value) => logs.push(value),
      });
      expect(calls.map((call) => [call.fn, call.args.candidateIds.length])).toEqual([
        ["storyFinder:hideMany", 50],
        ["storyFinder:hideMany", 1],
      ]);
      expect(calls.flatMap((call) => call.args.candidateIds)).toEqual(ids);
      expect(logs).toContainEqual({ hidden: 51 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("check --requeue", () => {
  it("is parsed for the check command only", () => {
    expect(parseFlags(["check", "--steward", STEWARD, "--requeue"])).toMatchObject({
      command: "check",
      requeue: true,
    });
    expect(parseFlags(["check", "--steward", STEWARD]).requeue).toBe(false);
    expect(() => parseFlags(["attach", "--steward", STEWARD, "--requeue"])).toThrow(
      /check command/,
    );
  });

  it("pages through accepted then rejected posts and starts no check", async () => {
    const pages = [
      { requeued: 40, isDone: false, continueCursor: "c1" },
      { requeued: 57, isDone: true, continueCursor: "c2" },
      { requeued: 30, isDone: true, continueCursor: "c3" },
    ];
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const convex = vi.fn(async (fn: string, args: unknown) => {
      calls.push({ fn, args: args as Record<string, unknown> });
      return pages.shift();
    });
    const logs: unknown[] = [];
    const result = await runStoryFinder(["check", "--steward", STEWARD, "--requeue"], {
      cwd: process.cwd(),
      env: {},
      now: () => 0,
      loadEnvFile: vi.fn(),
      convex,
      log: (value) => logs.push(value),
    });
    expect(
      calls.map((call) => [
        call.fn,
        call.args.status,
        (call.args.paginationOpts as { cursor: unknown }).cursor,
      ]),
    ).toEqual([
      ["storyFinder:requeue", "accepted", null],
      ["storyFinder:requeue", "accepted", "c1"],
      ["storyFinder:requeue", "rejected", null],
    ]);
    expect(result).toEqual({ accepted: 97, rejected: 30 });
    expect(calls.some((call) => call.fn === "storyFinder:startCheck")).toBe(false);
    expect(logs).toContainEqual(
      expect.objectContaining({ requeued: { accepted: 97, rejected: 30, total: 127 } }),
    );
  });
});

describe("--skip-searched", () => {
  const five: FinderPlace[] = [1, 2, 3, 4, 5].map((n) => ({
    ...places[0]!,
    placeId: `mockplace${n}`,
    slug: `fictional-place-${n}`,
    names: [{ lang: "ja", script: "kanji", value: `架空の店${n}`, isPrimary: true }],
  }));

  it("leaves out each place on the platforms it was searched on, and --limit counts new places", async () => {
    const { convex } = fakeConvex(five);
    const { apify, started } = fakeApify(0.01);
    const saved = new Map<string, unknown>();
    await collect(
      flags({
        platforms: ["facebook", "web"],
        limit: 2,
        budgetUsd: 5,
        searched: new Map([
          // Searched on both: not a new place.
          ["fictional-place-1", new Set(["facebook", "web"] as const)],
          // Searched on Facebook only: still new, for the web.
          ["fictional-place-2", new Set(["facebook"] as const)],
        ]),
      }),
      {
        convex,
        apify,
        readPage: vi.fn(),
        save: async (name, data) => {
          saved.set(name, data);
          return name;
        },
        log: () => {},
      },
    );
    const searchedOn = (platform: string) =>
      started
        .filter((run) => run.platform === platform)
        .flatMap((run) => run.queries.map((q) => q.slug));
    expect(searchedOn("facebook")).toEqual(["fictional-place-3"]);
    expect(searchedOn("web")).toEqual(["fictional-place-2", "fictional-place-3"]);
    // What this run searched, for the next --skip-searched.
    expect(saved.get("places.json")).toEqual({
      version: 1,
      collectionId: "mock-collection-1",
      places: { "fictional-place-3": ["facebook", "web"], "fictional-place-2": ["web"] },
    });
  });

  describe("reading earlier runs", () => {
    let cwd: string;
    afterEach(() => rmSync(cwd, { recursive: true, force: true }));

    it("reads places.json, or an older run's raw results, and plans only places not searched", async () => {
      const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
      mkdirSync(scratch, { recursive: true });
      cwd = mkdtempSync(join(scratch, "skip-searched-test-"));
      const runs = join(cwd, ".scratch/story-finder");
      // A run that wrote places.json.
      mkdirSync(join(runs, "2026-11-05T00-00-00-000Z"), { recursive: true });
      writeFileSync(
        join(runs, "2026-11-05T00-00-00-000Z/places.json"),
        JSON.stringify({ version: 1, collectionId: "x", places: { "fictional-place-1": ["web"] } }),
      );
      // An older run with raw results only, whose ingest failed: its web search still ran.
      mkdirSync(join(runs, "2026-11-04T02-08-39-447Z/raw"), { recursive: true });
      writeFileSync(
        join(runs, "2026-11-04T02-08-39-447Z/raw/web-mockweb.json"),
        JSON.stringify({
          version: 1,
          savedAt: "2026-11-04T02:30:00.000Z",
          collectionId: "2026-11-04T02-08-39-447Z",
          run: webRun(["fictional-place-2", "fictional-place-3"]),
          apifyRun: { id: "mockweb", status: "SUCCEEDED", costUsd: 0.01 },
          items: [],
          pages: [],
        } satisfies SavedRun),
      );
      writeFileSync(join(runs, ".collect.lock"), "");
      const { convex } = fakeConvex(five);
      const logs: unknown[] = [];
      const result = await runStoryFinder(
        [
          "collect",
          "--steward",
          STEWARD,
          "--sources",
          "web",
          "--limit",
          "2",
          "--skip-searched",
          "--dry-run",
        ],
        {
          cwd,
          env: {},
          now: () => 0,
          loadEnvFile: vi.fn(),
          convex,
          log: (value) => logs.push(value),
        },
      );
      expect(logs).toContainEqual({
        skipSearched: { runs: 2, readFromRawResults: ["2026-11-04T02-08-39-447Z"], places: 3 },
      });
      expect(logs).toContainEqual(expect.objectContaining({ places: 2 }));
      expect(result).toMatchObject({ byPlatform: { web: { searches: 2 } } });
    });
  });
});

describe("story-finder CLI", () => {
  it("parses flags and refuses bad ones", () => {
    expect(
      parseFlags([
        "collect",
        "--steward",
        STEWARD,
        "--sources",
        "instagram,web",
        "--limit",
        "5",
        "--bbox",
        "129.8,32.7,129.9,32.8",
        "--budget-usd",
        "2.5",
        "--deployment",
        "mock-deployment-123",
      ]),
    ).toMatchObject({
      command: "collect",
      platforms: ["instagram", "web"],
      limit: 5,
      bbox: [129.8, 32.7, 129.9, 32.8],
      budgetUsd: 2.5,
      deployment: "mock-deployment-123",
      dryRun: false,
    });
    for (const argv of [
      ["collect"],
      ["collect", "--steward", "x"],
      ["collect", "--steward", STEWARD, "--sources", "myspace"],
      ["collect", "--steward", STEWARD, "--budget-usd", "0"],
      ["collect", "--steward", STEWARD, "--bbox", "1,2,3"],
      ["collect", "--steward", STEWARD, "--prod", "--deployment", "mock-1"],
      ["replay", "--steward", STEWARD],
      ["scrape", "--steward", STEWARD],
    ])
      expect(() => parseFlags(argv), argv.join(" ")).toThrow();
    expect(
      parseFlags(["replay", "--steward", STEWARD, "--from", "x", "--sources", "web"]),
    ).toMatchObject({ command: "replay", platforms: ["web"], from: "x" });
    expect(parseFlags(["collect", "--steward", STEWARD, "--skip-searched"])).toMatchObject({
      skipSearched: true,
    });
  });

  it("--places searches only the named places, and --limit defaults to all of them", async () => {
    const scratch = join(fileURLToPath(new URL("../..", import.meta.url)), ".scratch");
    mkdirSync(scratch, { recursive: true });
    const cwd = mkdtempSync(join(scratch, "places-test-"));
    try {
      writeFileSync(join(cwd, "places.txt"), `# chosen by hand\n${places[1]!.slug}  # second\n`);
      const logs: unknown[] = [];
      const { convex } = fakeConvex();
      const result = await runStoryFinder(
        [
          "collect",
          "--steward",
          STEWARD,
          "--sources",
          "web",
          "--places",
          "places.txt",
          "--dry-run",
        ],
        {
          cwd,
          env: {},
          now: () => 0,
          loadEnvFile: vi.fn(),
          convex,
          log: (value) => logs.push(value),
        },
      );
      expect(logs).toContainEqual(expect.objectContaining({ places: 1 }));
      expect(result).toMatchObject({ byPlatform: { web: { searches: 1 } } });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("a dry run plans and prices with no call to Apify and no token", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const { convex, calls } = fakeConvex();
    const logs: unknown[] = [];
    const result = await runStoryFinder(["collect", "--steward", STEWARD, "--dry-run"], {
      cwd: "/nonexistent-noren-test",
      env: {},
      now: () => 0,
      loadEnvFile: vi.fn(),
      convex,
      log: (value) => logs.push(value),
    });
    expect(network).not.toHaveBeenCalled();
    expect(calls.map((call) => call.fn)).toEqual(["storyFinder:placesToSearch"]);
    expect(result).toMatchObject({ started: 0, spentUsd: 0 });
    expect((result as { estimatedUsd: number }).estimatedUsd).toBeGreaterThan(0);
  });

  it("a real collection needs APIFY_TOKEN", async () => {
    const { convex } = fakeConvex();
    await expect(
      runStoryFinder(["collect", "--steward", STEWARD], {
        cwd: "/nonexistent-noren-test",
        env: {},
        now: () => 0,
        loadEnvFile: vi.fn(),
        convex,
        log: () => {},
      }),
    ).rejects.toThrow("APIFY_TOKEN");
  });

  it("check and attach call the internal functions with the steward", async () => {
    const { convex, calls } = fakeConvex();
    const options = {
      cwd: "/nonexistent-noren-test",
      env: {},
      now: () => 0,
      loadEnvFile: vi.fn(),
      convex,
      log: () => {},
    };
    await runStoryFinder(["check", "--steward", STEWARD, "--limit", "40", "--no-attach"], options);
    await runStoryFinder(["attach", "--steward", STEWARD], options);
    expect(calls).toEqual([
      {
        fn: "storyFinder:startCheck",
        args: { stewardPersonId: STEWARD, limit: 40, attach: false },
      },
      { fn: "storyFinder:attachAcceptedBatch", args: { stewardPersonId: STEWARD, limit: 100 } },
    ]);
  });

  it("passes --deployment to convex run", async () => {
    const argv: string[][] = [];
    const run = createCliRunner({
      prod: false,
      deployment: "mock-deployment-123",
      cwd: "/",
      exec: (_file, args, _options, callback) => {
        argv.push(args);
        callback(null, "null", "");
      },
    });
    await run("storyFinder:attachAcceptedBatch", {});
    expect(argv[0]).toEqual([
      "convex",
      "run",
      "storyFinder:attachAcceptedBatch",
      "{}",
      "--deployment",
      "mock-deployment-123",
    ]);
    expect(() => createCliRunner({ prod: true, deployment: "x", cwd: "/" })).toThrow();
    expect(() => createCliRunner({ prod: false, deployment: "--prod", cwd: "/" })).toThrow();
  });

  it("summarises a plan by platform", () => {
    const summary = summarisePlan([
      { platform: "web", estimatedUsd: 0.1, maxTotalChargeUsd: 0.5, queries: [{}, {}] },
      { platform: "web", estimatedUsd: 0.2, maxTotalChargeUsd: 0.5, queries: [{}] },
    ] as unknown as PlannedRun[]);
    expect(summary).toEqual({
      byPlatform: { web: { runs: 2, searches: 3, estimatedUsd: 0.3, capUsd: 1 } },
      estimatedUsd: 0.3,
      worstCaseUsd: 1,
    });
  });
});

describe("Apify client", () => {
  it("sends the token in a header, the caps in the query, and waits for the run to finish", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    let polls = 0;
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/runs"))
        return Response.json({ data: { id: "mockrun", status: "READY", defaultDatasetId: "ds" } });
      if (path.startsWith("/v2/actor-runs/"))
        return Response.json({
          data: {
            id: "mockrun",
            status: ++polls < 2 ? "RUNNING" : "SUCCEEDED",
            defaultDatasetId: "ds",
            usageTotalUsd: 0.1,
          },
        });
      return Response.json([{ n: 1 }]);
    });
    const client = createApifyClient({
      token: "mock-token",
      fetch: fetch as typeof globalThis.fetch,
      sleep: async () => {},
    });
    const run = {
      platform: "tiktok",
      actorId: "clockworks/free-tiktok-scraper",
      input: { searchQueries: ["架空"] },
      queries: [],
      estimatedUsd: 0.01,
      maxTotalChargeUsd: 0.02,
      maxItems: 5,
    } as PlannedRun;
    await client.start(run, { timeoutSecs: 600 });
    expect((await client.wait("mockrun")).status).toBe("SUCCEEDED");
    expect(await client.items("ds")).toEqual([{ n: 1 }]);
    const start = new URL(requests[0]!.url);
    expect(start.pathname).toBe("/v2/acts/clockworks~free-tiktok-scraper/runs");
    expect(start.searchParams.get("maxTotalChargeUsd")).toBe("0.02");
    expect(start.searchParams.get("timeout")).toBe("600");
    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual(run.input);
    for (const request of requests) {
      expect(request.url).not.toContain("mock-token");
      expect(new Headers(request.init?.headers).get("authorization")).toBe("Bearer mock-token");
    }
    expect(polls).toBe(2);
  });

  it("retries rate limits and reports other errors without the token", async () => {
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 429 });
      return Response.json(
        { error: { type: "invalid-input", message: "bad mock-token input" } },
        { status: 400 },
      );
    });
    const client = createApifyClient({
      token: "mock-token",
      fetch: fetch as typeof globalThis.fetch,
      sleep: async () => {},
    });
    const error = await client.wait("x").catch((caught: Error) => caught);
    expect(calls).toBe(2);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("HTTP 400 invalid-input");
    expect((error as Error).message).not.toContain("mock-token");
  });
});
