/// <reference types="vite/client" />
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as languageModels from "../src/lib/ai/claim-extractor";
import { addPerson, addPlace, addSource, errorCode, newBackend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

// Every post here is made up. The words outside the quote carry a marker that must never reach a
// public query: the full text is for the check only.
const MARKER = "FULLTEXT-ONLY-MARKER";
const QUOTE = "テスト店は店主の祖父が始めた焙煎所で、今も手回しの焙煎機を使っています。";
const TEXT = `${MARKER} テスト用の架空の投稿です。${QUOTE} ${MARKER}`;
const EN_QUOTE = "Test Shop is a made-up place whose owner roasts beans by hand every morning.";

const posts = {
  instagram: {
    platform: "instagram" as const,
    url: "https://www.instagram.com/p/MOCKPOST1/?utm_source=ig",
  },
  google: {
    platform: "google_reviews" as const,
    url: "https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1sMOCKREVIEW1",
  },
  reddit: {
    platform: "reddit" as const,
    url: "https://www.reddit.com/r/mocktravel/comments/mock01/test_shop/",
  },
};

const variables = [
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "META_API_KEY",
  "AI_MODEL_CHECK_MENTION",
  "AI_MODEL_TRANSLATE",
];
const noNetwork = vi.fn(() => {
  throw new Error("network calls are forbidden in story finder tests");
});
beforeEach(() => {
  // Scheduled functions stay queued (seen in _scheduled_functions) rather than running.
  vi.useFakeTimers();
  for (const variable of variables) vi.stubEnv(variable, undefined);
  noNetwork.mockClear();
  vi.stubGlobal("fetch", noNetwork);
});
afterEach(() => {
  vi.useRealTimers();
  expect(noNetwork).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function world() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const mockSteward = await addPerson(b, "mocksteward", "steward", { isMock: true });
  await addPerson(b, "user", "user");
  const placeId = await addPlace(b, {
    createdBy: steward,
    visibility: "public",
    category: "cafe",
    slug: "test-shop",
  });
  const mockPlaceId = await addPlace(b, {
    createdBy: mockSteward,
    visibility: "demo_public",
    category: "cafe",
    slug: "mock-shop",
  });
  const candidate = (
    post: { platform: "instagram" | "google_reviews" | "reddit"; url: string },
    overrides: Record<string, unknown> = {},
  ) => ({
    placeId,
    platform: post.platform,
    url: post.url,
    authorHandle: post.platform === "reddit" ? "u/mock_user" : "mock_author",
    authorUrl: "https://example.com/mock-author",
    postedAt: Date.UTC(2026, 9, 1),
    text: TEXT,
    searchedFor: "テスト店",
    query: "テスト店 長崎",
    actorId: "mock/actor",
    runId: "mockrun1",
    ...overrides,
  });
  const ingest = (candidates: ReturnType<typeof candidate>[], by: Id<"person"> = steward) =>
    b.t.mutation(internal.storyFinder.ingest, { stewardPersonId: by, candidates });
  const rows = () => b.t.run((ctx) => ctx.db.query("mentionCandidate").take(100));
  const place = () => b.t.run((ctx) => ctx.db.get("place", placeId));
  const audits = () => b.t.run((ctx) => ctx.db.query("auditLog").take(200));
  const record = (
    candidateId: Id<"mentionCandidate">,
    reported: Record<string, unknown>,
    attach = true,
  ) =>
    b.t.mutation(internal.storyFinder.recordCheck, {
      candidateId,
      stewardPersonId: steward,
      attach,
      modelSetting: "mock/checker",
      latencyMs: 1234,
      result: {
        ok: true,
        reported: {
          aboutThisPlace: "yes",
          evidence: "テスト店",
          kind: "story",
          namesPrivatePeople: false,
          quote: QUOTE,
          topics: ["history"],
          ...reported,
        } as never,
      },
    });
  return {
    b,
    steward,
    mockSteward,
    placeId,
    mockPlaceId,
    candidate,
    ingest,
    rows,
    place,
    audits,
    record,
  };
}

describe("placesToSearch", () => {
  it("lists real public places in places-to-visit categories, never mock places", async () => {
    const w = await world();
    await addPlace(w.b, { createdBy: w.steward, visibility: "draft", category: "cafe" });
    await addPlace(w.b, { createdBy: w.steward, visibility: "public", category: "other" });
    await addPlace(w.b, {
      createdBy: w.steward,
      visibility: "public",
      category: "bar",
      withNames: false,
    });
    const page = await w.b.t.query(internal.storyFinder.placesToSearch, {
      regionId: "nagasaki",
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(page.page.map((p) => p.slug)).toEqual(["test-shop"]);
    expect(page.page[0]).toMatchObject({
      placeId: w.placeId,
      category: "cafe",
      names: expect.arrayContaining([expect.objectContaining({ value: "テスト店" })]),
      pin: expect.objectContaining({ lat: expect.any(Number) }),
    });
    const outside = await w.b.t.query(internal.storyFinder.placesToSearch, {
      regionId: "nagasaki",
      paginationOpts: { numItems: 50, cursor: null },
      bbox: [0, 0, 1, 1],
    });
    expect(outside.page).toEqual([]);
    const bars = await w.b.t.query(internal.storyFinder.placesToSearch, {
      regionId: "nagasaki",
      paginationOpts: { numItems: 50, cursor: null },
      categories: ["bar", "other"],
    });
    expect(bars.page).toEqual([]);
  });
});

describe("ingest", () => {
  it("stores new posts as pending, once per place and address, and skips posts already linked", async () => {
    const w = await world();
    await addSource(w.b, {
      placeId: w.placeId,
      addedBy: w.steward,
      adapter: "link_card",
      url: "https://blog.example.com/already",
    });
    const first = await w.ingest([
      w.candidate(posts.instagram),
      w.candidate(posts.reddit),
      w.candidate({ platform: "reddit", url: "https://blog.example.com/already?utm_source=x" }),
    ]);
    expect(first).toEqual({ inserted: 2, duplicate: 0, alreadyLinked: 1, skipped: [] });
    // The same post found again (tracking parameters differ) is a duplicate.
    const again = await w.ingest([
      w.candidate({ ...posts.instagram, url: "https://instagram.com/p/MOCKPOST1/" }),
    ]);
    expect(again).toMatchObject({ inserted: 0, duplicate: 1 });
    const rows = await w.rows();
    expect(rows.map((row) => row.status)).toEqual(["pending", "pending"]);
    expect(rows[0]).toMatchObject({
      canonicalUrl: "https://www.instagram.com/p/MOCKPOST1",
      collectedBy: w.steward,
      langGuess: "ja",
    });
    expect((await w.audits()).filter((a) => a.action === "story_finder.collected")).toHaveLength(1);
  });

  it("skips mock places and refuses a demo steward", async () => {
    const w = await world();
    const result = await w.ingest([w.candidate(posts.instagram, { placeId: w.mockPlaceId })]);
    expect(result).toEqual({
      inserted: 0,
      duplicate: 0,
      alreadyLinked: 0,
      skipped: [{ index: 0, reason: "place_not_public" }],
    });
    expect(await errorCode(w.ingest([w.candidate(posts.instagram)], w.mockSteward))).toBe(
      "invalid_input",
    );
    expect(await w.rows()).toHaveLength(0);
  });
});

describe("claimForCheck", () => {
  it("holds claimed posts for a while, and rejects a post whose check keeps failing", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.instagram)]);
    const now = Date.UTC(2026, 10, 4);
    const claim = (at: number) =>
      w.b.t.mutation(internal.storyFinder.claimForCheck, { limit: 5, now: at });
    const [taken] = await claim(now);
    expect(taken).toMatchObject({ platform: "instagram", text: TEXT, category: "cafe" });
    expect(taken!.placeNames).toEqual(expect.arrayContaining([{ lang: "ja", value: "テスト店" }]));
    expect(await claim(now + 60_000)).toEqual([]);
    expect(await claim(now + 13 * 60_000)).toHaveLength(1);
    expect(await claim(now + 26 * 60_000)).toHaveLength(1);
    // The third attempt's lease ran out too: the next claim gives up on it.
    expect(await claim(now + 39 * 60_000)).toEqual([]);
    expect((await w.rows())[0]).toMatchObject({ status: "rejected", reason: "check_failed" });
  });
});

