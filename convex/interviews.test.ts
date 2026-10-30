/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import nagasaki from "../regions/nagasaki.json";
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
import type { InterviewStatus } from "../src/lib/domain/constants";
import type { Segment } from "./interviews";

const modules = import.meta.glob("./**/*.ts");
const segments = [{ start: 0, end: 4, speaker: "Mock owner", text: "架空のお店の物語です。" }];
const consentArgs = {
  scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
  textVersion: nagasaki.consent.textVersion,
  textLang: "ja",
  assisted: false,
};

async function world(consent = true) {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  const other = await addPerson(b, "other", "creator", { isMock: true });
  await addPerson(b, "user", "user", { isMock: true });
  const owner = await addPerson(b, "owner", "business_owner", { isMock: true });
  const steward = await addPerson(b, "steward", "steward", { isMock: true });
  const placeId = await addPlace(b, { createdBy: creator });
  await addOwner(b, placeId, owner, steward);
  const interviewId = await addInterview(b, { placeId, interviewerId: creator, consent });
  const stored = () => b.t.run((ctx) => ctx.db.get("interview", interviewId));
  const transcripts = () =>
    b.t.run((ctx) =>
      ctx.db
        .query("transcript")
        .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", interviewId))
        .take(100),
    );
  const audio = async () => {
    const storageId = await b.t.run((ctx) =>
      ctx.storage.store(new Blob(["mock audio"], { type: "audio/webm" })),
    );
    await b.as("creator").mutation(api.audio.attach, { interviewId, storageId });
    return storageId;
  };
  return { b, creator, other, owner, steward, placeId, interviewId, stored, transcripts, audio };
}

