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
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ClaimView, ExtractedItem } from "./claims";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  const steward = await addPerson(b, "steward", "steward", { isMock: true });
  const owner = await addPerson(b, "owner", "business_owner", { isMock: true });
  const otherOwner = await addPerson(b, "other-owner", "business_owner", { isMock: true });
  await addPerson(b, "other-creator", "creator", { isMock: true });
  await addPerson(b, "visitor", "user", { isMock: true });
  const placeId = await addPlace(b, { createdBy: creator });
  await addOwner(b, placeId, owner, steward);
  const otherPlaceId = await addPlace(b, { createdBy: creator });
  await addOwner(b, otherPlaceId, otherOwner, steward);
  const interviewId = await addInterview(b, {
    placeId,
    interviewerId: creator,
    ownerPersonId: owner,
    status: "claims_proposed",
  });
  const { transcriptId, text } = await addCorrectedTranscript(b, {
    interviewId,
    createdBy: creator,
    segments: [
      { start: 0, end: 2, text: "これは架空のテスト店の話です。" },
      { start: 2, end: 4, text: "  現金のみのテストです。" },
    ],
  });
  const claim = (status: "proposed" | "owner_confirmed" | "published" | "hidden" = "proposed") =>
    addClaim(b, { placeId, transcriptId, origin: "interview", status });
  const proposal = {
    transcriptId,
    spanStart: 0,
    spanEnd: text.length,
    textOriginal: "  架空の店のテスト用の話。  ",
    kind: "story" as const,
  };
  const item: ExtractedItem = {
    kind: "story",
    textOriginal: "架空の店のテスト用の話。",
    quote: text.slice(0, 10),
    spanStart: 0,
    spanEnd: 10,
  };
  const extract = (
    items: ExtractedItem[],
    overrides: { transcriptId?: Id<"transcript">; interviewId?: Id<"interview"> } = {},
  ) =>
    b.t.mutation(internal.claims.insertExtracted, {
      interviewId,
      transcriptId,
      modelVersion: "mock-extractor-v1",
      items,
      ...overrides,
    });
  const translations = (claimId: Id<"claim">) =>
    b.run((ctx) =>
      ctx.db
        .query("claimTranslation")
        .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claimId))
        .take(20),
    );
  const machine = async (
    claimId: Id<"claim">,
    overrides: { sourceText?: string; text?: string; lang?: string } = {},
  ) => {
    const source = await b.run((ctx) => ctx.db.get("claim", claimId));
    return b.t.mutation(internal.claims.saveMachineTranslation, {
      claimId,
      lang: "en",
      sourceText: source!.textOriginal,
      text: "Fictional test translation.",
      modelVersion: "mock-translator-v1",
      ...overrides,
    });
  };
  return {
    b,
    creator,
    owner,
    steward,
    placeId,
    otherPlaceId,
    interviewId,
    transcriptId,
    text,
    claim,
    proposal,
    item,
    extract,
    translations,
    machine,
  };
}

