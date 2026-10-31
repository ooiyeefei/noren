/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import nagasaki from "../regions/nagasaki.json";
import {
  addClaim,
  addCorrectedTranscript,
  addInterview,
  addOwner,
  addPage,
  addPerson,
  addPlace,
  addSource,
  errorCode,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { isPubliclyReadablePlace, isPublicSafeClaim } from "./lib/access";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");

async function checkSentencesCited(ctx: QueryCtx) {
  const pages = new Map((await ctx.db.query("pageVersion").collect()).map((p) => [p._id, p]));
  const claims = new Map((await ctx.db.query("claim").collect()).map((c) => [c._id, c]));
  for (const sentence of await ctx.db.query("pageSentence").collect()) {
    if (sentence.held) continue;
    const page = pages.get(sentence.pageVersionId);
    expect(page, `sentence ${sentence._id} has a page`).toBeDefined();
    expect(sentence.claimIds.length, `sentence ${sentence._id} has citations`).toBeGreaterThan(0);
    for (const id of sentence.claimIds) {
      const claim = claims.get(id);
      expect(claim?.placeId, `citation ${id} is about the page's place`).toBe(page!.placeId);
      expect(["published", "disputed"], `citation ${id} is citable`).toContain(claim?.status);
    }
  }
}

async function checkOwnerConfirmed(ctx: QueryCtx) {
  const places = await ctx.db.query("place").collect();
  const owners = await ctx.db.query("placeOwner").collect();
  const people = new Map((await ctx.db.query("person").collect()).map((p) => [p._id, p]));
  const audits = await ctx.db.query("auditLog").collect();
  const claims = await ctx.db.query("claim").collect();
  for (const place of places) {
    const ownerships = owners.filter((o) => o.placeId === place._id);
    if (!ownerships.length) continue;
    for (const claim of claims.filter(
      (c) => c.placeId === place._id && ["published", "disputed"].includes(c.status),
    )) {
      expect(claim.origin).not.toBe("open_text");
      expect(claim.confirmedAt, `confirmation time for ${claim._id}`).toBeDefined();
      expect(people.has(claim.reviewerId!), `reviewer exists for ${claim._id}`).toBe(true);
      expect(
        ownerships.some((o) => o.personId === claim.reviewerId),
        `reviewer owns ${place._id}`,
      ).toBe(true);
      expect(
        audits.some(
          (a) =>
            a.action === "claim.confirm" &&
            a.targetType === "claim" &&
            a.targetId === claim._id &&
            a.actorPersonId === claim.reviewerId,
        ),
        `confirmation audit for ${claim._id}`,
      ).toBe(true);
    }
  }
}

async function publicView(b: Backend, slug: string) {
  const place = await b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug });
  const map = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
  expect(map.every(isPubliclyReadablePlace)).toBe(true);
  if (place === null) {
    expect(map.some((p) => p.slug === slug)).toBe(false);
    const stored = await b.run(async (ctx) =>
      (await ctx.db.query("place").collect()).find((p) => p.slug === slug),
    );
    expect(stored, "exercise direct reads of the hidden place too").toBeDefined();
    expect(await b.t.query(api.pages.getPublished, { placeId: stored!._id })).toBeNull();
    expect(await b.t.query(api.sources.listForPlace, { placeId: stored!._id })).toEqual([]);
    expect(await errorCode(b.t.query(api.claims.listForPlace, { placeId: stored!._id }))).toBe(
      "not_found",
    );
    return null;
  }
  expect(isPubliclyReadablePlace(place)).toBe(true);
  expect(map.some((p) => p._id === place._id)).toBe(true);
  if (place.visibility === "demo_public") {
    expect(place.isMock).toBe(true);
    expect(place.demoPublicBasis).toBe("fictional");
  } else {
    expect(place.isMock).toBe(false);
    expect(place.demoPublicBasis).toBeUndefined();
  }
  const page = await b.t.query(api.pages.getPublished, { placeId: place._id });
  const sources = await b.t.query(api.sources.listForPlace, { placeId: place._id });
  // claims.listForPlace is management-only; pages.getPublished is the public claim surface.
  expect(await errorCode(b.t.query(api.claims.listForPlace, { placeId: place._id }))).toBe(
    "forbidden",
  );
  for (const source of sources) {
    expect(source.hasDemoConsent).toBe(true);
    const stored = await b.run((ctx) => ctx.db.get("source", source._id));
    expect(stored?.demoConsentAt).toBeDefined();
    expect(stored?.demoConsentBy).toBeDefined();
  }
  for (const claim of page?.claims ?? []) {
    expect(isPublicSafeClaim(claim, place)).toBe(true);
    expect(["published", "disputed"]).toContain(claim.status);
  }
  for (const sentence of page?.sentences ?? []) {
    expect(sentence.claimIds.length).toBeGreaterThan(0);
    for (const id of sentence.claimIds) {
      const claim = page!.claims.find((c) => c._id === id);
      expect(claim).toBeDefined();
      expect(isPublicSafeClaim(claim!, place)).toBe(true);
      expect((await b.run((ctx) => ctx.db.get("claim", id)))?.placeId).toBe(place._id);
    }
  }
  return { place, page, sources };
}