describe("recordCheck", () => {
  it("rejects a quote the post does not contain, and audits the check as the model's", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.instagram)]);
    const [row] = await w.rows();
    const result = await w.record(row!._id, { quote: "テスト店は長崎でいちばん古い焙煎所です。" });
    expect(result).toEqual({ status: "rejected" });
    expect((await w.rows())[0]).toMatchObject({
      status: "rejected",
      reason: "unverifiable",
      modelSetting: "mock/checker",
      latencyMs: 1234,
    });
    expect(await w.b.t.run((ctx) => ctx.db.query("source").take(10))).toHaveLength(0);
    expect((await w.audits()).find((a) => a.action === "mention.check")).toMatchObject({
      actorKind: "ai",
      modelVersion: "mock/checker",
      diff: { status: "rejected", reason: "unverifiable", kind: "story" },
    });
  });

  it("an accepted Instagram post is linked through the official embed, with no quote stored", async () => {
    const w = await world();
    expect((await w.place())!.hasPeopleStories).not.toBe(true);
    await w.ingest([w.candidate(posts.instagram)]);
    const [row] = await w.rows();
    const result = await w.record(row!._id, {});
    expect(result).toMatchObject({ status: "attached", sourceId: expect.any(String) });
    expect(result.excerptPlaceId).toBeUndefined();
    const source = await w.b.t.run((ctx) => ctx.db.get("source", result.sourceId!));
    expect(source).toMatchObject({
      adapter: "meta_embed",
      platform: "instagram",
      canonicalUrl: "https://www.instagram.com/p/MOCKPOST1",
      authorHandle: "mock_author",
      addedBy: w.steward,
      status: "live",
      origin: "story_finder",
      sharedAt: expect.any(Number),
      isMock: false,
    });
    expect(source!.excerpt).toBeUndefined();
    expect((await w.place())!.hasPeopleStories).toBe(true);
    expect((await w.rows())[0]).toMatchObject({ status: "attached", sourceId: result.sourceId });
    expect((await w.audits()).map((a) => a.action)).toEqual(
      expect.arrayContaining(["mention.check", "source.found_attached"]),
    );
  });

  it("an accepted Google review is a Maps link card with its quote", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.google)]);
    const [row] = await w.rows();
    const result = await w.record(row!._id, {});
    expect(result).toMatchObject({ status: "attached", excerptPlaceId: w.placeId });
    expect(await w.b.t.run((ctx) => ctx.db.get("source", result.sourceId!))).toMatchObject({
      adapter: "google_maps_link",
      excerpt: QUOTE,
      excerptLang: "ja",
      origin: "story_finder",
    });
  });

  it("an accepted Reddit post is a link card credited to Reddit, with its quote", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.reddit, { text: `${MARKER} ${EN_QUOTE}` })]);
    const [row] = await w.rows();
    const result = await w.record(row!._id, { evidence: "Test Shop", quote: EN_QUOTE });
    expect(await w.b.t.run((ctx) => ctx.db.get("source", result.sourceId!))).toMatchObject({
      adapter: "link_card",
      platform: "reddit",
      url: posts.reddit.url,
      authorHandle: "u/mock_user",
      excerpt: EN_QUOTE,
      excerptLang: "en",
    });
  });

  it("with attach off, an accepted post waits until the steward links it", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.reddit, { text: `${MARKER} ${EN_QUOTE}` })]);
    const [row] = await w.rows();
    expect(await w.record(row!._id, { evidence: "Test Shop", quote: EN_QUOTE }, false)).toEqual({
      status: "accepted",
    });
    expect(await w.b.t.run((ctx) => ctx.db.query("source").take(10))).toHaveLength(0);
    expect(
      await w.b.t.mutation(internal.storyFinder.attachAcceptedBatch, {
        stewardPersonId: w.steward,
        limit: 10,
      }),
    ).toEqual({ attached: 1, considered: 1 });
    expect((await w.rows())[0]!.status).toBe("attached");
  });

  it("a failed check is kept pending, then rejected once it has failed three times", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.instagram)]);
    const [row] = await w.rows();
    const fail = () =>
      w.b.t.mutation(internal.storyFinder.recordCheck, {
        candidateId: row!._id,
        stewardPersonId: w.steward,
        attach: true,
        modelSetting: "mock/checker",
        latencyMs: 1,
        result: { ok: false, error: "AI_APICallError HTTP 500" },
      });
    expect(await fail()).toEqual({ status: "pending" });
    await w.b.t.run((ctx) => ctx.db.patch("mentionCandidate", row!._id, { checkAttempts: 3 }));
    expect(await fail()).toEqual({ status: "rejected" });
    expect((await w.rows())[0]).toMatchObject({
      reason: "check_failed",
      lastCheckError: "AI_APICallError HTTP 500",
    });
  });
});