describe("claims owner review", () => {
  it("the owner confirms a proposed claim, which gets confirmedAt", async () => {
    const f = await setup();
    const claimId = await f.claim();
    expect(
      await f.b.as("owner").mutation(api.claims.review, { claimId, action: "confirm" }),
    ).toBeNull();
    const claim = await f.b.run((ctx) => ctx.db.get("claim", claimId));
    expect(claim).toMatchObject({ status: "owner_confirmed", reviewerId: f.owner });
    expect(claim?.confirmedAt).toEqual(expect.any(Number));
  });

  it("the owner edits a claim: new text, translations deleted, quote kept", async () => {
    const f = await setup();
    const claimId = await f.claim("published");
    await f.machine(claimId);
    const before = await f.b.run((ctx) => ctx.db.get("claim", claimId));
    const page = await addPage(f.b, {
      placeId: f.placeId,
      sentences: [{ lang: "ja", text: "架空の引用。", claimIds: [claimId] }],
    });
    await f.b
      .as("owner")
      .mutation(api.claims.review, { claimId, action: "edit", text: "  修正したテスト文。  " });
    expect(await f.b.run((ctx) => ctx.db.get("claim", claimId))).toMatchObject({
      textOriginal: "修正したテスト文。",
      status: "owner_confirmed",
      quote: before?.quote,
      spanStart: before?.spanStart,
      spanEnd: before?.spanEnd,
    });
    expect(await f.translations(claimId)).toEqual([]);
    const sentences = await f.b.run((ctx) =>
      ctx.db
        .query("pageSentence")
        .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) => q.eq("pageVersionId", page))
        .take(10),
    );
    expect(sentences[0]?.held).toBe(true);
  });

  it("the owner removes a claim, which becomes hidden", async () => {
    const f = await setup();
    const claimId = await f.claim();
    await f.b.as("owner").mutation(api.claims.review, { claimId, action: "remove" });
    expect(await f.b.run((ctx) => ctx.db.get("claim", claimId))).toMatchObject({
      status: "hidden",
    });
  });

  it("a steward, a creator and another place's owner are forbidden", async () => {
    const f = await setup();
    const claimId = await f.claim();
    for (const name of ["steward", "creator", "other-owner"]) {
      for (const action of ["confirm", "edit", "remove"] as const) {
        expect(
          await errorCode(
            f.b.as(name).mutation(api.claims.review, { claimId, action, text: "テスト" }),
          ),
        ).toBe("forbidden");
      }
    }
  });

  it("editing with blank, missing or overlong text is invalid_input", async () => {
    const f = await setup();
    const claimId = await f.claim();
    for (const text of [" \n ", undefined, "x".repeat(1001)]) {
      expect(
        await errorCode(
          f.b.as("owner").mutation(api.claims.review, { claimId, action: "edit", text }),
        ),
      ).toBe("invalid_input");
    }
  });

  it("the owner cannot confirm an open-text claim on their place", async () => {
    const f = await setup();
    const claimId = await addClaim(f.b, { placeId: f.placeId, origin: "open_text" });
    expect(
      await errorCode(f.b.as("owner").mutation(api.claims.review, { claimId, action: "confirm" })),
    ).toBe("conflict");
  });

  it("the last review moves the interview to done and deletes its audio", async () => {
    const f = await setup();
    const older = await f.claim();
    const latest = await addCorrectedTranscript(f.b, {
      interviewId: f.interviewId,
      createdBy: f.creator,
    });
    const final = await addClaim(f.b, {
      placeId: f.placeId,
      transcriptId: latest.transcriptId,
      origin: "interview",
    });
    const audioStorageId = await f.b.t.run((ctx) => ctx.storage.store(new Blob(["mock audio"])));
    await f.b.run((ctx) => ctx.db.patch("interview", f.interviewId, { audioStorageId }));
    await f.b.as("owner").mutation(api.claims.review, { claimId: final, action: "confirm" });
    expect(await f.b.run((ctx) => ctx.db.get("interview", f.interviewId))).toMatchObject({
      status: "owner_review",
      audioStorageId,
    });
    expect(await f.b.t.run(async (ctx) => (await ctx.storage.get(audioStorageId)) !== null)).toBe(
      true,
    );
    await f.b.as("owner").mutation(api.claims.review, { claimId: older, action: "remove" });
    const interview = await f.b.run((ctx) => ctx.db.get("interview", f.interviewId));
    expect(interview?.status).toBe("done");
    expect(interview?.audioStorageId).toBeUndefined();
    expect(await f.b.t.run((ctx) => ctx.storage.get(audioStorageId))).toBeNull();
  });

  it("the first review moves claims_proposed to owner_review", async () => {
    const f = await setup();
    const claimId = await f.claim();
    await f.claim();
    await f.b.as("owner").mutation(api.claims.review, { claimId, action: "confirm" });
    expect(await f.b.run((ctx) => ctx.db.get("interview", f.interviewId))).toMatchObject({
      status: "owner_review",
    });
  });

  it("a missing claim is not_found", async () => {
    const f = await setup();
    const claimId = await f.claim();
    await f.b.run((ctx) => ctx.db.delete("claim", claimId));
    expect(
      await errorCode(f.b.as("owner").mutation(api.claims.review, { claimId, action: "confirm" })),
    ).toBe("not_found");
  });
});

