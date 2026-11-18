/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRegionConfig } from "../src/lib/region/registry";
import { addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sleeper } from "./lib/instagramApi";

const modules = import.meta.glob("./**/*.ts");
const api_ = api.instagramPosts;
const sharing = () => getRegionConfig("nagasaki")!.sharing;
const TOKEN = "IGQV-secret-token-for-tests-0123456789";
const ACCOUNT = "17841400000000000";
const REAL_SLEEP = sleeper.sleep;

type Call = { method: string; path: string; body: URLSearchParams | null };
type Script = {
  statuses: string[];
  mediaPost?: () => Response | Error;
  publish?: () => Response | Error;
  limit?: { used: number; total: number };
  latest?: { id: string; permalink: string };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A stand-in for graph.instagram.com. The real API is never called in tests. */
function instagram(script: Script) {
  const calls: Call[] = [];
  const statuses = [...script.statuses];
  const fake = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v[\d.]+\//, "");
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    calls.push({ method: init?.method ?? "GET", path, body });
    if (path.endsWith("/content_publishing_limit")) {
      const { used, total } = script.limit ?? { used: 1, total: 100 };
      return json({
        data: [{ quota_usage: used, config: { quota_total: total, quota_duration: 86400 } }],
      });
    }
    if (path === `${ACCOUNT}/media` && init?.method === "POST") {
      const made = script.mediaPost?.() ?? json({ id: "container-1" });
      if (made instanceof Error) throw made;
      return made;
    }
    if (path === `${ACCOUNT}/media`) {
      return json({
        data: [script.latest ?? { id: "media-9", permalink: "https://www.instagram.com/p/late/" }],
      });
    }
    if (path === `${ACCOUNT}/media_publish`) {
      const made = script.publish?.() ?? json({ id: "media-1" });
      if (made instanceof Error) throw made;
      return made;
    }
    if (path === "container-1") return json({ status_code: statuses.shift() ?? "FINISHED" });
    if (path === "media-1") return json({ permalink: "https://www.instagram.com/p/abc/" });
    return json({ error: { code: 1 } }, 500);
  });
  vi.stubGlobal("fetch", fake);
  const count = (suffix: string, method = "POST") =>
    calls.filter((call) => call.path.endsWith(suffix) && call.method === method).length;
  return { calls, count };
}

async function world() {
  const b = newBackend(modules);
  const writer = await addPerson(b, "writer", "user", { joinedDaysAgo: 30 });
  const steward = await addPerson(b, "steward", "steward");
  await addPerson(b, "other", "user");
  await addPerson(b, "creator", "creator");
  const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
  const storyFor = (shareConsent: boolean, body = "The tram stop here is older than the street.") =>
    b.run((ctx) =>
      ctx.db.insert("story", {
        placeId,
        authorPersonId: writer,
        body,
        lang: "en",
        status: "live",
        isMock: false,
        ...(shareConsent ? { shareConsentAt: Date.now() } : {}),
      }),
    );
  const storyId = await storyFor(true);
  const approve = (id: Id<"story"> = storyId) =>
    b.as("steward").mutation(api.instagramPosts.approve, { storyId: id });
  const run = async () => {
    await b.t.mutation(internal.instagramPosts.dispatch, {});
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  const post = (id: Id<"instagramPost">) => b.run((ctx) => ctx.db.get("instagramPost", id));
  return { b, writer, steward, placeId, storyId, storyFor, approve, run, post };
}

let errors: ReturnType<typeof vi.spyOn>;
let logs: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  sharing().norenAccount = true;
  sharing().autoPost = true;
  delete sharing().autoPostSchedule;
  process.env.INSTAGRAM_ACCESS_TOKEN = TOKEN;
  process.env.INSTAGRAM_ACCOUNT_ID = ACCOUNT;
  sleeper.sleep = async () => {};
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  logs = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  sharing().autoPost = false;
  delete sharing().autoPostSchedule;
  delete process.env.INSTAGRAM_ACCESS_TOKEN;
  delete process.env.INSTAGRAM_ACCOUNT_ID;
  sleeper.sleep = REAL_SLEEP;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  errors.mockRestore();
  logs.mockRestore();
});

