/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS, embedFor } from "../src/lib/adapters";
import { SOURCE_STATUSES } from "../src/lib/domain/constants";
import {
  addOwner,
  addPerson,
  addPlace,
  addSource,
  errorCode,
  newBackend,
} from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { SourceView } from "./sources";

vi.mock("../src/lib/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/adapters")>();
  return {
    ...actual,
    ADAPTERS: Object.freeze({
      ...actual.ADAPTERS,
      link_card: { ...actual.ADAPTERS.link_card },
    }),
  };
});

const modules = import.meta.glob("./**/*.ts");
const video = "https://youtu.be/abcdefghijk?utm_source=test";
const canonicalVideo = "https://www.youtube.com/watch?v=abcdefghijk";

async function world() {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator");
  const other = await addPerson(b, "other", "creator");
  const steward = await addPerson(b, "steward", "steward");
  const owner = await addPerson(b, "owner", "business_owner");
  await addPerson(b, "user", "user");
  await addPerson(b, "mock", "creator", { isMock: true });
  const placeId = await addPlace(b, {
    createdBy: creator,
    visibility: "demo_public",
    kind: "landmark",
  });
  await addOwner(b, placeId, owner, steward);
  const source = (options: { status?: "live" | "gone" | "hidden"; consent?: boolean } = {}) =>
    addSource(b, {
      placeId,
      addedBy: other,
      status: options.status,
      demoConsentBy: options.consent ? steward : undefined,
    });
  const row = (id: Id<"source">) => b.t.run((ctx) => ctx.db.get("source", id));
  const audits = () => b.t.run((ctx) => ctx.db.query("auditLog").take(100));
  return { b, creator, other, steward, owner, placeId, source, row, audits };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("add sources", () => {
  it("a creator adds a YouTube URL and gets adapter youtube with a canonical URL", async () => {
    const { b, placeId, row } = await world();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await b.as("creator").mutation(api.sources.add, { placeId, url: video });
    expect(result).toMatchObject({ adapter: "youtube", platform: "youtube" });
    expect(await row(result.sourceId)).toMatchObject({
      canonicalUrl: canonicalVideo,
      status: "live",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("an unsupported URL becomes a link card with the typed title", async () => {
    const { b, placeId, row } = await world();
    const result = await b
      .as("creator")
      .mutation(api.sources.add, { placeId, url: "https://example.com/post", title: "My link" });
    expect(result).toMatchObject({ adapter: "link_card", platform: "web" });
    expect(await row(result.sourceId)).toMatchObject({ title: "My link" });
  });

  it.each([undefined, "", "   "])(
    "a link card without a title is invalid_input (%s)",
    async (title) => {
      const { b, placeId } = await world();
      const call = b
        .as("creator")
        .mutation(api.sources.add, { placeId, url: "https://example.com/post", title });
      await expect(call).rejects.toThrow("type a title for the link card");
      expect(await errorCode(call)).toBe("invalid_input");
    },
  );

  it("javascript: is invalid_input", async () => {
    const { b, placeId } = await world();
    const call = b.as("creator").mutation(api.sources.add, { placeId, url: "javascript:alert(1)" });
    await expect(call).rejects.toThrow("unsupported_scheme");
    expect(await errorCode(call)).toBe("invalid_input");
  });

  it("a duplicate URL on the same place is conflict", async () => {
    const { b, placeId } = await world();
    await b.as("creator").mutation(api.sources.add, { placeId, url: video });
    expect(
      await errorCode(b.as("other").mutation(api.sources.add, { placeId, url: canonicalVideo })),
    ).toBe("conflict");
  });

  it("X canonical duplicates collapse before persistence and uniqueness checks", async () => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, {
      placeId,
      url: "https://x.com/NHK_PR/status/1",
    });
    expect(await row(sourceId)).toMatchObject({ canonicalUrl: "https://x.com/i/status/1" });
    expect(await row(sourceId)).not.toHaveProperty("authorHandle");
    expect(await row(sourceId)).not.toHaveProperty("authorUrl");
    for (const url of ["https://x.com/nhk_pr/status/1", "https://twitter.com/i/web/status/1"]) {
      expect(await errorCode(b.as("creator").mutation(api.sources.add, { placeId, url }))).toBe(
        "conflict",
      );
    }
    expect(await b.t.run((ctx) => ctx.db.query("source").take(10))).toHaveLength(1);
  });

  it("distinct hash-routed link cards persist separately and http stays http", async () => {
    const { b, placeId, row } = await world();
    const ids = [];
    for (const id of [1, 2]) {
      const { sourceId } = await b.as("creator").mutation(api.sources.add, {
        placeId,
        url: `http://example.com/#/post/${id}`,
        title: "Mock hash-routed page",
      });
      ids.push(sourceId);
      expect((await row(sourceId))?.canonicalUrl).toBe(`http://example.com/#/post/${id}`);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  it.each(["http://169.254.169.254/", "http://[::1]/", "https://example.com:8080/"])(
    "refuses IP-literal or non-default-port link cards before storage: %s",
    async (url) => {
      const { b, placeId } = await world();
      const call = b.as("creator").mutation(api.sources.add, {
        placeId,
        url,
        title: "Mock refused link",
      });
      await expect(call).rejects.toThrow("invalid_url");
      expect(await errorCode(call)).toBe("invalid_input");
      expect(await b.t.run((ctx) => ctx.db.query("source").take(10))).toEqual([]);
    },
  );

  it.each([
    "https://x.com/NHK_PR/status/1",
    "https://facebook.com/Misleading/posts/1",
    "https://tiktok.com/@Misleading/video/1",
    "https://threads.net/@Misleading/post/EXAMPLE123",
  ])("typed author fields override a misleading URL handle: %s", async (url) => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, {
      placeId,
      url,
      authorHandle: "@mock_creator",
      authorUrl: "https://example.com/mock_creator",
    });
    expect(await row(sourceId)).toMatchObject({
      authorHandle: "@mock_creator",
      authorUrl: "https://example.com/mock_creator",
    });
  });

  it("a typed handle wins even when no author URL is typed", async () => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, {
      placeId,
      url: "https://facebook.com/Misleading/posts/1",
      authorHandle: "@mock_creator",
    });
    expect((await row(sourceId))?.authorHandle).toBe("@mock_creator");
  });

  it("any member may link a post to a place they can read, up to 50 a day", async () => {
    const { b, steward } = await world();
    const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
    const add = (i: number) =>
      b.as("user").mutation(api.sources.add, {
        placeId,
        url: `https://example.com/story-${i}`,
        title: "Fictional story link",
      });
    for (let i = 0; i < 50; i++) await add(i);
    expect(await errorCode(add(50))).toBe("rate_limited");
    // A refused link writes nothing, so the 51st is not stored.
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("source")
          .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
          .take(60),
      ),
    ).toHaveLength(50);
  });

  it("a post a member links shows to everyone with their name and line, and goes when they remove it", async () => {
    const { b, steward } = await world();
    const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
    const { sourceId } = await b.as("user").mutation(api.sources.add, {
      placeId,
      url: video,
      note: "Cats sleep on the steps here.",
      noteLang: "en",
    });
    const publicView = await b.t.query(api.sources.listForPlace, { placeId });
    expect(publicView).toHaveLength(1);
    expect(publicView[0]).toMatchObject({
      _id: sourceId,
      creatorNote: "Cats sleep on the steps here.",
      sharedBy: "Test Person (user)",
      hasDemoConsent: false,
      addedByMe: false,
    });
    expect(publicView[0]!.addedAt).toBeTypeOf("number");
    await b.as("user").mutation(api.sources.remove, { sourceId });
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
  });

  it("an old link nobody agreed to show stays off the public page", async () => {
    const { b, steward, other } = await world();
    const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
    await addSource(b, { placeId, addedBy: other });
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
    // Its adder still sees it, but without a name line: they never agreed to show it.
    const own = await b.as("other").query(api.sources.listForPlace, { placeId });
    expect(own).toHaveLength(1);
    expect(own[0]?.sharedBy).toBeUndefined();
  });

  it("a member's author credit has a length limit", async () => {
    const { b, steward } = await world();
    const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
    const add = (extra: { authorHandle?: string; authorUrl?: string }) =>
      b.as("user").mutation(api.sources.add, { placeId, url: video, ...extra });
    expect(await errorCode(add({ authorHandle: "a".repeat(101) }))).toBe("invalid_input");
    expect(await errorCode(add({ authorUrl: `https://example.com/${"a".repeat(481)}` }))).toBe(
      "invalid_input",
    );
    await add({
      authorHandle: "a".repeat(100),
      authorUrl: `https://example.com/${"a".repeat(480)}`,
    });
  });

  it("another creator's draft is not_found", async () => {
    const { b, creator } = await world();
    const placeId = await addPlace(b, { createdBy: creator });
    expect(await errorCode(b.as("other").mutation(api.sources.add, { placeId, url: video }))).toBe(
      "not_found",
    );
  });

  it("a mock creator's source is mock", async () => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("mock").mutation(api.sources.add, { placeId, url: video });
    expect((await row(sourceId))?.isMock).toBe(true);
  });

  it("nothing but URL, platform, author, date, title and note is stored", async () => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, {
      placeId,
      url: video,
      title: "Typed title",
      note: "My note",
      noteLang: "ja",
      authorHandle: "test-author",
      authorUrl: "https://example.com/author",
      postedAt: 123,
    });
    const stored = await row(sourceId);
    expect(Object.keys(stored!).sort()).toEqual(
      [
        "_id",
        "_creationTime",
        "placeId",
        "adapter",
        "platform",
        "url",
        "canonicalUrl",
        "title",
        "authorHandle",
        "authorUrl",
        "postedAt",
        "creatorNote",
        "noteLang",
        "addedBy",
        "status",
        "sharedAt",
        "isMock",
      ].sort(),
    );
    expect(stored).toMatchObject({ creatorNote: "My note", noteLang: "ja", postedAt: 123 });
  });

  it.each([
    { title: "a".repeat(201) },
    { note: "a".repeat(1001), noteLang: "ja" },
    { note: "A note" },
    { noteLang: "fr" },
    { note: "A note", noteLang: "fr" },
    { authorUrl: "http://example.com/author" },
    { authorUrl: "invalid" },
  ])("rejects invalid metadata %j", async (metadata) => {
    const { b, placeId } = await world();
    expect(
      await errorCode(
        b.as("creator").mutation(api.sources.add, { placeId, url: video, ...metadata }),
      ),
    ).toBe("invalid_input");
  });

  it("accepts boundary lengths and falls back to the adapter's author", async () => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("steward").mutation(api.sources.add, {
      placeId,
      url: "https://tiktok.com/@TEST_AUTHOR/video/1234567890",
      title: "a".repeat(200),
      note: "a".repeat(1000),
      noteLang: "en",
    });
    expect(await row(sourceId)).toMatchObject({
      authorHandle: "@test_author",
      authorUrl: "https://www.tiktok.com/@test_author",
    });
  });

  it("Google Maps stores only what the canonical URL holds", async () => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, {
      placeId,
      url: "https://www.google.com/maps/search/?api=1&query=place&query_place_id=test-place&utm_source=tracking&extra=discard",
    });
    const stored = await row(sourceId);
    expect(stored?.adapter).toBe("google_maps_link");
    expect(stored?.url).toBe(stored?.canonicalUrl);
    expect(stored?.url).not.toMatch(/tracking|discard/);
  });
});