describe("claims proposals", () => {
  it("proposeFromSpan stores the slice as the quote", async () => {
    const f = await setup();
    await f.b.run((ctx) => ctx.db.patch("interview", f.interviewId, { status: "correcting" }));
    const claimId = await f.b.as("creator").mutation(api.claims.proposeFromSpan, f.proposal);
    const claim = await f.b.run((ctx) => ctx.db.get("claim", claimId));
    expect(claim).toMatchObject({
      quote: f.text,
      textOriginal: f.proposal.textOriginal.trim(),
      spanStart: 0,
      spanEnd: f.text.length,
      sourceTranscriptId: f.transcriptId,
      status: "proposed",
      langOriginal: "ja",
      origin: "interview",
    });
    expect(claim?.modelVersion).toBeUndefined();
    expect(await f.b.run((ctx) => ctx.db.get("interview", f.interviewId))).toMatchObject({
      status: "claims_proposed",
    });
    const audits = await f.b.run((ctx) => ctx.db.query("auditLog").take(20));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorKind: "person",
      actorPersonId: f.creator,
      action: "claim.propose",
      targetId: claimId,
    });
  });

  it("proposeFromSpan stores an exact selected slice containing a surrogate pair", async () => {
    const f = await setup();
    const text = "これはテスト。\n喫茶𠮷の架空の話。";
    const { transcriptId } = await addCorrectedTranscript(f.b, {
      interviewId: f.interviewId,
      createdBy: f.creator,
      segments: text.split("\n").map((text, start) => ({ start, end: start + 1, text })),
    });
    const quote = "喫茶𠮷";
    const spanStart = text.indexOf(quote);
    const spanEnd = spanStart + quote.length;
    const claimId = await f.b
      .as("creator")
      .mutation(api.claims.proposeFromSpan, { ...f.proposal, transcriptId, spanStart, spanEnd });
    expect(await f.b.run((ctx) => ctx.db.get("claim", claimId))).toMatchObject({
      quote,
      spanStart,
      spanEnd,
    });
    expect(await f.extract([{ ...f.item, quote, spanStart, spanEnd }], { transcriptId })).toEqual({
      inserted: 1,
      dropped: 0,
    });
  });

  it("a span over a machine transcript is conflict", async () => {
    const f = await setup();
    const transcriptId = await f.b.run((ctx) =>
      ctx.db.insert("transcript", {
        interviewId: f.interviewId,
        version: 2,
        lang: "ja",
        origin: "machine",
        modelVersion: "mock-transcriber",
        segments: [{ start: 0, end: 1, text: f.text }],
      }),
    );
    expect(
      await errorCode(
        f.b.as("creator").mutation(api.claims.proposeFromSpan, { ...f.proposal, transcriptId }),
      ),
    ).toBe("conflict");
    expect(await errorCode(f.extract([f.item], { transcriptId }))).toBe("conflict");
  });

  it("a span over an older corrected version is conflict", async () => {
    const f = await setup();
    await addCorrectedTranscript(f.b, { interviewId: f.interviewId, createdBy: f.creator });
    expect(
      await errorCode(f.b.as("creator").mutation(api.claims.proposeFromSpan, f.proposal)),
    ).toBe("conflict");
    expect(await errorCode(f.extract([f.item]))).toBe("conflict");
  });

  it("a blank or out-of-range span is invalid_input", async () => {
    const f = await setup();
    const blank = f.text.indexOf("  ");
    const spans: [number, number][] = [
      [blank, blank + 2],
      [-1, 5],
      [0, f.text.length + 1],
      [1, 1],
      [0.5, 5],
    ];
    for (const [spanStart, spanEnd] of spans) {
      expect(
        await errorCode(
          f.b
            .as("creator")
            .mutation(api.claims.proposeFromSpan, { ...f.proposal, spanStart, spanEnd }),
        ),
      ).toBe("invalid_input");
    }
  });

  it("a caution needs a vocabulary key and gets the owner as author", async () => {
    const f = await setup();
    for (const cautionType of [undefined, "unknown-key"]) {
      expect(
        await errorCode(
          f.b
            .as("creator")
            .mutation(api.claims.proposeFromSpan, { ...f.proposal, kind: "caution", cautionType }),
        ),
      ).toBe("invalid_input");
    }
    expect(
      await errorCode(
        f.b
          .as("creator")
          .mutation(api.claims.proposeFromSpan, { ...f.proposal, cautionType: "cash_only" }),
      ),
    ).toBe("invalid_input");
    const claimId = await f.b.as("creator").mutation(api.claims.proposeFromSpan, {
      ...f.proposal,
      kind: "caution",
      cautionType: "cash_only",
    });
    expect(await f.b.run((ctx) => ctx.db.get("claim", claimId))).toMatchObject({
      authorId: f.owner,
      cautionType: "cash_only",
    });
    await f.b.run((ctx) => ctx.db.patch("interview", f.interviewId, { ownerPersonId: undefined }));
    const fallback = await f.b.as("steward").mutation(api.claims.proposeFromSpan, {
      ...f.proposal,
      kind: "caution",
      cautionType: "cash_only",
    });
    expect(await f.b.run((ctx) => ctx.db.get("claim", fallback))).toMatchObject({
      authorId: f.creator,
    });
  });

  it("another creator gets not_found on an unreadable draft", async () => {
    const f = await setup();
    expect(
      await errorCode(f.b.as("other-creator").mutation(api.claims.proposeFromSpan, f.proposal)),
    ).toBe("not_found");
    expect(await f.b.run((ctx) => ctx.db.query("claim").take(10))).toEqual([]);
  });

  it("another creator is forbidden when the place is readable", async () => {
    const f = await setup();
    await f.b.run((ctx) => ctx.db.patch("place", f.placeId, { visibility: "pilot" }));
    expect(
      await errorCode(f.b.as("other-creator").mutation(api.claims.proposeFromSpan, f.proposal)),
    ).toBe("forbidden");
    expect(await f.b.run((ctx) => ctx.db.query("claim").take(10))).toEqual([]);
  });

  it("proposals reject blank or overlong claim text and withdrawn interviews", async () => {
    const f = await setup();
    for (const textOriginal of [" \n", "x".repeat(1001)]) {
      expect(
        await errorCode(
          f.b.as("creator").mutation(api.claims.proposeFromSpan, { ...f.proposal, textOriginal }),
        ),
      ).toBe("invalid_input");
    }
    await f.b.run((ctx) => ctx.db.patch("interview", f.interviewId, { status: "withdrawn" }));
    expect(
      await errorCode(f.b.as("creator").mutation(api.claims.proposeFromSpan, f.proposal)),
    ).toBe("conflict");
  });

  it("insertExtracted keeps items whose quote equals the span and drops the rest", async () => {
    const f = await setup();
    expect(
      await f.extract([
        f.item,
        { ...f.item, quote: "not in the transcript" },
        { ...f.item, quote: "" },
        { ...f.item, quote: "  " },
        { ...f.item, spanEnd: 1 },
        { ...f.item, spanStart: -1 },
        { ...f.item, textOriginal: " " },
        { ...f.item, textOriginal: "x".repeat(1001) },
        { ...f.item, cautionType: "cash_only" },
      ]),
    ).toEqual({ inserted: 1, dropped: 8 });
    const claims = await f.b.run((ctx) =>
      ctx.db
        .query("claim")
        .withIndex("by_sourceTranscriptId", (q) => q.eq("sourceTranscriptId", f.transcriptId))
        .take(100),
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ quote: f.item.quote, modelVersion: "mock-extractor-v1" });
  });

  it("a whole-transcript span with the quote '。' is refused by insertExtracted", async () => {
    const f = await setup();
    expect(await f.extract([{ ...f.item, spanEnd: f.text.length, quote: "。" }])).toEqual({
      inserted: 0,
      dropped: 1,
    });
    expect(await f.b.run((ctx) => ctx.db.query("claim").take(10))).toEqual([]);
    expect(await f.b.run((ctx) => ctx.db.get("interview", f.interviewId))).toMatchObject({
      status: "claims_proposed",
    });
    expect(await f.b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      { action: "claims.extract", diff: { inserted: 0, dropped: 1 } },
    ]);
  });

  it("insertExtracted drops cautions with unknown keys", async () => {
    const f = await setup();
    expect(
      await f.extract([
        { ...f.item, kind: "caution", cautionType: "unknown" },
        { ...f.item, kind: "caution" },
        { ...f.item, kind: "caution", cautionType: "cash_only" },
      ]),
    ).toEqual({ inserted: 1, dropped: 2 });
  });

  it("insertExtracted writes nothing for a withdrawn interview", async () => {
    const f = await setup();
    await f.b.run((ctx) => ctx.db.patch("interview", f.interviewId, { status: "withdrawn" }));
    expect(await f.extract([f.item])).toEqual({ inserted: 0, dropped: 1 });
    expect(await f.b.run((ctx) => ctx.db.query("claim").take(10))).toEqual([]);
    expect(await f.b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual([]);
    expect(await f.b.run((ctx) => ctx.db.get("interview", f.interviewId))).toMatchObject({
      status: "withdrawn",
    });
  });

  it("insertExtracted writes one ai audit entry with the model version", async () => {
    const f = await setup();
    await f.extract([f.item, { ...f.item, quote: "absent" }]);
    const audits = await f.b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorKind: "ai",
      modelVersion: "mock-extractor-v1",
      action: "claims.extract",
      diff: { inserted: 1, dropped: 1 },
    });
  });

  it("inserted claims carry the interview's mock flag", async () => {
    const f = await setup();
    const manual = await f.b.as("creator").mutation(api.claims.proposeFromSpan, f.proposal);
    await f.extract([f.item]);
    const claims = await f.b.run((ctx) => ctx.db.query("claim").take(10));
    expect(claims).toHaveLength(2);
    expect(claims.every((claim) => claim.isMock)).toBe(true);
    expect(claims.find((claim) => claim._id === manual)?.modelVersion).toBeUndefined();
  });

  it("insertExtracted rejects more than 100 items and an unrelated transcript", async () => {
    const f = await setup();
    expect(await errorCode(f.extract(Array.from({ length: 101 }, () => f.item)))).toBe(
      "invalid_input",
    );
    const interviewId = await addInterview(f.b, { placeId: f.placeId, interviewerId: f.creator });
    expect(await errorCode(f.extract([f.item], { interviewId }))).toBe("conflict");
    expect(await f.b.run((ctx) => ctx.db.query("claim").take(10))).toEqual([]);
  });
});