/** Nothing the app printed, stored or sent in a URL may carry the access token. */
function expectTokenNeverLeaked(ig: ReturnType<typeof instagram>, docs: unknown) {
  const printed = JSON.stringify([errors.mock.calls, logs.mock.calls]);
  expect(printed).not.toContain(TOKEN);
  expect(JSON.stringify(docs)).not.toContain(TOKEN);
  for (const call of ig.calls) if (call.method === "POST") expect(call.path).not.toContain(TOKEN);
}

describe("posting an approved story", () => {
  it("publishes by itself after the approval and records the permalink", async () => {
    const ig = instagram({ statuses: ["FINISHED"] });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);

    const saved = await w.post(postId);
    expect(saved).toMatchObject({
      status: "posted",
      mediaId: "media-1",
      permalink: "https://www.instagram.com/p/abc/",
      containerId: "container-1",
    });
    expect(ig.count(`${ACCOUNT}/media`)).toBe(1);
    expect(ig.count(`${ACCOUNT}/media_publish`)).toBe(1);
    const container = ig.calls.find((call) => call.path === `${ACCOUNT}/media`)!;
    expect(container.body!.get("image_url")).toBe(
      `https://noren.yooi.me/api/instagram-card/${postId}?t=${saved!.imageToken}`,
    );
    expect(container.body!.get("caption")).toContain("Story by");
    expect(container.body!.get("caption")).toContain("tram stop");
    // The kit's own record agrees: it shows as posted, and the audit says who and what.
    const story = await w.b.run((ctx) => ctx.db.get("story", w.storyId));
    expect(story!.sharePostedAt).toBeTypeOf("number");
    const audit = await w.b.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["story.share_autopost_approved", "story.share_autoposted"]),
    );
    const overview = await w.b
      .as("steward")
      .query(api.instagramPosts.overview, { regionId: "nagasaki" });
    expect(overview.posts[0]).toMatchObject({ status: "posted", needsRemoval: false });
    expectTokenNeverLeaked(ig, [saved, audit]);
  });

  it("waits while the container is not ready, then publishes once it is", async () => {
    const ig = instagram({ statuses: ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"] });
    const slept: number[] = [];
    sleeper.sleep = async (ms) => void slept.push(ms);
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await w.post(postId))!.status).toBe("posted");
    expect(slept).toEqual([2000, 3000]);
    expect(ig.count("container-1", "GET")).toBe(3);
    expect(ig.count(`${ACCOUNT}/media_publish`)).toBe(1);
  });

  it("never publishes a container Instagram says failed, and says why", async () => {
    const ig = instagram({ statuses: ["ERROR"] });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    const saved = await w.post(postId);
    expect(saved).toMatchObject({ status: "failed", reason: "container_error" });
    expect(saved!.containerId).toBeUndefined();
    expect(ig.count(`${ACCOUNT}/media_publish`)).toBe(0);
  });

  it("holds the post, without a failure, while Instagram's daily limit is full", async () => {
    const ig = instagram({ statuses: [], limit: { used: 100, total: 100 } });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    const saved = await w.post(postId);
    expect(saved).toMatchObject({ status: "queued", reason: "rate_limited", attempts: 0 });
    expect(saved!.notBefore).toBeGreaterThan(Date.now());
    expect(ig.count(`${ACCOUNT}/media`)).toBe(0);
  });
});