describe("read sources", () => {
  it("the public sees only consented live sources of a demo place", async () => {
    const { b, placeId, source } = await world();
    await source();
    const consented = await source({ consent: true });
    await source({ consent: true, status: "hidden" });
    await source({ consent: true, status: "gone" });
    const listed: SourceView[] = await b.t.query(api.sources.listForPlace, { placeId });
    expect(listed.map((item) => item._id)).toEqual([consented]);
    expect(listed[0]).toMatchObject({ hasDemoConsent: true, addedByMe: false });
  });

  it("the person who added it and the place's managers see unconsented sources", async () => {
    const { b, placeId, source } = await world();
    const sourceId = await source();
    for (const name of ["other", "creator", "owner", "steward"]) {
      const listed = await b.as(name).query(api.sources.listForPlace, { placeId });
      expect(listed).toMatchObject([
        { _id: sourceId, hasDemoConsent: false, addedByMe: name === "other" },
      ]);
    }
    expect(await b.as("user").query(api.sources.listForPlace, { placeId })).toEqual([]);
  });

  it("a gone source is not listed", async () => {
    const { b, placeId, source } = await world();
    await source({ consent: true, status: "gone" });
    expect(await b.as("steward").query(api.sources.listForPlace, { placeId })).toEqual([]);
  });

  it("embed is rebuilt from the canonical URL", async () => {
    const { b, placeId, row } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, { placeId, url: video });
    await b.run((ctx) =>
      ctx.db.patch("source", sourceId, {
        canonicalUrl: "https://www.youtube.com/watch?v=12345678901",
      }),
    );
    const listed = await b.as("creator").query(api.sources.listForPlace, { placeId });
    const first = listed[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("Expected the added source to be listed");
    expect(first.embed).toEqual(embedFor("youtube", "https://www.youtube.com/watch?v=12345678901"));
    expect(await row(sourceId)).not.toHaveProperty("embed");
  });

  it("listForSteward shows every status and is forbidden to a creator", async () => {
    const { b, placeId, source } = await world();
    for (const status of SOURCE_STATUSES) await source({ status });
    const listed: SourceView[] = await b
      .as("steward")
      .query(api.sources.listForSteward, { placeId });
    expect(listed.map((item) => item.status)).toEqual([...SOURCE_STATUSES]);
    expect(await errorCode(b.as("creator").query(api.sources.listForSteward, { placeId }))).toBe(
      "forbidden",
    );
  });

  it("an unreadable place gives an empty list", async () => {
    const { b, creator, other } = await world();
    const placeId = await addPlace(b, { createdBy: creator });
    await addSource(b, { placeId, addedBy: other });
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
    expect(await b.as("other").query(api.sources.listForPlace, { placeId })).toEqual([]);
    await b.run((ctx) => ctx.db.delete("place", placeId));
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
  });
});

