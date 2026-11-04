/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
// Every post here is made up.
const WORDS = "店主の祖父が屋台から始めた店だそうです";

beforeEach(() => {
  // Scheduled functions stay queued rather than running.
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "synthetic-steward", "steward");
  const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
  const post = async (
    platform: "google_reviews" | "web" | "instagram",
    options: {
      status?: "attached" | "accepted";
      sourceStatus?: "live" | "hidden";
      n?: number;
      kind?: "story" | "tip";
    } = {},
  ) =>
    await b.run(async (ctx) => {
      const url = `https://example.com/post/${platform}/${options.n ?? 1}`;
      const sourceId = await ctx.db.insert("source", {
        placeId,
        adapter: "website",
        platform: platform === "google_reviews" ? "google_maps" : platform,
        url,
        canonicalUrl: url,
        status: options.sourceStatus ?? "live",
        addedBy: steward,
        isMock: false,
        origin: "story_finder",
        sharedAt: 1,
        excerpt: WORDS,
        excerptLang: "ja",
        authorHandle: "synthetic author",
      });
      await ctx.db.insert("mentionCandidate", {
        placeId,
        regionId: "nagasaki",
        platform,
        url,
        canonicalUrl: url,
        text: `架空の投稿です。${WORDS}。`,
        searchedFor: "テスト店",
        query: "テスト店",
        actorId: "synthetic",
        runId: "synthetic",
        collectionId: "synthetic",
        authorKey: `host:${options.n ?? 1}`,
        collectedBy: steward,
        status: options.status ?? "attached",
        sourceId,
        attachedAt: 1,
        verdict: {
          aboutThisPlace: "yes",
          evidence: WORDS,
          kind: options.kind ?? "story",
          namesPrivatePeople: false,
          quote: WORDS,
          topics: [],
        },
      });
      return sourceId;
    });
  const startRun = async (
    platforms: ("google_reviews" | "web" | "instagram")[] = ["google_reviews", "web"],
  ) =>
    await b.run((ctx) =>
      ctx.db.insert("placeStoryRun", {
        placeId,
        requestedBy: steward,
        status: "queued",
        platforms,
        steps: [],
        wakeAttempts: 0,
      }),
    );
  const begin = (runId: Id<"placeStoryRun">) =>
    b.t.mutation(internal.placeStories.beginRun, {
      runId,
      writer: "meta:synthetic",
      checker: "modal:synthetic",
    });
  const save = (runId: Id<"placeStoryRun">, postIds: string[]) =>
    b.t.mutation(internal.placeStories.saveStory, {
      runId,
      postsRead: 2,
      sentences: [
        {
          en: "One reviewer heard it began as a stall.",
          ja: "屋台から始まったと聞いた人がいます。",
          citations: postIds.map((postId) => ({ postId, words: WORDS })),
        },
      ],
    });
  return { ...b, run_: b.run, steward, placeId, post, startRun, begin, save };
}

describe("placeStories.beginRun", () => {
  it("reads only attached, live posts on the run's platforms, and marks the run as running", async () => {
    const b = await setup();
    const google = await b.post("google_reviews");
    await b.post("web", { status: "accepted" });
    await b.post("web", { sourceStatus: "hidden", n: 2 });
    await b.post("instagram");
    const runId = await b.startRun();
    const started = await b.begin(runId);
    expect(started?.posts.map(({ id }) => id)).toEqual([String(google)]);
    expect(await b.run_((ctx) => ctx.db.get("placeStoryRun", runId))).toMatchObject({
      status: "running",
      writer: "meta:synthetic",
    });
    // Taken once: a second start of the same run does nothing.
    expect(await b.begin(runId)).toBeNull();
  });

  it("reads another platform only when the run names it", async () => {
    const b = await setup();
    await b.post("instagram");
    expect((await b.begin(await b.startRun(["instagram"])))?.posts).toHaveLength(1);
  });

  it("finishes with nothing when there are no posts to read", async () => {
    const b = await setup();
    const runId = await b.startRun();
    expect(await b.begin(runId)).toBeNull();
    expect((await b.run_((ctx) => ctx.db.get("placeStoryRun", runId)))?.status).toBe("nothing");
  });
});