describe("claim translations", () => {
  it("listUntranslated lists confirmed interview claims missing the other locale and never open text or proposed claims", async () => {
    const f = await setup();
    const confirmed = await f.claim("owner_confirmed");
    const published = await f.claim("published");
    const translated = await f.claim("owner_confirmed");
    await f.machine(translated);
    await f.claim();
    await f.claim("hidden");
    await addClaim(f.b, { placeId: f.placeId, origin: "creator_note", status: "owner_confirmed" });
    const landmark = await addPlace(f.b, { createdBy: f.creator, kind: "landmark" });
    await addClaim(f.b, { placeId: landmark, origin: "open_text", status: "published" });
    expect(
      await f.b.t.query(internal.claims.listUntranslated, { placeId: f.placeId, limit: 50 }),
    ).toEqual([
      { claimId: confirmed, text: f.text, from: "ja", to: "en" },
      { claimId: published, text: f.text, from: "ja", to: "en" },
    ]);
    expect(
      await f.b.t.query(internal.claims.listUntranslated, { placeId: landmark, limit: 50 }),
    ).toEqual([]);
    expect(
      await f.b.t.query(internal.claims.listUntranslated, { placeId: f.placeId, limit: 1 }),
    ).toHaveLength(1);
    expect(
      await f.b.t.query(internal.claims.listUntranslated, { placeId: f.placeId, limit: -1 }),
    ).toEqual([]);
  });

  it("listUntranslated caps the limit at 50", async () => {
    const f = await setup();
    for (let i = 0; i < 51; i++) await f.claim("owner_confirmed");
    expect(
      await f.b.t.query(internal.claims.listUntranslated, { placeId: f.placeId, limit: 100 }),
    ).toHaveLength(50);
  });

  it("listUntranslated finds remaining work after a full batch has translations", async () => {
    const f = await setup();
    for (let i = 0; i < 100; i++) {
      const claimId = await f.claim("owner_confirmed");
      await f.machine(claimId);
    }
    const claimId = await f.claim("owner_confirmed");
    expect(
      await f.b.t.query(internal.claims.listUntranslated, {
        placeId: f.placeId,
        limit: 50,
      }),
    ).toEqual([{ claimId, text: f.text, from: "ja", to: "en" }]);
  });

  it("saveMachineTranslation stores a machine row", async () => {
    const f = await setup();
    const claimId = await f.claim("owner_confirmed");
    await f.machine(claimId);
    expect(await f.translations(claimId)).toMatchObject([
      {
        lang: "en",
        origin: "machine",
        modelVersion: "mock-translator-v1",
        text: "Fictional test translation.",
      },
    ]);
    await f.machine(claimId, { text: "Updated fictional translation." });
    const rows = await f.translations(claimId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe("Updated fictional translation.");
    const audits = await f.b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits[0]).toMatchObject({
      actorKind: "ai",
      action: "claim.translate_machine",
      modelVersion: "mock-translator-v1",
    });
  });

  it("it skips when the text changed since", async () => {
    const f = await setup();
    const claimId = await f.claim("owner_confirmed");
    const sourceText = (await f.b.run((ctx) => ctx.db.get("claim", claimId)))!.textOriginal;
    await f.b
      .as("owner")
      .mutation(api.claims.review, { claimId, action: "edit", text: "修正されたテスト。" });
    await f.machine(claimId, { sourceText });
    expect(await f.translations(claimId)).toEqual([]);
  });

  it("it never overwrites a human translation", async () => {
    const f = await setup();
    const claimId = await f.claim("owner_confirmed");
    await f.b.as("steward").mutation(api.claims.setHumanTranslation, {
      claimId,
      lang: "en",
      text: "Human fictional translation.",
    });
    await f.machine(claimId);
    expect(await f.translations(claimId)).toMatchObject([
      { origin: "human", text: "Human fictional translation." },
    ]);
    expect(await f.b.run((ctx) => ctx.db.query("auditLog").take(10))).toHaveLength(1);
  });

  it("setHumanTranslation stores a named human translation and is forbidden to a creator", async () => {
    const f = await setup();
    const claimId = await f.claim("owner_confirmed");
    await f.machine(claimId);
    const args = { claimId, lang: "en", text: "  Human fictional translation.  " };
    expect(await errorCode(f.b.as("creator").mutation(api.claims.setHumanTranslation, args))).toBe(
      "forbidden",
    );
    await f.b.as("steward").mutation(api.claims.setHumanTranslation, args);
    const rows = await f.translations(claimId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      origin: "human",
      reviewedBy: "Test Person (steward)",
      text: args.text.trim(),
      reviewedAt: expect.any(Number),
    });
    expect(rows[0]?.modelVersion).toBeUndefined();
    await f.b
      .as("steward")
      .mutation(api.claims.setHumanTranslation, { ...args, text: "Revised human test." });
    expect(await f.translations(claimId)).toMatchObject([{ text: "Revised human test." }]);
    const audits = await f.b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits[1]).toMatchObject({
      actorKind: "person",
      actorPersonId: f.steward,
      action: "claim.translate_human",
    });
  });

  it("a translation into the original language or an unsupported locale is invalid_input", async () => {
    const f = await setup();
    const claimId = await f.claim("owner_confirmed");
    for (const lang of ["ja", "fr"]) {
      expect(
        await errorCode(
          f.b
            .as("steward")
            .mutation(api.claims.setHumanTranslation, { claimId, lang, text: "Test" }),
        ),
      ).toBe("invalid_input");
    }
  });

  it("hidden and proposed claims cannot receive translations", async () => {
    const f = await setup();
    for (const status of ["hidden", "proposed"] as const) {
      const claimId = await f.claim(status);
      await f.machine(claimId);
      expect(
        await errorCode(
          f.b
            .as("steward")
            .mutation(api.claims.setHumanTranslation, { claimId, lang: "en", text: "Test" }),
        ),
      ).toBe("conflict");
      expect(await f.translations(claimId)).toEqual([]);
    }
  });

  it("human translations require nonblank text of at most 1000 characters", async () => {
    const f = await setup();
    const claimId = await f.claim("owner_confirmed");
    for (const text of ["  ", "x".repeat(1001)]) {
      expect(
        await errorCode(
          f.b.as("steward").mutation(api.claims.setHumanTranslation, { claimId, lang: "en", text }),
        ),
      ).toBe("invalid_input");
    }
  });
});