describe("what the public sees", () => {
  it("public queries show the found post and its quote, never the full text", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.instagram), w.candidate(posts.google)]);
    for (const row of await w.rows()) await w.record(row._id, {});
    const anonymous = [
      await w.b.t.query(api.sources.listForPlace, { placeId: w.placeId }),
      await w.b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug: "test-shop" }),
      await w.b.t.query(api.places.listForMap, { regionId: "nagasaki" }),
      await w.b.t.query(api.stories.latest, { regionId: "nagasaki" }),
    ];
    for (const result of anonymous) expect(JSON.stringify(result)).not.toContain(MARKER);
    const sources = anonymous[0] as Awaited<
      ReturnType<typeof w.b.t.query<typeof api.sources.listForPlace>>
    >;
    expect(sources).toHaveLength(2);
    const google = sources.find((s) => s.adapter === "google_maps_link")!;
    expect(google).toMatchObject({
      foundInPublicPost: true,
      excerpt: QUOTE,
      excerptLang: "ja",
      excerptTranslations: [],
    });
    expect(google.sharedBy).toBeUndefined();
    const latest = anonymous[3] as {
      kind: string;
      found?: boolean;
      text?: string;
      sharedBy: string;
    }[];
    expect(latest.filter((entry) => entry.found)).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: QUOTE, sharedBy: "mock_author" })]),
    );
    // Nor does anyone who is not a steward reach the staging table.
    expect(await errorCode(w.b.as("user").query(api.storyFinder.stewardOverview, {}))).toBe(
      "forbidden",
    );
    expect(await errorCode(w.b.t.query(api.storyFinder.stewardOverview, {}))).toBe(
      "unauthenticated",
    );
  });

  it("a machine translation of the quote is shown only while it matches the quote", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.google)]);
    const [row] = await w.rows();
    const { sourceId } = await w.record(row!._id, {});
    expect(
      await w.b.t.query(internal.storyFinder.untranslatedExcerpts, {
        placeId: w.placeId,
        limit: 10,
      }),
    ).toEqual([{ sourceId, text: QUOTE, from: "ja", to: "en" }]);
    await w.b.t.mutation(internal.storyFinder.saveExcerptTranslation, {
      sourceId: sourceId!,
      lang: "en",
      sourceText: QUOTE,
      text: "A made-up translation.",
      modelVersion: "mock/translator",
    });
    const [view] = await w.b.t.query(api.sources.listForPlace, { placeId: w.placeId });
    expect(view!.excerptTranslations).toEqual([{ lang: "en", text: "A made-up translation." }]);
    expect(
      await w.b.t.query(internal.storyFinder.untranslatedExcerpts, {
        placeId: w.placeId,
        limit: 10,
      }),
    ).toEqual([]);
    await w.b.t.run((ctx) =>
      ctx.db.patch("source", sourceId!, { excerpt: "テスト店の別の引用です。" }),
    );
    const [changed] = await w.b.t.query(api.sources.listForPlace, { placeId: w.placeId });
    expect(changed!.excerptTranslations).toEqual([]);
  });
});