async function checkPublicDatabase(b: Backend) {
  for (const place of await b.run((ctx) => ctx.db.query("place").collect())) {
    if (place.visibility === "demo_public" || place.visibility === "public")
      await publicView(b, place.slug);
    if (place.visibility === "draft") {
      expect(
        await b.t.query(api.places.getBySlug, { regionId: place.regionId, slug: place.slug }),
      ).toBeNull();
      expect(await b.t.query(api.pages.getPublished, { placeId: place._id })).toBeNull();
      expect(await b.t.query(api.sources.listForPlace, { placeId: place._id })).toEqual([]);
      expect(await errorCode(b.t.query(api.claims.listForPlace, { placeId: place._id }))).toBe(
        "not_found",
      );
    }
  }
}

async function setup() {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  const owner = await addPerson(b, "owner", "business_owner", { isMock: true });
  const steward = await addPerson(b, "steward", "steward", { isMock: true });
  const placeId = await addPlace(b, { createdBy: creator });
  await addOwner(b, placeId, owner, steward);
  const interviewId = await addInterview(b, { placeId, interviewerId: creator });
  const { transcriptId, text } = await addCorrectedTranscript(b, {
    interviewId,
    createdBy: creator,
  });
  const claimIds: Id<"claim">[] = [];
  for (const kind of ["story", "fact"] as const) {
    claimIds.push(
      await b.as("creator").mutation(api.claims.proposeFromSpan, {
        transcriptId,
        spanStart: 0,
        spanEnd: text.length,
        textOriginal: text,
        kind,
      }),
    );
  }
  const confirm = async () => {
    for (const claimId of claimIds)
      await b.as("owner").mutation(api.claims.review, { claimId, action: "confirm" });
  };
  const compose = () => b.as("steward").mutation(api.pages.compose, { placeId });
  return { b, creator, owner, steward, placeId, interviewId, claimIds, confirm, compose };
}

async function openWorld() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const owner = await addPerson(b, "owner", "business_owner");
  const placeId = await addPlace(b, { createdBy: steward, kind: "landmark" });
  const text = "架空の公開ライセンス文。";
  const snippetId = await b.run((ctx) =>
    ctx.db.insert("openTextSnippet", {
      lang: "ja",
      text,
      licence: "CC0",
      sourceUrl: "https://example.com/invariant-open",
      attribution: "Fictional test author",
      retrievedAt: 1,
    }),
  );
  await b.as("steward").mutation(api.openText.link, { placeId, snippetId });
  const claimIds = await b.as("steward").mutation(api.openText.approveExcerpts, {
    snippetId,
    excerpts: [{ start: 0, end: text.length, kind: "story" }],
  });
  await b.as("steward").mutation(api.pages.compose, { placeId });
  return { b, steward, owner, placeId, claimIds };
}