describe("placeStories.saveStory and forPlace", () => {
  it("publishes a story with its notes, numbered and credited, for anyone to read", async () => {
    const b = await setup();
    const sourceId = await b.post("google_reviews");
    const runId = await b.startRun();
    await b.begin(runId);
    await b.save(runId, [String(sourceId)]);
    const story = await b.t.query(api.placeStories.forPlace, { placeId: b.placeId });
    expect(story?.sentences).toEqual([
      expect.objectContaining({ en: "One reviewer heard it began as a stall.", notes: [0] }),
    ]);
    expect(story?.notes[0]).toMatchObject({
      words: WORDS,
      lang: "ja",
      platform: "google_maps",
      authorHandle: "synthetic author",
    });
    expect((await b.run_((ctx) => ctx.db.get("placeStoryRun", runId)))?.status).toBe("published");
  });

  it("gives the same words from the same post one note", async () => {
    const b = await setup();
    const sourceId = String(await b.post("google_reviews"));
    const runId = await b.startRun();
    await b.begin(runId);
    await b.save(runId, [sourceId, sourceId]);
    const story = await b.t.query(api.placeStories.forPlace, { placeId: b.placeId });
    expect(story?.notes).toHaveLength(1);
    expect(story?.sentences[0]?.notes).toEqual([0, 0]);
  });

  it("publishes nothing citing a post that came off the page during the run", async () => {
    const b = await setup();
    const sourceId = await b.post("google_reviews");
    const runId = await b.startRun();
    await b.begin(runId);
    await b.run_((ctx) => ctx.db.patch("source", sourceId, { status: "hidden" }));
    await b.save(runId, [String(sourceId)]);
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).toBeNull();
    expect((await b.run_((ctx) => ctx.db.get("placeStoryRun", runId)))?.status).toBe("nothing");
  });

  it("takes a sentence off the page when a post it cites is no longer shown", async () => {
    const b = await setup();
    const sourceId = await b.post("google_reviews");
    const runId = await b.startRun();
    await b.begin(runId);
    await b.save(runId, [String(sourceId)]);
    await b.run_((ctx) => ctx.db.patch("source", sourceId, { status: "hidden" }));
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).toBeNull();
  });

  it("erases the sentence and the run's log when a steward hides the post", async () => {
    const b = await setup();
    const kept = await b.post("web", { n: 2 });
    const hidden = await b.post("google_reviews");
    const runId = await b.startRun();
    await b.begin(runId);
    await b.t.mutation(internal.placeStories.addStep, {
      runId,
      step: { at: 1, kind: "checked", sentence: "One reviewer heard it began as a stall." },
    });
    await b.save(runId, [String(hidden)]);
    await b.run_(async (ctx) => {
      const story = await ctx.db.query("placeStory").first();
      await ctx.db.patch("placeStory", story!._id, {
        sentences: [
          ...story!.sentences,
          {
            en: "It has an upstairs.",
            ja: "二階があります。",
            citations: [{ sourceId: kept, words: WORDS }],
          },
        ],
      });
    });
    const candidate = await b.run_((ctx) =>
      ctx.db
        .query("mentionCandidate")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", hidden))
        .first(),
    );
    await b.t.mutation(internal.storyFinder.hideMany, {
      stewardPersonId: b.steward,
      candidateIds: [candidate!._id],
    });
    const story = await b.run_((ctx) => ctx.db.query("placeStory").first());
    expect(story?.sentences.map(({ en }) => en)).toEqual(["It has an upstairs."]);
    expect((await b.run_((ctx) => ctx.db.get("placeStoryRun", runId)))?.steps).toEqual([]);
  });

  it("hides a draft place's story from the public", async () => {
    const b = await setup();
    const sourceId = await b.post("google_reviews");
    const runId = await b.startRun();
    await b.begin(runId);
    await b.save(runId, [String(sourceId)]);
    await b.run_((ctx) => ctx.db.patch("place", b.placeId, { visibility: "draft" }));
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).toBeNull();
  });
});