describe("the steward's page", () => {
  it("shows counts and checked posts without the full text, and hides a found post in one click", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.google), w.candidate(posts.instagram)]);
    const [google, instagram] = await w.rows();
    await w.record(google!._id, {});
    await w.record(instagram!._id, { kind: "rating_only", quote: "" });
    const overview = await w.b.as("steward").query(api.storyFinder.stewardOverview, {});
    expect(JSON.stringify(overview)).not.toContain(MARKER);
    expect(overview.counts).toEqual(
      expect.arrayContaining([
        { status: "attached", platform: "google_reviews", count: 1 },
        { status: "rejected", platform: "instagram", count: 1 },
      ]),
    );
    expect(overview.counts.find((c) => c.status === "pending")).toBeUndefined();
    expect(overview.attached[0]).toMatchObject({ placeSlug: "test-shop", sourceStatus: "live" });
    expect(overview.rejected[0]).toMatchObject({ reason: "rating_only" });

    expect((await w.place())!.hasPeopleStories).toBe(true);
    expect(
      await errorCode(
        w.b.as("mocksteward").mutation(api.storyFinder.hide, { candidateId: google!._id }),
      ),
    ).toBe("forbidden");
    await w.b.as("steward").mutation(api.storyFinder.hide, { candidateId: google!._id });
    expect((await w.rows())[0]).toMatchObject({ status: "hidden", hiddenBy: w.steward });
    const sourceId = (await w.rows())[0]!.sourceId!;
    expect((await w.b.t.run((ctx) => ctx.db.get("source", sourceId)))!.status).toBe("hidden");
    expect((await w.place())!.hasPeopleStories).toBe(false);
    expect(await w.b.t.query(api.sources.listForPlace, { placeId: w.placeId })).toEqual([]);
    expect((await w.audits()).map((a) => a.action)).toEqual(
      expect.arrayContaining(["source.remove", "mention.hide"]),
    );
  });

  it("starting a check needs the model setting and a real steward", async () => {
    const w = await world();
    await w.ingest([w.candidate(posts.instagram)]);
    expect(await errorCode(w.b.as("steward").mutation(api.storyFinder.requestCheck, {}))).toBe(
      "conflict",
    );
    vi.stubEnv("AI_GATEWAY_API_KEY", "mock-key");
    vi.stubEnv("AI_MODEL_CHECK_MENTION", "mock/checker");
    expect(await errorCode(w.b.as("mocksteward").mutation(api.storyFinder.requestCheck, {}))).toBe(
      "forbidden",
    );
    expect(await w.b.as("steward").mutation(api.storyFinder.requestCheck, {})).toEqual({
      pending: 1,
      scheduled: 1,
    });
    const scheduled = await w.b.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.map((job) => job.name)).toEqual(["storyFinderActions:checkBatch"]);
  });
});