describe("when Instagram answers with an error", () => {
  it("fails at once for a refused token, so a steward reads it", async () => {
    const ig = instagram({
      statuses: [],
      mediaPost: () => json({ error: { code: 190, message: `bad ${TOKEN}` } }, 400),
    });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({
      status: "failed",
      reason: "token_invalid",
      attempts: 1,
    });
    // The response's own words, which could echo a secret, are kept nowhere.
    expectTokenNeverLeaked(ig, await w.post(postId));
    expect(JSON.stringify(errors.mock.calls)).toContain("InstagramError");
  });

  it("tries a passing trouble again after a pause, and gives up after three attempts", async () => {
    instagram({ statuses: [], mediaPost: () => json({ error: { code: 2 } }, 500) });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({
      status: "queued",
      reason: "api_error",
      attempts: 1,
    });
    for (const attempts of [2, 3]) {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      await w.run();
      expect((await w.post(postId))!.attempts).toBe(attempts);
    }
    expect(await w.post(postId)).toMatchObject({ status: "failed", reason: "api_error" });
  });

  it("does not post twice when a publish call was cut off and the post is tried again", async () => {
    // The publish call goes through at Instagram, but the answer never arrives.
    const ig = instagram({
      statuses: ["FINISHED", "PUBLISHED"],
      publish: () => new TypeError("fetch failed"),
    });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({ status: "queued", reason: "network" });
    expect(ig.count(`${ACCOUNT}/media_publish`)).toBe(1);

    vi.advanceTimersByTime(60 * 60 * 1000);
    await w.run();
    const saved = await w.post(postId);
    expect(saved).toMatchObject({
      status: "posted",
      mediaId: "media-9",
      permalink: "https://www.instagram.com/p/late/",
    });
    // One container, one publish call, ever.
    expect(ig.count(`${ACCOUNT}/media`)).toBe(1);
    expect(ig.count(`${ACCOUNT}/media_publish`)).toBe(1);
  });

  it("lets a steward try a failed post again, with a fresh container", async () => {
    instagram({ statuses: ["ERROR"] });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await w.post(postId))!.status).toBe("failed");
    const ig = instagram({ statuses: ["FINISHED"] });
    await w.b.as("steward").mutation(api_.retry, { postId });
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await w.post(postId))!.status).toBe("posted");
    expect(ig.count(`${ACCOUNT}/media`)).toBe(1);
  });

  it("frees a post whose action died, and does not start the same one twice", async () => {
    const ig = instagram({ statuses: ["FINISHED"] });
    const w = await world();
    const postId = await w.approve();
    // It is "publishing" with an action that never finished.
    await w.b.run((ctx) =>
      ctx.db.patch("instagramPost", postId, { status: "publishing", lastAttemptAt: Date.now() }),
    );
    await w.b.t.mutation(internal.instagramPosts.dispatch, {});
    expect((await w.post(postId))!.status).toBe("publishing");
    vi.advanceTimersByTime(16 * 60 * 1000);
    await w.run();
    expect((await w.post(postId))!.status).toBe("posted");
    expect(ig.count(`${ACCOUNT}/media_publish`)).toBe(1);
  });
});

describe("a writer who withdraws, or a story taken down, before it is published", () => {
  it("does not publish after the writer unticks sharing", async () => {
    const ig = instagram({ statuses: [] });
    const w = await world();
    const postId = await w.approve();
    await w.b.as("writer").mutation(api.storyShare.setShareConsent, {
      storyId: w.storyId,
      on: false,
    });
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({ status: "cancelled", reason: "withdrawn" });
    expect(ig.calls).toEqual([]);
  });

  it("stops at the last moment when the tick goes off while the picture is processing", async () => {
    const ig = instagram({ statuses: ["IN_PROGRESS", "FINISHED"] });
    const w = await world();
    // The writer withdraws during the wait for Instagram, after the container exists.
    // The mutation row is written directly, as the action itself holds no transaction open.
    sleeper.sleep = async () => {
      await w.b.run((ctx) => ctx.db.patch("story", w.storyId, { shareConsentAt: undefined }));
    };
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({ status: "cancelled", reason: "withdrawn" });
    expect(ig.count(`${ACCOUNT}/media`)).toBe(1);
    expect(ig.count(`${ACCOUNT}/media_publish`)).toBe(0);
  });

  it("does not publish a story that was removed", async () => {
    const ig = instagram({ statuses: [] });
    const w = await world();
    const postId = await w.approve();
    await w.b.as("writer").mutation(api.stories.remove, { storyId: w.storyId });
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({ status: "cancelled", reason: "removed" });
    expect(ig.calls).toEqual([]);
  });

  it("does not publish a story that was posted by hand meanwhile", async () => {
    const ig = instagram({ statuses: [] });
    const w = await world();
    const postId = await w.approve();
    await w.b.as("steward").mutation(api.storyShare.markPosted, { storyId: w.storyId });
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({ status: "cancelled", reason: "posted_by_hand" });
    expect(ig.calls).toEqual([]);
  });

  it("shows a take-down task, with the link, when it goes away after it was posted", async () => {
    instagram({ statuses: ["FINISHED"] });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    await w.b.as("writer").mutation(api.storyShare.setShareConsent, {
      storyId: w.storyId,
      on: false,
    });
    const steward = w.b.as("steward");
    let overview = await steward.query(api_.overview, { regionId: "nagasaki" });
    expect(overview.posts[0]).toMatchObject({
      status: "posted",
      needsRemoval: true,
      permalink: "https://www.instagram.com/p/abc/",
    });
    await steward.mutation(api_.markRemoved, { postId });
    overview = await steward.query(api_.overview, { regionId: "nagasaki" });
    expect(overview.posts[0]).toMatchObject({ needsRemoval: false });
    expect(overview.posts[0]!.removedByHandAt).toBeTypeOf("number");
  });
});

