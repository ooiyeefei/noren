/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  addClaim,
  addCorrectedTranscript,
  addInterview,
  addOwner,
  addPage,
  addPerson,
  addPlace,
  errorCode,
  newBackend,
} from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { disputeClaims, hideClaims } from "./lib/claimEffects";
import type { PageClaimView, PageView } from "./pages";

const modules = import.meta.glob("./**/*.ts");
async function setup(
  options: { visibility?: "draft" | "demo_public"; kind?: "landmark"; isMock?: boolean } = {},
) {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward", { isMock: true });
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  const owner = await addPerson(b, "owner", "business_owner", { isMock: true });
  const placeId = await addPlace(b, { createdBy: creator, ...options });
  const interviewId = await addInterview(b, { placeId, interviewerId: creator });
  const { transcriptId } = await addCorrectedTranscript(b, { interviewId, createdBy: creator });
  return {
    b,
    steward,
    creator,
    owner,
    placeId,
    transcriptId,
    compose: () => b.as("steward").mutation(api.pages.compose, { placeId }),
    page: (): Promise<PageView | null> =>
      b.as("creator").query(api.pages.getPublished, { placeId }),
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function story(
  f: Fixture,
  options: { kind?: "story" | "fact"; status?: "owner_confirmed" | "published" } = {},
) {
  return addClaim(f.b, {
    placeId: f.placeId,
    transcriptId: f.transcriptId,
    origin: "interview",
    status: "owner_confirmed",
    ...options,
  });
}
async function translation(
  f: Fixture,
  claimId: Id<"claim">,
  origin: "machine" | "human",
  text: string,
) {
  await f.b.run((ctx) =>
    ctx.db.insert("claimTranslation", {
      claimId,
      lang: "en",
      text,
      origin,
      ...(origin === "human" ? { reviewedBy: "Mock reviewer" } : {}),
    }),
  );
}

describe("place pages", () => {
  it("compose publishes owner-confirmed claims and writes one sentence per story or fact claim per locale", async () => {
    const f = await setup();
    const ids = [await story(f), await story(f, { kind: "fact" })];
    await addClaim(f.b, { placeId: f.placeId, kind: "topic", status: "owner_confirmed" });
    await addClaim(f.b, { placeId: f.placeId, status: "proposed" });
    const result = await f.compose();
    expect(result).toMatchObject({
      version: 1,
      sentenceCount: 4,
      heldCount: 0,
      publishedClaims: 3,
    });
    const page = await f.page();
    expect(page?.sentences.map((row) => [row.lang, row.ordinal])).toEqual([
      ["en", 0],
      ["en", 1],
      ["ja", 0],
      ["ja", 1],
    ]);
    for (const id of ids) {
      expect(await f.b.run((ctx) => ctx.db.get("claim", id))).toMatchObject({
        status: "published",
      });
      expect(page?.sentences.filter((row) => row.claimIds.includes(id))).toHaveLength(2);
    }
    expect(page?.claims.filter((row) => row.kind === "topic")).toHaveLength(1);
    expect(await f.b.run((ctx) => ctx.db.get("pageVersion", result.pageVersionId))).toMatchObject({
      status: "published",
      reviewedBy: f.steward,
      generatedBy: "deterministic-v1",
    });
  });

  it.each(["machine", "human"] as const)(
    "a sentence for the other locale uses the translation and is labelled %s",
    async (origin) => {
      const f = await setup();
      const id = await story(f);
      await translation(f, id, origin, `Mock ${origin} translation.`);
      await f.compose();
      const page = await f.page();
      expect(page?.sentences.find((row) => row.lang === "en")).toMatchObject({
        text: `Mock ${origin} translation.`,
        translation: origin,
        textLang: "en",
      });
      expect(page?.sentences.find((row) => row.lang === "ja")).toMatchObject({
        translation: "original",
        textLang: "ja",
      });
      expect(page?.claims[0]?.translations).toHaveLength(1);
      expect(page?.claims[0]?.translations[0]?.origin).toBe(origin);
    },
  );

  it("a claim without a translation appears in its original language with textLang set", async () => {
    const f = await setup();
    await story(f);
    await f.compose();
    const page = await f.page();
    expect(page?.sentences.find((row) => row.lang === "en")).toMatchObject({
      text: page?.claims[0]?.textOriginal,
      textLang: "ja",
      translation: "original",
    });
  });

  it("compose with nothing citable is conflict and writes nothing", async () => {
    const f = await setup();
    const id = await addClaim(f.b, {
      placeId: f.placeId,
      kind: "topic",
      status: "owner_confirmed",
    });
    expect(await errorCode(f.compose())).toBe("conflict");
    expect(await f.b.run((ctx) => ctx.db.get("claim", id))).toMatchObject({
      status: "owner_confirmed",
    });
    for (const table of ["pageVersion", "pageSentence", "auditLog"] as const) {
      expect(await f.b.run((ctx) => ctx.db.query(table).take(10))).toEqual([]);
    }
  });

  it("a creator or owner is forbidden", async () => {
    const f = await setup();
    await addOwner(f.b, f.placeId, f.owner, f.steward);
    await story(f);
    for (const name of ["creator", "owner"]) {
      expect(
        await errorCode(f.b.as(name).mutation(api.pages.compose, { placeId: f.placeId })),
      ).toBe("forbidden");
    }
    expect(await errorCode(f.b.t.mutation(api.pages.compose, { placeId: f.placeId }))).toBe(
      "unauthenticated",
    );
  });

  it("version numbers increase", async () => {
    const f = await setup();
    await story(f);
    expect((await f.compose()).version).toBe(1);
    expect(await f.compose()).toMatchObject({ version: 2, publishedClaims: 0 });
    expect((await f.page())?.version).toBe(2);
  });

  it("an audit entry records the counts", async () => {
    const f = await setup();
    await story(f);
    const result = await f.compose();
    const entries = await f.b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(entries.find((row) => row.action === "page.compose")).toMatchObject({
      actorKind: "person",
      actorPersonId: f.steward,
      targetId: result.pageVersionId,
      diff: { version: 1, sentenceCount: 2, heldCount: 0, publishedClaims: 1 },
    });
  });

  it("a sentence whose claim was hidden after composing is held and not returned", async () => {
    const f = await setup();
    const id = await story(f);
    await f.compose();
    expect(await f.b.run((ctx) => hideClaims(ctx, [id], { by: f.steward, now: 123 }))).toEqual({
      hidden: 1,
      sentencesHeld: 2,
    });
    expect(await f.b.run((ctx) => ctx.db.query("pageSentence").take(10))).toEqual(
      expect.arrayContaining([expect.objectContaining({ held: true })]),
    );
    expect(await f.page()).toMatchObject({ sentences: [], claims: [] });
  });

  it("getPublished rechecks claim status even when the stored sentence is not held", async () => {
    const f = await setup();
    const id = await story(f);
    await f.compose();
    await f.b.run((ctx) => ctx.db.patch("claim", id, { status: "hidden" }));
    expect(await f.page()).toMatchObject({ sentences: [], claims: [] });
  });

  it("getPublished returns null for a draft to a signed-out visitor and the page to the creator", async () => {
    const f = await setup();
    await story(f);
    await f.compose();
    expect(await f.b.t.query(api.pages.getPublished, { placeId: f.placeId })).toBeNull();
    expect((await f.page())?.sentences).toHaveLength(2);
  });

  it("on a demo_public mock place the public sees the mock claims' sentences", async () => {
    const f = await setup({ visibility: "demo_public", isMock: true });
    await story(f);
    await f.compose();
    const page = await f.b.t.query(api.pages.getPublished, { placeId: f.placeId });
    expect(page?.sentences).toHaveLength(2);
    expect(page?.claims[0]?.isMock).toBe(true);
  });

  it("on a fictional demo_public place the public sees open-text sentences with licence and attribution", async () => {
    const f = await setup({ visibility: "demo_public", kind: "landmark", isMock: true });
    const snippetId = await f.b.run((ctx) =>
      ctx.db.insert("openTextSnippet", {
        placeId: f.placeId,
        lang: "ja",
        text: "架空のテスト文。",
        licence: "CC-BY-SA-4.0",
        sourceUrl: "https://example.com/fictional-landmark",
        attribution: "Fictional test author",
        revisionRef: "test-revision",
        retrievedAt: 1,
      }),
    );
    const [id] = await f.b.as("steward").mutation(api.openText.approveExcerpts, {
      snippetId,
      excerpts: [{ start: 0, end: 8, kind: "story" }],
    });
    await f.compose();
    const page = await f.b.t.query(api.pages.getPublished, { placeId: f.placeId });
    expect(page?.sentences).toHaveLength(2);
    expect(page?.claims[0]).toMatchObject({
      _id: id,
      origin: "open_text",
      isMock: false,
      aiAssisted: false,
      openText: {
        licence: "CC-BY-SA-4.0",
        attribution: "Fictional test author",
        revisionRef: "test-revision",
      },
    });
  });

  it("a real interview claim on a demo_public place is not shown to the public but is shown to a steward", async () => {
    const f = await setup({ visibility: "demo_public", isMock: true });
    const id = await addClaim(f.b, {
      placeId: f.placeId,
      origin: "interview",
      transcriptId: f.transcriptId,
      status: "published",
      isMock: false,
    });
    await f.b.run((ctx) => ctx.db.patch("claim", id, { modelVersion: "test-model" }));
    await f.compose();
    expect(await f.b.t.query(api.pages.getPublished, { placeId: f.placeId })).toMatchObject({
      sentences: [],
      claims: [],
    });
    await addPerson(f.b, "visitor", "user", { isMock: true });
    expect(
      await f.b.as("visitor").query(api.pages.getPublished, { placeId: f.placeId }),
    ).toMatchObject({ sentences: [], claims: [] });
    const page = await f.b.as("steward").query(api.pages.getPublished, { placeId: f.placeId });
    expect(page?.sentences).toHaveLength(2);
    expect(page?.claims[0]).toMatchObject({ _id: id, aiAssisted: true });
  });

  it("a mock claim on a real landmark is hidden from public sentences, cautions and topics", async () => {
    const f = await setup({ visibility: "demo_public", kind: "landmark", isMock: true });
    const id = await story(f);
    for (const kind of ["caution", "topic"] as const) {
      await addClaim(f.b, {
        placeId: f.placeId,
        kind,
        status: "published",
        isMock: true,
        cautionType: kind === "caution" ? "cash_only" : undefined,
        authorId: f.owner,
      });
    }
    await f.compose();
    await f.b.t.run((ctx) => ctx.db.patch("place", f.placeId, { isMock: false }));
    expect(await f.b.t.query(api.pages.getPublished, { placeId: f.placeId })).toBeNull();
    const managed = await f.page();
    expect(managed?.sentences).toHaveLength(2);
    expect(managed?.claims).toHaveLength(3);
    expect(managed?.claims.find((claim) => claim._id === id)?.isMock).toBe(true);
  });

  it("published cautions are returned for the caution list", async () => {
    const f = await setup({ visibility: "demo_public", isMock: true });
    await story(f);
    const id = await addClaim(f.b, {
      placeId: f.placeId,
      kind: "caution",
      status: "published",
      cautionType: "cash_only",
      authorId: f.owner,
    });
    const privateId = await addClaim(f.b, {
      placeId: f.placeId,
      kind: "topic",
      status: "published",
      isMock: false,
    });
    await f.compose();
    expect((await f.page())?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: id, kind: "caution", cautionType: "cash_only" }),
      ]),
    );
    const page = await f.b.t.query(api.pages.getPublished, { placeId: f.placeId });
    expect(page?.claims.some((row: PageClaimView) => row._id === privateId)).toBe(false);
  });

  it("disputed claims are returned with disputedWith", async () => {
    const f = await setup();
    const a = await story(f, { status: "published" });
    const b = await story(f, { status: "published" });
    await f.b.run((ctx) => disputeClaims(ctx, a, b, { by: f.steward, now: 1 }));
    await f.compose();
    expect((await f.page())?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: a, status: "disputed", disputedWith: b }),
        expect.objectContaining({ _id: b, status: "disputed", disputedWith: a }),
      ]),
    );
  });

  it("no field of PageView is named like a rating or score", async () => {
    const f = await setup();
    await story(f);
    await f.compose();
    function check(value: unknown) {
      if (typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(/rating|score|sentiment/i);
        check(child);
      }
    }
    const page = await f.page();
    expect(page).not.toBeNull();
    check(page);
  });

  it("unquoted sentences are held and the latest published version remains readable", async () => {
    const f = await setup();
    const id = await addClaim(f.b, { placeId: f.placeId, status: "published" });
    await addPage(f.b, {
      placeId: f.placeId,
      sentences: [{ lang: "ja", text: "Mock old page.", claimIds: [id] }],
    });
    const result = await f.compose();
    expect(result).toMatchObject({ version: 2, sentenceCount: 2, heldCount: 2 });
    expect(await f.b.run((ctx) => ctx.db.get("pageVersion", result.pageVersionId))).toMatchObject({
      status: "held",
    });
    expect((await f.page())?.version).toBe(1);
  });

  it("missing places and places with no published version return null", async () => {
    const f = await setup();
    expect(await f.page()).toBeNull();
    await f.b.run((ctx) => ctx.db.delete("place", f.placeId));
    expect(await f.page()).toBeNull();
    expect(await errorCode(f.compose())).toBe("not_found");
  });
});