describe("interview creation and consent", () => {
  it("a creator starts an interview in consent_pending, with the place owner as ownerPersonId", async () => {
    const { b, placeId, creator, owner } = await world();
    const id = await b.as("creator").mutation(api.interviews.create, { placeId, language: "ja" });
    expect(await b.t.run((ctx) => ctx.db.get("interview", id))).toMatchObject({
      placeId,
      interviewerId: creator,
      ownerPersonId: owner,
      language: "ja",
      status: "consent_pending",
      isMock: true,
    });
    const audit = (await b.t.run((ctx) => ctx.db.query("auditLog").take(100))).filter(
      (entry) => entry.targetType === "interview" && entry.targetId === id,
    );
    expect(audit).toMatchObject([{ action: "interview.create", actorPersonId: creator }]);
  });

  it("a user is forbidden", async () => {
    const { b, placeId } = await world();
    expect(
      await errorCode(b.as("user").mutation(api.interviews.create, { placeId, language: "ja" })),
    ).toBe("forbidden");
  });

  it("an unreadable place is not_found", async () => {
    const { b, placeId } = await world();
    expect(
      await errorCode(b.as("other").mutation(api.interviews.create, { placeId, language: "ja" })),
    ).toBe("not_found");
  });

  it("a language the region does not serve is invalid_input", async () => {
    const { b, placeId } = await world();
    expect(
      await errorCode(b.as("creator").mutation(api.interviews.create, { placeId, language: "fr" })),
    ).toBe("invalid_input");
  });

  it("a steward can create, and an ownerless place leaves ownerPersonId unset", async () => {
    const { b, creator } = await world();
    const placeId = await addPlace(b, { createdBy: creator });
    const id = await b.as("steward").mutation(api.interviews.create, { placeId, language: "en" });
    expect(await b.t.run((ctx) => ctx.db.get("interview", id))).toMatchObject({
      status: "consent_pending",
      language: "en",
    });
    expect((await b.t.run((ctx) => ctx.db.get("interview", id)))?.ownerPersonId).toBeUndefined();
  });

  it.each(["publish", "aiProcessing", "transferAbroad", "voiceRetention"] as const)(
    "consent with one scope false is conflict and writes nothing (%s)",
    async (scope) => {
      const { b, interviewId, stored } = await world(false);
      expect(
        await errorCode(
          b.as("creator").mutation(api.interviews.recordConsent, {
            interviewId,
            ...consentArgs,
            scope: { ...consentArgs.scope, [scope]: false },
          }),
        ),
      ).toBe("conflict");
      expect(
        await b.t.run((ctx) =>
          ctx.db
            .query("consent")
            .withIndex("by_interviewId", (q) => q.eq("interviewId", interviewId))
            .first(),
        ),
      ).toBeNull();
      expect((await stored())?.status).toBe("consent_pending");
    },
  );

  it("a stale text version is conflict", async () => {
    const { b, interviewId } = await world(false);
    expect(
      await errorCode(
        b.as("creator").mutation(api.interviews.recordConsent, {
          interviewId,
          ...consentArgs,
          textVersion: "old-test-text",
        }),
      ),
    ).toBe("conflict");
  });

  it("a creator cannot record assisted consent, a steward can", async () => {
    const { b, interviewId, steward, stored } = await world(false);
    const args = { interviewId, ...consentArgs, assisted: true };
    expect(await errorCode(b.as("creator").mutation(api.interviews.recordConsent, args))).toBe(
      "forbidden",
    );
    const id = await b.as("steward").mutation(api.interviews.recordConsent, args);
    expect(await b.t.run((ctx) => ctx.db.get("consent", id))).toMatchObject({
      ...consentArgs,
      assisted: true,
      recordedBy: steward,
      recordedAt: expect.any(Number),
    });
    expect((await stored())?.status).toBe("consent_pending");
  });

  it("a second consent is conflict", async () => {
    const { b, interviewId } = await world();
    expect(
      await errorCode(
        b.as("creator").mutation(api.interviews.recordConsent, { interviewId, ...consentArgs }),
      ),
    ).toBe("conflict");
  });

  it("a creator records all four scopes, text and recorder without advancing status", async () => {
    const { b, creator, interviewId, stored } = await world(false);
    const id = await b.as("creator").mutation(api.interviews.recordConsent, {
      interviewId,
      ...consentArgs,
    });
    expect(await b.t.run((ctx) => ctx.db.get("consent", id))).toMatchObject({
      ...consentArgs,
      interviewId,
      recordedBy: creator,
      recordedAt: expect.any(Number),
    });
    expect((await stored())?.status).toBe("consent_pending");
    expect(await b.t.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      { action: "consent.record", actorPersonId: creator, targetId: id },
    ]);
  });

  it("consent on an unreadable draft is not_found for another creator", async () => {
    const { b, interviewId } = await world(false);
    expect(
      await errorCode(
        b.as("other").mutation(api.interviews.recordConsent, { interviewId, ...consentArgs }),
      ),
    ).toBe("not_found");
  });

  it("consent in an unsupported language is invalid_input", async () => {
    const { b, interviewId } = await world(false);
    expect(
      await errorCode(
        b.as("creator").mutation(api.interviews.recordConsent, {
          interviewId,
          ...consentArgs,
          textLang: "fr",
        }),
      ),
    ).toBe("invalid_input");
  });
});