describe("database invariants", () => {
  afterEach(() => vi.restoreAllMocks());
  it("a public real place shows its owner's published story and withdrawal hides it", async () => {
    // Before launch a real place's story stays private (publicPlaces.test.ts); this is the launched rule.
    vi.spyOn(region, "regionPolicy").mockReturnValue({
      ...region.regionPolicy("nagasaki"),
      realBusinessesDraftOnly: false,
    });
    const b = newBackend(modules);
    const creator = await addPerson(b, "creator", "creator");
    const steward = await addPerson(b, "steward", "steward");
    const owner = await addPerson(b, "owner", "business_owner");
    const placeId = await addPlace(b, { createdBy: creator, visibility: "public" });
    await addOwner(b, placeId, owner, steward);
    const interviewId = await addInterview(b, { placeId, interviewerId: creator });
    const { transcriptId } = await addCorrectedTranscript(b, { interviewId, createdBy: creator });
    const claimId = await addClaim(b, { placeId, origin: "interview", transcriptId });
    await b.as("owner").mutation(api.claims.review, { claimId, action: "confirm" });
    await b.as("steward").mutation(api.pages.compose, { placeId });
    const place = await b.run((ctx) => ctx.db.get("place", placeId));
    expect((await publicView(b, place!.slug))?.page?.claims).toMatchObject([
      { _id: claimId, isMock: false },
    ]);
    await b.run(checkOwnerConfirmed);
    await b.run(checkSentencesCited);
    await checkPublicDatabase(b);
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    expect((await publicView(b, place!.slug))?.page).toMatchObject({ sentences: [], claims: [] });
    await b.run(checkSentencesCited);
  });
  it("every held=false sentence cites a published or disputed claim of its place", async () => {
    const f = await setup();
    await f.confirm();
    const result = await f.compose();
    expect(result.sentenceCount).toBe(4);
    expect(result.heldCount).toBe(0);
    await f.b.run(checkSentencesCited);
  });

  it("withdrawing an interview never leaves an uncited sentence", async () => {
    const f = await setup();
    await f.confirm();
    await f.compose();
    await f.b.as("owner").mutation(api.interviews.withdraw, { interviewId: f.interviewId });
    await f.b.run(checkSentencesCited);
    await f.b.run(checkOwnerConfirmed);
    const sentences = await f.b.run((ctx) => ctx.db.query("pageSentence").collect());
    expect(sentences).toHaveLength(4);
    expect(sentences.every((s) => s.held)).toBe(true);
    for (const id of f.claimIds)
      expect((await f.b.run((ctx) => ctx.db.get("claim", id)))?.status).toBe("hidden");
  });

  it("a disputed pair keeps the page cited", async () => {
    const f = await setup();
    await f.confirm();
    await f.compose();
    await f.b
      .as("steward")
      .mutation(api.claims.markDisputed, { claimIdA: f.claimIds[0]!, claimIdB: f.claimIds[1]! });
    await f.compose();
    await f.b.run(checkSentencesCited);
    await f.b.run(checkOwnerConfirmed);
    const page = await f.b.as("owner").query(api.pages.getPublished, { placeId: f.placeId });
    expect(page?.sentences).toHaveLength(4);
    expect(page?.claims.every((c) => c.status === "disputed")).toBe(true);
  });

  it("an owned place publishes only owner-confirmed claims", async () => {
    const f = await setup();
    await f.confirm();
    await f.compose();
    expect(
      (await f.b.run((ctx) => ctx.db.query("claim").collect())).every(
        (c) => c.status === "published",
      ),
    ).toBe(true);
    await f.b.run(checkOwnerConfirmed);
  });

  it("attaching an owner hides published open text", async () => {
    const f = await openWorld();
    await f.b.run(checkSentencesCited);
    await f.b
      .as("steward")
      .mutation(api.places.attachOwner, { placeId: f.placeId, personId: f.owner });
    await f.b.run(checkOwnerConfirmed);
    await f.b.run(checkSentencesCited);
    expect(
      (await f.b.run((ctx) => ctx.db.query("claim").collect())).every(
        (c) => c.status === "proposed",
      ),
    ).toBe(true);
    expect(
      (await f.b.as("owner").query(api.pages.getPublished, { placeId: f.placeId }))?.sentences,
    ).toEqual([]);
  });

  it("compose never publishes a proposed claim", async () => {
    const f = await setup();
    await f.b
      .as("owner")
      .mutation(api.claims.review, { claimId: f.claimIds[0]!, action: "confirm" });
    await f.compose();
    expect((await f.b.run((ctx) => ctx.db.get("claim", f.claimIds[1]!)))?.status).toBe("proposed");
    const page = await f.b.as("owner").query(api.pages.getPublished, { placeId: f.placeId });
    expect(page?.sentences).toHaveLength(2);
    expect(page?.sentences.every((s) => !s.claimIds.includes(f.claimIds[1]!))).toBe(true);
    await f.b.run(checkSentencesCited);
    await f.b.run(checkOwnerConfirmed);
  });

  it("a signed-out reader sees no draft place", async () => {
    const f = await setup();
    await f.confirm();
    await f.compose();
    await checkPublicDatabase(f.b);
    expect(await f.b.t.query(api.places.listForMap, { regionId: "nagasaki" })).toEqual([]);
  });

  it("a real place shown by mistake exposes neither licensed text nor interview claims", async () => {
    const f = await openWorld();
    const creator = await addPerson(f.b, "creator", "creator", { isMock: true });
    const interviewId = await addInterview(f.b, { placeId: f.placeId, interviewerId: creator });
    const { transcriptId } = await addCorrectedTranscript(f.b, { interviewId, createdBy: creator });
    const unsafe = await addClaim(f.b, {
      placeId: f.placeId,
      origin: "interview",
      transcriptId,
      status: "published",
      isMock: true,
    });
    await f.b.as("steward").mutation(api.pages.compose, { placeId: f.placeId });
    await f.b.t.run((ctx) =>
      ctx.db.patch("place", f.placeId, { visibility: "demo_public", demoPublicBasis: "fictional" }),
    );
    const slug = (await f.b.run((ctx) => ctx.db.get("place", f.placeId)))!.slug;
    const view = await publicView(f.b, slug);
    expect(view).toBeNull();
    const managed = await f.b.as("steward").query(api.pages.getPublished, { placeId: f.placeId });
    expect(managed?.sentences).toHaveLength(4);
    expect(managed?.claims.map((c) => c._id)).toEqual([...f.claimIds, unsafe]);
    const business = await addPlace(f.b, {
      createdBy: f.steward,
      kind: "business",
      isMock: false,
      slug: "mistaken-real-business",
    });
    // Simulate a dashboard/import mistake outside the write gate.
    await f.b.t.run((ctx) =>
      ctx.db.patch("place", business, { visibility: "demo_public", demoPublicBasis: "fictional" }),
    );
    const realClaim = await addClaim(f.b, {
      placeId: business,
      origin: "interview",
      transcriptId: await f.b.run(async (ctx) => {
        const interviewId = await ctx.db.insert("interview", {
          placeId: business,
          interviewerId: creator,
          language: "ja",
          status: "consent_pending",
          isMock: true,
        });
        return ctx.db.insert("transcript", {
          interviewId,
          version: 1,
          lang: "ja",
          origin: "human_corrected",
          createdBy: creator,
          segments: [{ start: 0, end: 1, text: "架空の文。" }],
        });
      }),
      status: "published",
      isMock: true,
    });
    await addPage(f.b, {
      placeId: business,
      sentences: [{ lang: "ja", text: "架空の文。", claimIds: [realClaim] }],
    });
    expect(await publicView(f.b, "mistaken-real-business")).toBeNull();
    expect(await f.b.t.query(api.pages.getPublished, { placeId: business })).toBeNull();
    await checkPublicDatabase(f.b);
  });

  it("public sources all have demo consent", async () => {
    const f = await openWorld();
    const visible = await addSource(f.b, { placeId: f.placeId, addedBy: f.steward });
    const hidden = await addSource(f.b, { placeId: f.placeId, addedBy: f.steward });
    await f.b.as("steward").mutation(api.sources.recordDemoConsent, { sourceId: visible });
    await f.b.run((ctx) => ctx.db.patch("place", f.placeId, { isMock: true }));
    await f.b.as("steward").mutation(api.places.setVisibility, {
      placeId: f.placeId,
      visibility: "demo_public",
      confirmFictional: true,
    });
    const slug = (await f.b.run((ctx) => ctx.db.get("place", f.placeId)))!.slug;
    const view = await publicView(f.b, slug);
    expect(view?.sources.map((s) => s._id)).toEqual([visible]);
    expect(view?.sources.some((s) => s._id === hidden)).toBe(false);
    await f.b.as("steward").mutation(api.sources.revokeDemoConsent, { sourceId: visible });
    expect((await publicView(f.b, slug))?.sources).toEqual([]);
    await checkPublicDatabase(f.b);
  });

  it("the Demo Cafe path through public functions passes invariants 2 to 5", async () => {
    const b = newBackend(modules);
    await addPerson(b, "creator", "creator", { isMock: true });
    const owner = await addPerson(b, "owner", "business_owner", { isMock: true });
    await addPerson(b, "steward", "steward", { isMock: true });
    const { placeId, slug } = await b.as("creator").mutation(api.places.create, {
      regionId: "nagasaki",
      kind: "business",
      names: [{ lang: "en", script: "latin", value: "Demo Cafe (fictional)" }],
      pin: { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng },
    });
    await b.as("steward").mutation(api.places.attachOwner, { placeId, personId: owner });
    const { sourceId } = await b.as("creator").mutation(api.sources.add, {
      placeId,
      url: "https://example.com/demo-cafe",
      title: "Fictional demo source",
    });
    await b.as("steward").mutation(api.sources.recordDemoConsent, { sourceId });
    const interviewId = await b
      .as("creator")
      .mutation(api.interviews.create, { placeId, language: "ja" });
    await b.as("creator").mutation(api.interviews.recordConsent, {
      interviewId,
      scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
      textVersion: nagasaki.consent.textVersion,
      textLang: "ja",
      assisted: false,
    });
    const text = "これは架空のデモカフェの物語です。";
    const transcriptId = await b.as("creator").mutation(api.interviews.saveCorrection, {
      interviewId,
      segments: [{ start: 0, end: 3, text }],
    });
    const claimId = await b.as("creator").mutation(api.claims.proposeFromSpan, {
      transcriptId,
      spanStart: 0,
      spanEnd: text.length,
      textOriginal: text,
      kind: "story",
    });
    await b.as("owner").mutation(api.claims.review, { claimId, action: "confirm" });
    await b.as("steward").mutation(api.pages.compose, { placeId });
    await b.as("steward").mutation(api.places.setVisibility, {
      placeId,
      visibility: "demo_public",
      confirmFictional: true,
    });
    await b.run(checkSentencesCited);
    await b.run(checkOwnerConfirmed);
    await checkPublicDatabase(b);
    const view = await publicView(b, slug);
    expect(view?.page?.sentences).toHaveLength(2);
    expect(view?.sources).toHaveLength(1);
    await b.run(async (ctx) => {
      const places = new Map((await ctx.db.query("place").collect()).map((p) => [p._id, p]));
      for (const table of ["place", "interview", "claim", "source"] as const) {
        const rows = await ctx.db.query(table).collect();
        expect(rows.length, table).toBeGreaterThan(0);
        for (const row of rows) expect(row.isMock, `${table} ${row._id}`).toBe(true);
      }
      for (const table of ["placeName", "pin", "pageVersion"] as const) {
        const rows = await ctx.db.query(table).collect();
        expect(rows.length, table).toBeGreaterThan(0);
        for (const row of rows)
          expect(places.get(row.placeId)?.isMock, `${table} parent`).toBe(true);
      }
      const interviews = new Map(
        (await ctx.db.query("interview").collect()).map((row) => [row._id, row]),
      );
      for (const table of ["consent", "transcript"] as const) {
        const rows = await ctx.db.query(table).collect();
        expect(rows.length, table).toBeGreaterThan(0);
        for (const row of rows)
          expect(interviews.get(row.interviewId)?.isMock, `${table} parent`).toBe(true);
      }
      const pages = new Map(
        (await ctx.db.query("pageVersion").collect()).map((row) => [row._id, row]),
      );
      const sentences = await ctx.db.query("pageSentence").collect();
      expect(sentences).toHaveLength(2);
      for (const sentence of sentences)
        expect(places.get(pages.get(sentence.pageVersionId)!.placeId)?.isMock).toBe(true);
    });
  });
});
