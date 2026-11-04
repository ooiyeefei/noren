import { afterEach, describe, expect, it, vi } from "vitest";
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
      "candidates/facebook-mockrun1.json",
    ]);
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