describe("corrected transcripts", () => {
  it("saveCorrection without consent is conflict", async () => {
    const { b, interviewId, transcripts } = await world(false);
    expect(
      await errorCode(
        b.as("creator").mutation(api.interviews.saveCorrection, { interviewId, segments }),
      ),
    ).toBe("conflict");
    expect(await transcripts()).toEqual([]);
  });

  it("the first typed transcript is version 1 human_corrected and moves the interview to correcting", async () => {
    const { b, interviewId, creator, stored } = await world();
    const id = await b
      .as("creator")
      .mutation(api.interviews.saveCorrection, { interviewId, segments });
    expect(await b.t.run((ctx) => ctx.db.get("transcript", id))).toMatchObject({
      version: 1,
      origin: "human_corrected",
      lang: "ja",
      createdBy: creator,
      segments,
    });
    expect((await stored())?.status).toBe("correcting");
    expect((await stored())?.audioStorageId).toBeUndefined();
  });

  it("each save is a new version", async () => {
    const { b, interviewId, transcripts, steward } = await world();
    await b.as("creator").mutation(api.interviews.saveCorrection, { interviewId, segments });
    const corrected = [{ start: 0, end: 4, text: "人が直した架空のお店の物語です。" }];
    await b
      .as("steward")
      .mutation(api.interviews.saveCorrection, { interviewId, segments: corrected });
    expect(await transcripts()).toMatchObject([
      { version: 1, segments },
      { version: 2, segments: corrected, createdBy: steward },
    ]);
  });

  it.each(
    [
      [{ start: -1, end: 2, text: "mock" }],
      [{ start: 2, end: 1, text: "mock" }],
      [{ start: Number.NaN, end: 1, text: "mock" }],
      [{ start: 0, end: Number.POSITIVE_INFINITY, text: "mock" }],
      [],
      [{ start: 0, end: 1, text: "x".repeat(5001) }],
      Array.from({ length: 2001 }, () => ({ start: 0, end: 1, text: "mock" })),
    ].map((invalid) => [invalid] as [Segment[]]),
  )(
    "segments with negative or reversed times, nonfinite values or invalid bounds are invalid_input (%#)",
    async (invalid) => {
      const { b, interviewId, transcripts } = await world();
      expect(
        await errorCode(
          b
            .as("creator")
            .mutation(api.interviews.saveCorrection, { interviewId, segments: invalid }),
        ),
      ).toBe("invalid_input");
      expect(await transcripts()).toEqual([]);
    },
  );

  it("loadForExtraction refuses while only a machine transcript exists and accepts after a correction", async () => {
    const { b, interviewId } = await world();
    await b.t.mutation(internal.interviews.saveMachineTranscript, {
      interviewId,
      segments,
      lang: "ja",
      modelVersion: "mock-transcriber-v1",
    });
    expect(await errorCode(b.t.query(internal.interviews.loadForExtraction, { interviewId }))).toBe(
      "conflict",
    );
    const corrected = [...segments, { start: 4, end: 8, text: "テスト用の続きです。" }];
    const id = await b
      .as("creator")
      .mutation(api.interviews.saveCorrection, { interviewId, segments: corrected });
    expect(await b.t.query(internal.interviews.loadForExtraction, { interviewId })).toEqual({
      transcriptId: id,
      text: corrected.map((segment) => segment.text).join("\n"),
      language: "ja",
      regionId: "nagasaki",
    });
  });

  it.each(["claims_proposed", "owner_review"] as const)(
    "a correction preserves later status %s",
    async (status) => {
      const { b, interviewId, stored } = await world();
      await b.run((ctx) => ctx.db.patch("interview", interviewId, { status }));
      await b.as("creator").mutation(api.interviews.saveCorrection, { interviewId, segments });
      expect((await stored())?.status).toBe(status);
    },
  );

  it("another creator cannot save a correction, and done interviews cannot be corrected", async () => {
    const { b, interviewId } = await world();
    expect(
      await errorCode(
        b.as("other").mutation(api.interviews.saveCorrection, { interviewId, segments }),
      ),
    ).toBe("not_found");
    await b.run((ctx) => ctx.db.patch("interview", interviewId, { status: "done" }));
    expect(
      await errorCode(
        b.as("creator").mutation(api.interviews.saveCorrection, { interviewId, segments }),
      ),
    ).toBe("conflict");
  });
});