describe("consent and removal", () => {
  it("recordDemoConsent sets both fields and an audit entry", async () => {
    const { b, source, steward, row, audits } = await world();
    const sourceId = await source();
    await b.as("steward").mutation(api.sources.recordDemoConsent, { sourceId });
    const stored = await row(sourceId);
    expect(stored).toMatchObject({ demoConsentAt: expect.any(Number), demoConsentBy: steward });
    expect(await audits()).toMatchObject([
      {
        action: "source.demo_consent",
        actorPersonId: steward,
        actorKind: "person",
        targetId: sourceId,
      },
    ]);
    await b.as("steward").mutation(api.sources.recordDemoConsent, { sourceId });
    expect(await row(sourceId)).toEqual(stored);
    expect(await audits()).toHaveLength(1);
  });

  it("revokeDemoConsent clears both", async () => {
    const { b, source, row, audits, placeId } = await world();
    const sourceId = await source({ consent: true });
    await b.as("steward").mutation(api.sources.revokeDemoConsent, { sourceId });
    expect(await row(sourceId)).not.toHaveProperty("demoConsentAt");
    expect(await row(sourceId)).not.toHaveProperty("demoConsentBy");
    expect(await audits()).toMatchObject([
      { action: "source.demo_consent_revoked", actorKind: "person" },
    ]);
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
  });

  it("a creator cannot record demo consent", async () => {
    const { b, source } = await world();
    const sourceId = await source();
    for (const ref of [
      api.sources.recordDemoConsent,
      api.sources.revokeDemoConsent,
      api.sources.markGone,
    ]) {
      expect(await errorCode(b.as("creator").mutation(ref, { sourceId }))).toBe("forbidden");
    }
  });

  it("remove hides the source", async () => {
    const { b, source, row } = await world();
    const sourceId = await source();
    await b.as("other").mutation(api.sources.remove, { sourceId });
    expect(await row(sourceId)).toMatchObject({ status: "hidden" });
  });

  it("a creator cannot remove another creator's source on a place they do not edit", async () => {
    const { b, placeId, creator, row } = await world();
    const sourceId = await addSource(b, { placeId, addedBy: creator });
    expect(await errorCode(b.as("other").mutation(api.sources.remove, { sourceId }))).toBe(
      "forbidden",
    );
    expect((await row(sourceId))?.status).toBe("live");
  });

  it("the person who added a source can remove it after the place becomes unreadable", async () => {
    const { b, placeId, source, row } = await world();
    const sourceId = await source();
    await b.run((ctx) =>
      ctx.db.patch("place", placeId, { visibility: "draft", demoPublicBasis: undefined }),
    );
    expect(await b.as("other").query(api.sources.listForPlace, { placeId })).toEqual([]);
    await b.as("other").mutation(api.sources.remove, { sourceId });
    expect((await row(sourceId))?.status).toBe("hidden");
  });

  it("place editors may remove sources and stewards audit removing someone else's source", async () => {
    const { b, source, audits } = await world();
    await b.as("creator").mutation(api.sources.remove, { sourceId: await source() });
    expect(await audits()).toEqual([]);
    const sourceId = await source();
    await b.as("steward").mutation(api.sources.remove, { sourceId });
    expect(await audits()).toMatchObject([
      { action: "source.remove", targetId: sourceId, actorKind: "person" },
    ]);
  });

  it("markGone records a steward audit", async () => {
    const { b, source, row, audits } = await world();
    const sourceId = await source();
    await b.as("steward").mutation(api.sources.markGone, { sourceId });
    expect((await row(sourceId))?.status).toBe("gone");
    expect(await audits()).toMatchObject([{ action: "source.mark_gone", actorKind: "person" }]);
  });
});