describe("the picture's address", () => {
  const card = (w: Awaited<ReturnType<typeof world>>, postId: Id<"instagramPost">, token: string) =>
    w.b.t.query(api_.cardForPost, { postId, token });

  it("gives the card only to the right secret, and only while the post is waiting", async () => {
    instagram({ statuses: ["FINISHED"] });
    const w = await world();
    // Hold the post queued: a pause, so the dispatch has not started it.
    const postId = await w.approve();
    await w.b.run((ctx) =>
      ctx.db.patch("instagramPost", postId, { notBefore: Date.now() + 3600_000 }),
    );
    const token = (await w.post(postId))!.imageToken;
    expect(await card(w, postId, token)).toMatchObject({
      authorName: expect.any(String),
      body: expect.stringContaining("tram"),
    });
    expect(await card(w, postId, "x".repeat(token.length))).toBeNull();
    expect(await card(w, postId, "")).toBeNull();
    // Withdrawn: the address stops working at once.
    await w.b.run((ctx) => ctx.db.patch("story", w.storyId, { shareConsentAt: undefined }));
    expect(await card(w, postId, token)).toBeNull();
  });

  it("stops working once the post has been published", async () => {
    instagram({ statuses: ["FINISHED"] });
    const w = await world();
    const postId = await w.approve();
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    const saved = await w.post(postId);
    expect(await card(w, postId, saved!.imageToken)).toBeNull();
  });
});

describe("pacing", () => {
  it("starts nothing before the set hour and no more than the daily number", async () => {
    sharing().autoPostSchedule = { perDay: 1, hourJst: 10 };
    const ig = instagram({ statuses: ["FINISHED", "FINISHED"] });
    // 09:00 Japan time on 20 Nov 2026 is 00:00 UTC.
    vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
    const w = await world();
    const first = await w.approve();
    const second = await w.approve(await w.storyFor(true, "Another story."));
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await w.post(first))!.status).toBe("queued");
    expect(ig.calls).toEqual([]);

    vi.setSystemTime(new Date("2026-11-20T01:30:00Z")); // 10:30 in Japan
    await w.run();
    expect((await w.post(first))!.status).toBe("posted");
    expect((await w.post(second))!.status).toBe("queued");
    await w.run();
    expect((await w.post(second))!.status).toBe("queued");

    vi.setSystemTime(new Date("2026-11-20T15:30:00Z")); // 00:30 the next Japan day
    await w.run();
    expect((await w.post(second))!.status).toBe("queued");
    vi.setSystemTime(new Date("2026-11-21T01:30:00Z")); // 10:30 the next Japan day
    await w.run();
    expect((await w.post(second))!.status).toBe("posted");
  });
});