describe("claim disputes", () => {
  it("markDisputed links two published claims of one place, which stay citable", async () => {
    const f = await setup();
    const claimIdA = await f.claim("published");
    const claimIdB = await f.claim("published");
    const page = await addPage(f.b, {
      placeId: f.placeId,
      sentences: [{ lang: "ja", text: "架空の異なる話。", claimIds: [claimIdA, claimIdB] }],
    });
    await f.b.as("steward").mutation(api.claims.markDisputed, { claimIdA, claimIdB });
    expect(await f.b.run((ctx) => ctx.db.get("claim", claimIdA))).toMatchObject({
      status: "disputed",
      disputedWith: claimIdB,
    });
    expect(await f.b.run((ctx) => ctx.db.get("claim", claimIdB))).toMatchObject({
      status: "disputed",
      disputedWith: claimIdA,
    });
    const sentences = await f.b.run((ctx) =>
      ctx.db
        .query("pageSentence")
        .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) => q.eq("pageVersionId", page))
        .take(10),
    );
    expect(sentences[0]?.held).toBe(false);
  });

  it("a creator is forbidden", async () => {
    const f = await setup();
    const claimIdA = await f.claim("published");
    const claimIdB = await f.claim("published");
    expect(
      await errorCode(f.b.as("creator").mutation(api.claims.markDisputed, { claimIdA, claimIdB })),
    ).toBe("forbidden");
  });

  it("claims of two places are conflict", async () => {
    const f = await setup();
    const claimIdA = await f.claim("published");
    const claimIdB = await addClaim(f.b, { placeId: f.otherPlaceId, status: "published" });
    expect(
      await errorCode(f.b.as("steward").mutation(api.claims.markDisputed, { claimIdA, claimIdB })),
    ).toBe("conflict");
    expect(await f.b.run((ctx) => ctx.db.get("claim", claimIdA))).toMatchObject({
      status: "published",
    });
  });

  it("unpublished claims or the same claim are conflict", async () => {
    const f = await setup();
    const claimIdA = await f.claim("published");
    const claimIdB = await f.claim("owner_confirmed");
    expect(
      await errorCode(f.b.as("steward").mutation(api.claims.markDisputed, { claimIdA, claimIdB })),
    ).toBe("conflict");
    expect(
      await errorCode(
        f.b.as("steward").mutation(api.claims.markDisputed, { claimIdA, claimIdB: claimIdA }),
      ),
    ).toBe("conflict");
  });
});