describe("checkBatch", () => {
  it("checks each post with one forced tool call, then records and links it", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "mock-key");
    vi.stubEnv("AI_MODEL_CHECK_MENTION", "mock/checker");
    vi.stubEnv("AI_MODEL_TRANSLATE", "mock/translator");
    const w = await world();
    await w.ingest([w.candidate(posts.google)]);
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "report_mention",
            input: JSON.stringify({
              aboutThisPlace: "yes",
              evidence: "テスト店",
              kind: "story",
              namesPrivatePeople: false,
              quote: QUOTE,
              topics: ["history"],
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    const factory = vi.spyOn(languageModels, "createLanguageModel").mockReturnValueOnce(model);
    await w.b.t.action(internal.storyFinderActions.checkBatch, {
      stewardPersonId: w.steward,
      remaining: 1,
      attach: true,
    });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gateway", modelId: "mock/checker" }),
    );
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0]!.toolChoice).toEqual({
      type: "tool",
      toolName: "report_mention",
    });
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(MARKER);
    expect((await w.rows())[0]).toMatchObject({
      status: "attached",
      modelSetting: "mock/checker",
      verdict: expect.objectContaining({ quote: QUOTE, kind: "story" }),
    });
    // The quote's translation is queued the way claims' are; nothing more is pending to check.
    const scheduled = await w.b.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.map((job) => job.name)).toEqual(["storyFinderActions:translateExcerpts"]);
  });
});