describe("with the switch off, or Instagram not connected", () => {
  it("refuses an approval while the switch is off, and the screen reports it off", async () => {
    sharing().autoPost = false;
    const ig = instagram({ statuses: [] });
    const w = await world();
    expect(await errorCode(w.approve())).toBe("conflict");
    const overview = await w.b.as("steward").query(api_.overview, { regionId: "nagasaki" });
    expect(overview).toMatchObject({ autoPost: false, posts: [] });
    await w.b.t.mutation(internal.instagramPosts.dispatch, {});
    expect(ig.calls).toEqual([]);
  });

  it("posts nothing queued before the switch went off, and keeps it waiting", async () => {
    const ig = instagram({ statuses: ["FINISHED"] });
    const w = await world();
    const postId = await w.approve();
    await w.b.run((ctx) => ctx.db.patch("instagramPost", postId, { notBefore: Date.now() + 1000 }));
    sharing().autoPost = false;
    vi.advanceTimersByTime(5000);
    await w.run();
    expect((await w.post(postId))!.status).toBe("queued");
    expect(ig.calls).toEqual([]);
  });

  it("says plainly that Instagram is not connected, and refuses to approve, without crashing", async () => {
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    const ig = instagram({ statuses: [] });
    const w = await world();
    const overview = await w.b.as("steward").query(api_.overview, { regionId: "nagasaki" });
    expect(overview).toMatchObject({ autoPost: true, configured: false });
    expect(await errorCode(w.approve())).toBe("conflict");
    expect(ig.calls).toEqual([]);
  });

  it("fails a queued post as not connected when the credentials vanish before it starts", async () => {
    const ig = instagram({ statuses: [] });
    const w = await world();
    const postId = await w.approve();
    // Approved, then the credentials are removed before the scheduled work runs.
    delete process.env.INSTAGRAM_ACCOUNT_ID;
    await w.b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await w.post(postId)).toMatchObject({ status: "failed", reason: "not_configured" });
    expect(ig.calls).toEqual([]);
  });

  it("notes when the token was first seen, for the expiry warning, without storing it", async () => {
    instagram({ statuses: [] });
    const w = await world();
    await w.approve();
    const rows = await w.b.run((ctx) => ctx.db.query("instagramToken").collect());
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(TOKEN);
    expect(rows[0]!.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const overview = await w.b.as("steward").query(api_.overview, { regionId: "nagasaki" });
    expect(overview.tokenFirstSeenAt).toBe(rows[0]!.firstSeenAt);
    // A new token starts a new count.
    process.env.INSTAGRAM_ACCESS_TOKEN = `${TOKEN}-renewed`;
    await w.b.t.mutation(internal.instagramPosts.noteToken, {});
    expect(await w.b.run((ctx) => ctx.db.query("instagramToken").collect())).toHaveLength(2);
  });
});

describe("who may do what", () => {
  it("lets only a steward approve, retry, stop, mark removed and read the overview", async () => {
    instagram({ statuses: ["FINISHED"] });
    const w = await world();
    const postId = await w.approve();
    for (const caller of ["writer", "other", "creator"] as const) {
      const as = w.b.as(caller);
      expect(await errorCode(as.mutation(api_.approve, { storyId: w.storyId }))).toBe("forbidden");
      expect(await errorCode(as.mutation(api_.retry, { postId }))).toBe("forbidden");
      expect(await errorCode(as.mutation(api_.cancel, { postId }))).toBe("forbidden");
      expect(await errorCode(as.mutation(api_.markRemoved, { postId }))).toBe("forbidden");
      expect(await errorCode(as.query(api_.overview, { regionId: "nagasaki" }))).toBe("forbidden");
    }
    expect(await errorCode(w.b.t.mutation(api_.approve, { storyId: w.storyId }))).toBe(
      "unauthenticated",
    );
  });

  it("refuses an approval for a story whose writer did not tick, or that is already approved", async () => {
    instagram({ statuses: [] });
    const w = await world();
    const unticked = await w.storyFor(false);
    expect(await errorCode(w.approve(unticked))).toBe("conflict");
    await w.approve();
    expect(await errorCode(w.approve())).toBe("conflict");
  });
});