describe("interview reading and withdrawal", () => {
  it("get shows the latest transcript to the interviewer, a steward and the owner, and is not_found to another creator", async () => {
    const { b, interviewId, audio } = await world();
    await audio();
    await b.as("creator").mutation(api.interviews.saveCorrection, { interviewId, segments });
    const id = await b
      .as("creator")
      .mutation(api.interviews.saveCorrection, { interviewId, segments });
    for (const name of ["creator", "steward", "owner"]) {
      expect(await b.as(name).query(api.interviews.get, { interviewId })).toMatchObject({
        hasAudio: true,
        audioUrl: expect.any(String),
        latestTranscript: { _id: id, version: 2, origin: "human_corrected", segments },
        canWithdraw: name !== "creator",
        consent: { withdrawn: false },
      });
    }
    expect(await errorCode(b.as("other").query(api.interviews.get, { interviewId }))).toBe(
      "not_found",
    );
  });

  it("a place creator who is not the interviewer gets forbidden on readable interviews", async () => {
    const { b, other, placeId, interviewId } = await world();
    await b.run((ctx) => ctx.db.patch("place", placeId, { createdBy: other }));
    expect(await errorCode(b.as("other").query(api.interviews.get, { interviewId }))).toBe(
      "forbidden",
    );
    expect(
      await errorCode(
        b.as("other").mutation(api.interviews.saveCorrection, { interviewId, segments }),
      ),
    ).toBe("forbidden");
  });

  it("get hides the transcript and audio after withdrawal", async () => {
    const { b, interviewId, audio } = await world();
    await audio();
    await b.as("creator").mutation(api.interviews.saveCorrection, { interviewId, segments });
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    for (const name of ["creator", "steward", "owner"]) {
      expect(await b.as(name).query(api.interviews.get, { interviewId })).toMatchObject({
        status: "withdrawn",
        hasAudio: false,
        audioUrl: null,
        latestTranscript: null,
        consent: { withdrawn: true },
      });
    }
    expect(await errorCode(b.t.query(internal.interviews.loadForExtraction, { interviewId }))).toBe(
      "conflict",
    );
  });

  it("withdraw by the verified owner still hides everything", async () => {
    const { b, interviewId, placeId, creator, owner, audio, stored } = await world();
    const storageId = await audio();
    const first = await addCorrectedTranscript(b, { interviewId, createdBy: creator });
    const second = await addCorrectedTranscript(b, { interviewId, createdBy: creator });
    const published = await addClaim(b, {
      placeId,
      origin: "interview",
      transcriptId: first.transcriptId,
      status: "published",
      reviewerId: owner,
    });
    const proposed = await addClaim(b, {
      placeId,
      origin: "interview",
      transcriptId: second.transcriptId,
    });
    const unrelated = await addClaim(b, {
      placeId,
      status: "published",
      authorId: creator,
      reviewerId: owner,
    });
    const pageId = await addPage(b, {
      placeId,
      sentences: [
        { lang: "ja", text: "架空の引用文です。", claimIds: [published] },
        { lang: "en", text: "A fictional cited sentence.", claimIds: [published, unrelated] },
        { lang: "ja", text: "別のテスト文です。", claimIds: [unrelated] },
      ],
    });
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    expect((await stored())?.status).toBe("withdrawn");
    expect((await stored())?.audioStorageId).toBeUndefined();
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
    for (const id of [published, proposed]) {
      expect((await b.t.run((ctx) => ctx.db.get("claim", id)))?.status).toBe("hidden");
    }
    expect((await b.t.run((ctx) => ctx.db.get("claim", unrelated)))?.status).toBe("published");
    const sentences = await b.t.run((ctx) =>
      ctx.db
        .query("pageSentence")
        .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) => q.eq("pageVersionId", pageId))
        .take(10),
    );
    expect(
      sentences
        .filter((sentence) => sentence.claimIds.includes(published))
        .every((sentence) => sentence.held),
    ).toBe(true);
    expect(sentences.find((sentence) => sentence.ordinal === 2)?.held).toBe(false);
    const consent = await b.t.run((ctx) =>
      ctx.db
        .query("consent")
        .withIndex("by_interviewId", (q) => q.eq("interviewId", interviewId))
        .first(),
    );
    expect(consent?.withdrawnAt).toEqual(expect.any(Number));
    const audits = (await b.t.run((ctx) => ctx.db.query("auditLog").take(100))).filter(
      (entry) => entry.targetType === "interview" && entry.targetId === interviewId,
    );
    expect(audits).toMatchObject([
      {
        action: "interview.withdraw",
        actorPersonId: owner,
        diff: { claimsHidden: 2, sentencesHeld: 2, audioDeleted: true },
      },
    ]);
  });

  it("withdraw includes claims beyond 200 per transcript and transcripts beyond 50", async () => {
    const { b, interviewId, placeId, creator, owner } = await world();
    const claimIds = await b.run(async (ctx) => {
      const ids: Id<"claim">[] = [];
      for (let version = 1; version <= 51; version++) {
        const transcriptId = await ctx.db.insert("transcript", {
          interviewId,
          version,
          lang: "ja",
          origin: "human_corrected",
          createdBy: creator,
          segments,
        });
        for (let i = 0; i < (version === 1 ? 201 : 1); i++) {
          ids.push(
            await ctx.db.insert("claim", {
              placeId,
              kind: "story",
              textOriginal: "架空のテスト文です。",
              langOriginal: "ja",
              origin: "interview",
              sourceTranscriptId: transcriptId,
              spanStart: 0,
              spanEnd: segments[0]!.text.length,
              quote: segments[0]!.text,
              status: "published",
              reviewerId: owner,
              confirmedAt: 1,
              isMock: true,
            }),
          );
        }
      }
      return ids;
    });
    const pageId = await addPage(b, {
      placeId,
      sentences: claimIds.map((id) => ({ lang: "ja", text: "架空の引用文です。", claimIds: [id] })),
    });
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    const claims = await b.run((ctx) =>
      ctx.db
        .query("claim")
        .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId))
        .take(300),
    );
    expect(claims).toHaveLength(251);
    expect(claims.every((claim) => claim.status === "hidden")).toBe(true);
    const sentences = await b.run((ctx) =>
      ctx.db
        .query("pageSentence")
        .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) => q.eq("pageVersionId", pageId))
        .take(300),
    );
    expect(sentences).toHaveLength(251);
    expect(sentences.every((sentence) => sentence.held)).toBe(true);
  });

  it("withdraw by a creator is forbidden", async () => {
    const { b, interviewId } = await world();
    expect(
      await errorCode(b.as("creator").mutation(api.interviews.withdraw, { interviewId })),
    ).toBe("forbidden");
  });

  it("an unverified owner is forbidden, a steward can withdraw without consent", async () => {
    const { b, interviewId, stored } = await world(false);
    await addPerson(b, "unverified", "business_owner", { isMock: true });
    expect(
      await errorCode(b.as("unverified").mutation(api.interviews.withdraw, { interviewId })),
    ).toBe("forbidden");
    await b.as("steward").mutation(api.interviews.withdraw, { interviewId });
    expect((await stored())?.status).toBe("withdrawn");
  });

  it.each(["transcribing", "owner_review", "done"] as const)(
    "withdrawal works from %s and prevents restarting consent",
    async (status) => {
      const { b, interviewId, stored } = await world();
      await b.run((ctx) => ctx.db.patch("interview", interviewId, { status }));
      await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
      expect((await stored())?.status).toBe("withdrawn");
      expect(
        await errorCode(
          b.as("creator").mutation(api.interviews.recordConsent, { interviewId, ...consentArgs }),
        ),
      ).toBe("conflict");
    },
  );

  it("withdraw twice is a no-op", async () => {
    const { b, interviewId } = await world();
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    const before = await b.t.run((ctx) => ctx.db.query("auditLog").take(100));
    expect(await b.as("owner").mutation(api.interviews.withdraw, { interviewId })).toBeNull();
    expect(await b.t.run((ctx) => ctx.db.query("auditLog").take(100))).toEqual(before);
  });

  it("after withdrawal, saveCorrection and beginTranscription are conflict", async () => {
    const { b, interviewId, audio } = await world();
    await audio();
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    expect(
      await errorCode(
        b.as("creator").mutation(api.interviews.saveCorrection, { interviewId, segments }),
      ),
    ).toBe("conflict");
    expect(
      await errorCode(b.t.mutation(internal.interviews.beginTranscription, { interviewId })),
    ).toBe("conflict");
    expect(
      await errorCode(
        b.as("creator").mutation(api.interviews.recordConsent, { interviewId, ...consentArgs }),
      ),
    ).toBe("conflict");
  });

  it("listMine returns only the caller's interviews and listForPlace admits managers only", async () => {
    const { b, interviewId, placeId } = await world();
    expect(await b.as("creator").query(api.interviews.listMine, {})).toMatchObject([
      { _id: interviewId, createdAt: expect.any(Number) },
    ]);
    expect(await b.as("other").query(api.interviews.listMine, {})).toEqual([]);
    expect(await errorCode(b.as("user").query(api.interviews.listMine, {}))).toBe("forbidden");
    for (const name of ["creator", "owner", "steward"]) {
      expect(await b.as(name).query(api.interviews.listForPlace, { placeId })).toMatchObject([
        { _id: interviewId },
      ]);
    }
    await b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "pilot" }));
    expect(await errorCode(b.as("other").query(api.interviews.listForPlace, { placeId }))).toBe(
      "forbidden",
    );
  });
});