describe("placeStories runs", () => {
  it("comes back later while the second reader sleeps, then stops after enough tries", async () => {
    const b = await setup();
    await b.post("google_reviews");
    const runId = await b.startRun();
    await b.begin(runId);
    await b.t.mutation(internal.placeStories.addStep, {
      runId,
      step: { at: 1, kind: "drafted", count: 1 },
    });
    await b.t.mutation(internal.placeStories.waitForChecker, {
      runId,
      error: "APICallError HTTP 503",
    });
    expect(await b.run_((ctx) => ctx.db.get("placeStoryRun", runId))).toMatchObject({
      status: "waiting",
      steps: [],
      wakeAttempts: 1,
    });
    await b.run_((ctx) => ctx.db.patch("placeStoryRun", runId, { wakeAttempts: 24 }));
    await b.t.mutation(internal.placeStories.waitForChecker, {
      runId,
      error: "APICallError HTTP 503",
    });
    expect(await b.run_((ctx) => ctx.db.get("placeStoryRun", runId))).toMatchObject({
      status: "failed",
      error: "APICallError HTTP 503",
    });
  });

  it("only lets a real steward start a run, and shows the panel only to stewards", async () => {
    const b = await setup();
    await addPerson(b, "synthetic-user", "user");
    await addPerson(b, "synthetic-mock-steward", "steward", { isMock: true });
    const start = (name: string) =>
      b.as(name).mutation(api.placeStories.request, { placeId: b.placeId });
    expect(await errorCode(start("synthetic-user"))).toBe("forbidden");
    expect(await errorCode(start("synthetic-mock-steward"))).toBe("forbidden");
    expect(await errorCode(b.as("synthetic-user").query(api.placeStories.stewardPanel, {}))).toBe(
      "forbidden",
    );
    const runId = await start("synthetic-steward");
    const panel = await b.as("synthetic-steward").query(api.placeStories.stewardPanel, {});
    expect(panel.runs[0]).toMatchObject({ runId, status: "queued" });
  });

  it("starts a batch only on places with enough posts and no story", async () => {
    const b = await setup();
    await b.post("google_reviews", { n: 1 });
    expect(
      await b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: b.steward, limit: 5 }),
    ).toEqual({ started: 0 });
    await b.post("web", { n: 2 });
    expect(
      await b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: b.steward, limit: 5 }),
    ).toEqual({ started: 1 });
  });

  it("writes the ready places each night with nobody pressing anything", async () => {
    const b = await setup();
    await b.post("google_reviews", { n: 1 });
    const night = () => b.t.mutation(internal.placeStories.writeReadyStories, {});
    expect(await night()).toEqual({ started: 0 });
    await b.post("web", { n: 2 });
    expect(await night()).toEqual({ started: 1 });
    const runs = await b.run_((ctx) => ctx.db.query("placeStoryRun").collect());
    expect(runs).toMatchObject([{ requestedBy: b.steward, status: "queued" }]);
  });

  it("does not write a place again the night after it found nothing to tell", async () => {
    const b = await setup();
    await b.post("google_reviews", { n: 1 });
    await b.post("web", { n: 2 });
    const runId = await b.startRun();
    await b.begin(runId);
    await b.t.mutation(internal.placeStories.saveStory, { runId, sentences: [], postsRead: 2 });
    expect(await b.t.mutation(internal.placeStories.writeReadyStories, {})).toEqual({ started: 0 });
  });

  it("puts a place back on the ready list when its story is forgotten", async () => {
    const b = await setup();
    await b.post("google_reviews", { n: 1 });
    await b.post("web", { n: 2 });
    const runId = await b.startRun();
    await b.begin(runId);
    await b.t.mutation(internal.placeStories.saveStory, { runId, sentences: [], postsRead: 2 });
    const forget = () =>
      b.t.mutation(internal.placeStories.forgetStory, {
        stewardPersonId: b.steward,
        placeId: b.placeId,
      });
    expect(await forget()).toEqual({ forgotten: true });
    expect(await forget()).toEqual({ forgotten: false });
    expect(await b.t.mutation(internal.placeStories.writeReadyStories, {})).toEqual({ started: 1 });
  });

  it("leaves out a place whose posts are all tips", async () => {
    const b = await setup();
    await b.post("google_reviews", { n: 1, kind: "tip" });
    await b.post("web", { n: 2, kind: "tip" });
    const start = () =>
      b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: b.steward, limit: 5 });
    expect(await start()).toEqual({ started: 0 });
    await b.post("web", { n: 3, kind: "story" });
    expect(await start()).toEqual({ started: 1 });
  });

  it("starts exactly the places it names, whatever their posts", async () => {
    const b = await setup();
    const other = await addPlace(b, { createdBy: b.steward, visibility: "public" });
    const hidden = await addPlace(b, { createdBy: b.steward, visibility: "draft" });
    expect(
      await b.t.mutation(internal.placeStories.enqueue, {
        stewardPersonId: b.steward,
        limit: 5,
        placeIds: [other, hidden],
      }),
    ).toEqual({ started: 1 });
    const runs = await b.run_((ctx) => ctx.db.query("placeStoryRun").collect());
    expect(runs.map(({ placeId }) => placeId)).toEqual([other]);
  });

  it("takes a withdrawn story off the page and the place off the ready list, and records why", async () => {
    const b = await setup();
    const sourceId = await b.post("google_reviews", { n: 1 });
    await b.post("web", { n: 2 });
    const runId = await b.startRun();
    await b.begin(runId);
    await b.save(runId, [String(sourceId)]);
    const withdraw = (offerAgain?: boolean) =>
      b.t.mutation(internal.placeStories.withdraw, {
        stewardPersonId: b.steward,
        placeId: b.placeId,
        reason: "nothing to retell",
        offerAgain,
      });
    const started = () =>
      b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: b.steward, limit: 5 });
    await withdraw();
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).toBeNull();
    expect(await started()).toEqual({ started: 0 });
    const audit = await b.run_((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.filter(({ action }) => action === "story_agent.withdrawn")).toHaveLength(1);

    await withdraw(true);
    expect(await started()).toEqual({ started: 1 });
  });

  it("keeps a place off the ready list before any story was written", async () => {
    const b = await setup();
    await b.post("google_reviews", { n: 1 });
    await b.post("web", { n: 2 });
    await b.t.mutation(internal.placeStories.withdraw, {
      stewardPersonId: b.steward,
      placeId: b.placeId,
      reason: "not for this agent",
    });
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).toBeNull();
    expect(
      await b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: b.steward, limit: 5 }),
    ).toEqual({ started: 0 });
  });

  it("takes an earlier story off the page when a later run finds nothing to tell", async () => {
    const b = await setup();
    const sourceId = await b.post("google_reviews", { n: 1 });
    await b.post("web", { n: 2 });
    const first = await b.startRun();
    await b.begin(first);
    await b.save(first, [String(sourceId)]);
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).not.toBeNull();

    const second = await b.startRun();
    await b.begin(second);
    await b.t.mutation(internal.placeStories.saveStory, {
      runId: second,
      sentences: [],
      postsRead: 2,
    });
    expect((await b.run_((ctx) => ctx.db.get("placeStoryRun", second)))?.status).toBe("nothing");
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).toBeNull();
    expect(
      await b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: b.steward, limit: 5 }),
    ).toEqual({ started: 0 });
  });

  it("publishes again when a later run writes a withdrawn place's story", async () => {
    const b = await setup();
    const sourceId = await b.post("google_reviews");
    await b.t.mutation(internal.placeStories.withdraw, {
      stewardPersonId: b.steward,
      placeId: b.placeId,
      reason: "not for this agent",
    });
    const runId = await b.startRun();
    await b.begin(runId);
    await b.save(runId, [String(sourceId)]);
    expect(await b.t.query(api.placeStories.forPlace, { placeId: b.placeId })).not.toBeNull();
  });

  it("refuses a mock steward's batch and an oversized one", async () => {
    const b = await setup();
    const mock = await addPerson(b, "synthetic-mock-steward", "steward", { isMock: true });
    expect(
      await errorCode(
        b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: mock, limit: 1 }),
      ),
    ).toBe("invalid_input");
    expect(
      await errorCode(
        b.t.mutation(internal.placeStories.enqueue, { stewardPersonId: b.steward, limit: 1000 }),
      ),
    ).toBe("invalid_input");
  });
});