describe("liveness", () => {
  it("recordCheck gone hides the source and writes a system audit", async () => {
    const { b, source, row, audits, placeId } = await world();
    const sourceId = await source({ consent: true });
    await b.t.mutation(internal.sources.recordCheck, { sourceId, result: "gone" });
    expect(await row(sourceId)).toMatchObject({
      status: "gone",
      lastCheckedAt: expect.any(Number),
    });
    expect(await audits()).toMatchObject([
      { actorKind: "system", action: "source.gone", targetId: sourceId },
    ]);
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
  });

  it("unknown keeps it live and sets lastCheckedAt", async () => {
    const { b, source, row, audits } = await world();
    const sourceId = await source();
    await b.t.mutation(internal.sources.recordCheck, { sourceId, result: "unknown" });
    expect(await row(sourceId)).toMatchObject({
      status: "live",
      lastCheckedAt: expect.any(Number),
    });
    expect(await audits()).toEqual([]);
  });

  it("listToCheck returns never-checked sources first", async () => {
    const { b, source } = await world();
    const checked = await source();
    await b.run((ctx) => ctx.db.patch("source", checked, { lastCheckedAt: 100 }));
    const unchecked = await source();
    const older = await source();
    await b.run((ctx) => ctx.db.patch("source", older, { lastCheckedAt: 50 }));
    await source({ status: "gone" });
    await source({ status: "hidden" });
    expect(await b.t.query(internal.sources.listToCheck, { limit: 2 })).toMatchObject([
      { sourceId: unchecked },
      { sourceId: older },
    ]);
    expect(await b.t.query(internal.sources.listToCheck, { limit: 0 })).toEqual([]);
  });

  it("checkSources marks a YouTube source gone when oEmbed answers 404 and keeps a link card live without calling fetch", async () => {
    const { b, placeId, row, source } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, { placeId, url: video });
    const link = await source();
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    expect(await b.t.action(internal.sourceChecks.checkSources, {})).toEqual({
      checked: 2,
      gone: 1,
    });
    expect(await row(sourceId)).toMatchObject({ status: "gone" });
    expect(await row(link)).toMatchObject({ status: "live", lastCheckedAt: expect.any(Number) });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toMatch(/^https:\/\/www.youtube.com\/oembed\?/);
  });

  it.each([401, 403])("YouTube %i stays live after the liveness action", async (status) => {
    const { b, placeId, row, audits } = await world();
    const { sourceId } = await b.as("creator").mutation(api.sources.add, { placeId, url: video });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(await b.t.action(internal.sourceChecks.checkSources, {})).toEqual({
      checked: 1,
      gone: 0,
    });
    expect(await row(sourceId)).toMatchObject({
      status: "live",
      lastCheckedAt: expect.any(Number),
    });
    expect(await audits()).toEqual([]);
  });

  it("a throwing liveness counts as unknown", async () => {
    const { b, source, row } = await world();
    const sourceId = await source();
    const next = await source();
    vi.spyOn(ADAPTERS.link_card, "liveness")
      .mockRejectedValueOnce(new TypeError("failed https://example.com/post?private=query-value"))
      .mockResolvedValueOnce("live");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await b.t.action(internal.sourceChecks.checkSources, {})).toEqual({
      checked: 2,
      gone: 0,
    });
    expect(await row(sourceId)).toMatchObject({
      status: "live",
      lastCheckedAt: expect.any(Number),
    });
    expect(await row(next)).toMatchObject({ status: "live", lastCheckedAt: expect.any(Number) });
    expect(log).toHaveBeenCalledWith(
      `checkSources: ${sourceId} TypeError: failed https://example.com/post?[redacted]`,
    );
    expect(log.mock.calls.flat().join(" ")).not.toContain("query-value");
  });

  it("an unknown adapter counts as unknown", async () => {
    const { b, source, row } = await world();
    const sourceId = await source();
    await b.run((ctx) => ctx.db.patch("source", sourceId, { adapter: "unknown-adapter" }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await b.t.action(internal.sourceChecks.checkSources, {})).toEqual({
      checked: 1,
      gone: 0,
    });
    expect(await row(sourceId)).toMatchObject({
      status: "live",
      lastCheckedAt: expect.any(Number),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a source that is no longer live is left alone", async () => {
    const { b, source, row, audits } = await world();
    for (const status of ["hidden", "gone"] as const) {
      const sourceId = await source({ status });
      await b.t.mutation(internal.sources.recordCheck, { sourceId, result: "gone" });
      await b.t.mutation(internal.sources.recordCheck, { sourceId, result: "live" });
      expect(await row(sourceId)).toMatchObject({ status });
      expect(await row(sourceId)).not.toHaveProperty("lastCheckedAt");
    }
    expect(await audits()).toEqual([]);
  });

  it("listToCheck caps its limit at 100", async () => {
    const { b, source } = await world();
    for (let i = 0; i < 102; i++) await source();
    expect(await b.t.query(internal.sources.listToCheck, { limit: 1000 })).toHaveLength(100);
  });
});