describe("claims manager list", () => {
  it("lists visible statuses with translations, provenance and the AI label", async () => {
    const f = await setup();
    const manual = await f.b.as("creator").mutation(api.claims.proposeFromSpan, f.proposal);
    await f.extract([f.item]);
    const confirmed = await f.claim("owner_confirmed");
    await f.machine(confirmed);
    const published = await f.claim("published");
    await f.claim("hidden");
    const rows: ClaimView[] = await f.b
      .as("owner")
      .query(api.claims.listForPlace, { placeId: f.placeId });
    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row._id === manual)).toMatchObject({
      aiAssisted: false,
      quote: f.text,
      isMock: true,
      translations: [],
    });
    expect(rows.find((row) => row.modelVersion !== undefined)).toMatchObject({
      aiAssisted: true,
      modelVersion: "mock-extractor-v1",
    });
    expect(rows.find((row) => row._id === confirmed)?.translations).toMatchObject([
      { lang: "en", origin: "machine" },
    ]);
    expect(rows.find((row) => row._id === published)?.status).toBe("published");
    expect(
      await f.b.as("creator").query(api.claims.listForPlace, { placeId: f.placeId }),
    ).toHaveLength(4);
    expect(
      await f.b.as("steward").query(api.claims.listForPlace, { placeId: f.placeId }),
    ).toHaveLength(4);
  });

  it("unreadable places are not_found; readable places require a manager", async () => {
    const f = await setup();
    const args = { placeId: f.placeId };
    expect(await errorCode(f.b.t.query(api.claims.listForPlace, args))).toBe("not_found");
    expect(await errorCode(f.b.as("other-owner").query(api.claims.listForPlace, args))).toBe(
      "not_found",
    );
    await f.b.run((ctx) =>
      ctx.db.patch("place", f.placeId, { visibility: "demo_public", demoPublicBasis: "fictional" }),
    );
    expect(await errorCode(f.b.t.query(api.claims.listForPlace, args))).toBe("forbidden");
    expect(await errorCode(f.b.as("visitor").query(api.claims.listForPlace, args))).toBe(
      "forbidden",
    );
  });
});