describe("internal processing contracts", () => {
  it("beginTranscription without audio is conflict", async () => {
    const { b, interviewId } = await world();
    expect(
      await errorCode(b.t.mutation(internal.interviews.beginTranscription, { interviewId })),
    ).toBe("conflict");
  });

  it("beginTranscription accepts uploaded and transcript_ready, clears the error, and rejects duplicate work", async () => {
    const { b, interviewId, audio, stored } = await world();
    const storageId = await audio();
    for (const status of ["uploaded", "transcript_ready"] as const) {
      await b.run((ctx) =>
        ctx.db.patch("interview", interviewId, { status, processingError: "mock failure" }),
      );
      expect(await b.t.mutation(internal.interviews.beginTranscription, { interviewId })).toEqual({
        storageId,
        language: "ja",
      });
      expect((await stored())?.status).toBe("transcribing");
      expect((await stored())?.processingError).toBeUndefined();
      expect(
        await errorCode(b.t.mutation(internal.interviews.beginTranscription, { interviewId })),
      ).toBe("conflict");
    }
  });

  it("saveMachineTranscript versions its output, records duration and an AI audit", async () => {
    const { b, interviewId, audio, stored, transcripts } = await world();
    await audio();
    await b.t.mutation(internal.interviews.beginTranscription, { interviewId });
    const id = await b.t.mutation(internal.interviews.saveMachineTranscript, {
      interviewId,
      segments,
      lang: "ja",
      modelVersion: "mock-v1",
      durationS: 4,
    });
    expect(await transcripts()).toMatchObject([
      { _id: id, version: 1, origin: "machine", modelVersion: "mock-v1" },
    ]);
    expect(await stored()).toMatchObject({ status: "transcript_ready", durationS: 4 });
    const audit = (await b.t.run((ctx) => ctx.db.query("auditLog").take(100))).filter(
      (entry) => entry.targetType === "transcript" && entry.targetId === id,
    );
    expect(audit).toMatchObject([
      { actorKind: "ai", modelVersion: "mock-v1", action: "transcript.machine" },
    ]);
  });

  it("saveMachineTranscript after withdrawal writes nothing", async () => {
    const { b, interviewId, audio, transcripts } = await world();
    await audio();
    await b.t.mutation(internal.interviews.beginTranscription, { interviewId });
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    expect(
      await b.t.mutation(internal.interviews.saveMachineTranscript, {
        interviewId,
        segments,
        lang: "ja",
        modelVersion: "mock-v1",
      }),
    ).toBeNull();
    expect(await transcripts()).toEqual([]);
    await b.t.mutation(internal.interviews.recordProcessingError, {
      interviewId,
      message: "late failure",
    });
    expect(
      (await b.t.run((ctx) => ctx.db.get("interview", interviewId)))?.processingError,
    ).toBeUndefined();
  });

  it("recordProcessingError stores a non-empty message and returns to uploaded", async () => {
    const { b, interviewId, audio, stored } = await world();
    await audio();
    await b.t.mutation(internal.interviews.beginTranscription, { interviewId });
    await b.t.mutation(internal.interviews.recordProcessingError, {
      interviewId,
      message: "  mock failure  ",
    });
    expect(await stored()).toMatchObject({ status: "uploaded", processingError: "mock failure" });
    await b.t.mutation(internal.interviews.recordProcessingError, { interviewId, message: " \n " });
    expect((await stored())?.processingError).toBe("unknown error");
    await b.t.mutation(internal.interviews.recordProcessingError, {
      interviewId,
      message: "x".repeat(700),
    });
    expect((await stored())?.processingError).toHaveLength(500);
  });

  it("machine saves, errors and extraction require live consent", async () => {
    const { b, interviewId } = await world(false);
    expect(
      await errorCode(
        b.t.mutation(internal.interviews.saveMachineTranscript, {
          interviewId,
          segments,
          lang: "ja",
          modelVersion: "mock-v1",
        }),
      ),
    ).toBe("conflict");
    expect(
      await errorCode(
        b.t.mutation(internal.interviews.recordProcessingError, {
          interviewId,
          message: "mock failure",
        }),
      ),
    ).toBe("conflict");
    expect(await errorCode(b.t.query(internal.interviews.loadForExtraction, { interviewId }))).toBe(
      "conflict",
    );
  });

  it.each(["correcting", "owner_review", "done"] satisfies InterviewStatus[])(
    "beginTranscription refuses status %s",
    async (status) => {
      const { b, interviewId, audio } = await world();
      await audio();
      await b.run((ctx) => ctx.db.patch("interview", interviewId, { status }));
      expect(
        await errorCode(b.t.mutation(internal.interviews.beginTranscription, { interviewId })),
      ).toBe("conflict");
    },
  );
});
