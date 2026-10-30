/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import type { ClaimActor, ClaimEvent } from "../src/lib/claims/state";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  disputeClaims,
  hideClaims,
  holdSentencesCiting,
  MAX_CASCADE_DOCUMENTS_READ,
  transitionClaim,
} from "./lib/claimEffects";
import { triggers } from "./lib/gate";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Run = <T>(fn: (ctx: MutationCtx) => Promise<T>) => Promise<T>;
const NOW = 123456;
let counter = 0;
const unique = (prefix: string) => `${prefix}-${++counter}`;

function backend(): Run {
  const t = convexTest(schema, modules);
  return (fn) => t.run((ctx) => fn(triggers.wrapDB(ctx)));
}

async function setup(hasOwner = true) {
  const run = backend();
  const ids = await run(async (ctx) => {
    const person = (role: Doc<"person">["role"]) =>
      ctx.db.insert("person", {
        tokenIdentifier: unique("https://mock.invalid|person"),
        clerkUserId: unique("mock-person"),
        role,
        displayName: `Mock ${role}`,
        isMock: true,
      });
    const owner = await person("business_owner");
    const steward = await person("steward");
    const creator = await person("creator");
    const placeId = await addPlace(ctx, creator);
    if (hasOwner) {
      await ctx.db.insert("placeOwner", {
        placeId,
        personId: owner,
        verifiedBy: steward,
        verifiedAt: 1,
      });
    }
    return { owner, steward, creator, placeId };
  });
  return { run, ...ids };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

function addPlace(ctx: MutationCtx, creator: Id<"person">) {
  return ctx.db.insert("place", {
    regionId: "nagasaki",
    slug: unique("mock-place"),
    visibility: "draft",
    createdBy: creator,
    isMock: true,
  });
}

async function addClaim(
  ctx: MutationCtx,
  fixture: Fixture,
  options: {
    status?: Exclude<Doc<"claim">["status"], "disputed">;
    origin?: Doc<"claim">["origin"];
    placeId?: Id<"place">;
  } = {},
) {
  const { status = "proposed", origin = "interview", placeId = fixture.placeId } = options;
  const evidence: Partial<Doc<"claim">> = {};
  if (origin === "interview") {
    const interviewId = await ctx.db.insert("interview", {
      placeId,
      interviewerId: fixture.creator,
      language: "en",
      status: "consent_pending",
      isMock: true,
    });
    evidence.sourceTranscriptId = await ctx.db.insert("transcript", {
      interviewId,
      version: 1,
      lang: "en",
      origin: "human_corrected",
      segments: [{ start: 0, end: 10, text: "Mock source quote." }],
      createdBy: fixture.creator,
    });
    evidence.spanStart = 0;
    evidence.spanEnd = "Mock source quote.".length;
    evidence.quote = "Mock source quote.";
  } else if (origin === "open_text") {
    evidence.sourceOpenTextId = await ctx.db.insert("openTextSnippet", {
      placeId,
      lang: "en",
      text: "Mock openly licensed text.",
      licence: "CC0",
      sourceUrl: "https://mock.invalid/source",
      attribution: "Mock source",
      retrievedAt: 1,
    });
  }
  const confirmed = status === "owner_confirmed" || status === "published";
  return ctx.db.insert("claim", {
    ...evidence,
    placeId,
    kind: "story",
    textOriginal: "Mock claim wording.",
    langOriginal: "en",
    origin,
    status,
    ...(confirmed
      ? origin === "open_text"
        ? { reviewerId: fixture.steward }
        : { reviewerId: fixture.owner, confirmedAt: 1 }
      : {}),
    isMock: true,
  });
}

async function addPage(
  ctx: MutationCtx,
  placeId: Id<"place">,
  version: number,
  sentences: { claimIds: Id<"claim">[]; held?: boolean; lang?: string }[],
) {
  const pageVersionId = await ctx.db.insert("pageVersion", {
    placeId,
    version,
    generatedBy: "mock-model",
    status: version % 2 === 0 ? "held" : "published",
  });
  const ids: Id<"pageSentence">[] = [];
  for (const [ordinal, sentence] of sentences.entries()) {
    ids.push(
      await ctx.db.insert("pageSentence", {
        pageVersionId,
        ordinal,
        lang: sentence.lang ?? "en",
        text: "Mock page sentence.",
        held: sentence.held ?? false,
        claimIds: sentence.claimIds,
      }),
    );
  }
  return ids;
}

async function readClaim(run: Run, claimId: Id<"claim">) {
  return run(async (ctx) => {
    const claim = await ctx.db.get("claim", claimId);
    if (claim === null) throw new Error("Missing mock claim");
    return claim;
  });
}

const audits = (run: Run) => run((ctx) => ctx.db.query("auditLog").take(100));
const heldFlags = (run: Run, sentenceIds: Id<"pageSentence">[]) =>
  run(async (ctx) => {
    const flags: (boolean | undefined)[] = [];
    for (const id of sentenceIds) flags.push((await ctx.db.get("pageSentence", id))?.held);
    return flags;
  });
const failsWith = (work: Promise<unknown>, code: string) =>
  expect(work).rejects.toMatchObject({ data: expect.objectContaining({ code }) });

describe("claim effects through the write gate", () => {
  it("confirm sets confirmedAt and reviewerId and passes the publication rule", async () => {
    const f = await setup();
    const claimId = await f.run((ctx) => addClaim(ctx, f));
    const confirmed = await f.run((ctx) =>
      transitionClaim(ctx, claimId, "confirm", { actor: "owner", by: f.owner, now: NOW }),
    );
    expect(confirmed).toMatchObject({
      status: "owner_confirmed",
      confirmedAt: NOW,
      reviewerId: f.owner,
    });
    const published = await f.run((ctx) =>
      transitionClaim(ctx, claimId, "publish", { actor: "system", now: NOW + 1 }),
    );
    expect(published.status).toBe("published");
    expect(published.confirmedAt).toBe(NOW);
  });

  it("a steward confirms open text with reviewerId only", async () => {
    const f = await setup(false);
    const claimId = await f.run((ctx) => addClaim(ctx, f, { origin: "open_text" }));
    const confirmed = await f.run((ctx) =>
      transitionClaim(ctx, claimId, "confirm", { actor: "steward", by: f.steward, now: NOW }),
    );
    expect(confirmed.status).toBe("owner_confirmed");
    expect(confirmed.reviewerId).toBe(f.steward);
    expect(confirmed.confirmedAt).toBeUndefined();
    await f.run((ctx) => transitionClaim(ctx, claimId, "publish", { actor: "system", now: NOW }));
  });

  it("edit replaces the text, deletes the translations and keeps the quote", async () => {
    const f = await setup();
    const { claimId, other, sentenceIds } = await f.run(async (ctx) => {
      const claimId = await addClaim(ctx, f, { status: "published" });
      const other = await addClaim(ctx, f, { status: "published" });
      for (const [id, lang] of [
        [claimId, "ja"],
        [claimId, "en"],
        [other, "ja"],
      ] as const) {
        await ctx.db.insert("claimTranslation", {
          claimId: id,
          lang,
          text: "Mock translation.",
          origin: "machine",
          modelVersion: "mock-model",
        });
      }
      const sentenceIds = await addPage(ctx, f.placeId, 1, [
        { claimIds: [claimId] },
        { claimIds: [other] },
      ]);
      return { claimId, other, sentenceIds };
    });
    const before = await readClaim(f.run, claimId);
    const edited = await f.run((ctx) =>
      transitionClaim(ctx, claimId, "edit", {
        actor: "owner",
        by: f.owner,
        now: NOW,
        textOriginal: "  Mock edited wording.  ",
      }),
    );
    expect(edited).toMatchObject({
      status: "owner_confirmed",
      textOriginal: "Mock edited wording.",
      reviewerId: f.owner,
      confirmedAt: NOW,
      quote: before.quote,
      spanStart: before.spanStart,
      spanEnd: before.spanEnd,
      sourceTranscriptId: before.sourceTranscriptId,
    });
    const translations = await f.run((ctx) =>
      ctx.db
        .query("claimTranslation")
        .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claimId))
        .take(20),
    );
    expect(translations).toEqual([]);
    expect(
      await f.run((ctx) =>
        ctx.db
          .query("claimTranslation")
          .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", other))
          .take(20),
      ),
    ).toHaveLength(1);
    expect(await heldFlags(f.run, sentenceIds)).toEqual([true, false]);
    expect((await audits(f.run))[0]?.diff).toEqual({
      status: { from: "published", to: "owner_confirmed" },
      textOriginal: { from: before.textOriginal, to: "Mock edited wording." },
    });
  });

  it.each([undefined, "", " \n ", "x".repeat(1001)])(
    "edit rejects invalid wording without changing anything (%s)",
    async (textOriginal) => {
      const f = await setup();
      const claimId = await f.run((ctx) => addClaim(ctx, f));
      const before = await readClaim(f.run, claimId);
      await failsWith(
        f.run((ctx) =>
          transitionClaim(ctx, claimId, "edit", {
            actor: "owner",
            by: f.owner,
            now: NOW,
            textOriginal,
          }),
        ),
        "invalid_input",
      );
      expect(await readClaim(f.run, claimId)).toEqual(before);
      expect(await audits(f.run)).toEqual([]);
    },
  );

  it("edit accepts exactly 1000 trimmed characters", async () => {
    const f = await setup();
    const claimId = await f.run((ctx) => addClaim(ctx, f));
    const edited = await f.run((ctx) =>
      transitionClaim(ctx, claimId, "edit", {
        actor: "owner",
        by: f.owner,
        now: NOW,
        textOriginal: ` ${"x".repeat(1000)} `,
      }),
    );
    expect(edited.textOriginal).toHaveLength(1000);
  });

  it("hiding a published claim holds every sentence citing it and leaves other sentences alone", async () => {
    const f = await setup();
    const { claimId, sentenceIds } = await f.run(async (ctx) => {
      const claimId = await addClaim(ctx, f, { status: "published" });
      const other = await addClaim(ctx, f, { status: "published" });
      const elsewhere = await addPlace(ctx, f.creator);
      const elsewhereClaim = await addClaim(ctx, f, { placeId: elsewhere, status: "published" });
      const sentenceIds = [
        ...(await addPage(ctx, f.placeId, 1, [
          { claimIds: [claimId] },
          { claimIds: [claimId, other], lang: "ja" },
          { claimIds: [other] },
          { claimIds: [claimId], held: true },
        ])),
        ...(await addPage(ctx, f.placeId, 2, [{ claimIds: [claimId] }])),
        ...(await addPage(ctx, elsewhere, 1, [{ claimIds: [elsewhereClaim] }])),
      ];
      return { claimId, sentenceIds };
    });
    const hidden = await f.run((ctx) =>
      transitionClaim(ctx, claimId, "hide", { actor: "system", now: NOW }),
    );
    expect(hidden.status).toBe("hidden");
    expect(hidden.disputedWith).toBeUndefined();
    expect(await heldFlags(f.run, sentenceIds)).toEqual([true, true, false, true, true, false]);
  });

  it("hiding a claim holds sentences in a version older than the 20 newest", async () => {
    const f = await setup();
    const { claimId, sentenceIds } = await f.run(async (ctx) => {
      const claimId = await addClaim(ctx, f, { status: "published" });
      const sentenceIds: Id<"pageSentence">[] = [];
      for (let version = 1; version <= 25; version++) {
        sentenceIds.push(...(await addPage(ctx, f.placeId, version, [{ claimIds: [claimId] }])));
      }
      return { claimId, sentenceIds };
    });
    await f.run((ctx) => hideClaims(ctx, [claimId], { now: NOW }));
    expect(await heldFlags(f.run, sentenceIds)).toEqual(Array(25).fill(true));
  });

  it("hiding a claim holds sentences beyond the first 500 in a version", async () => {
    const f = await setup();
    const { claimId, sentenceIds } = await f.run(async (ctx) => {
      const claimId = await addClaim(ctx, f, { status: "published" });
      return {
        claimId,
        sentenceIds: await addPage(
          ctx,
          f.placeId,
          1,
          Array.from({ length: 501 }, () => ({ claimIds: [claimId] })),
        ),
      };
    });
    expect(await f.run((ctx) => hideClaims(ctx, [claimId], { now: NOW }))).toEqual({
      hidden: 1,
      sentencesHeld: 501,
    });
    expect(await heldFlags(f.run, sentenceIds)).toEqual(Array(501).fill(true));
  });

  it("a sentence cap reached fails closed with conflict and hides nothing", async () => {
    const f = await setup();
    const { claimId, sentenceIds } = await f.run(async (ctx) => {
      const claimId = await addClaim(ctx, f, { status: "published" });
      return {
        claimId,
        sentenceIds: await addPage(
          ctx,
          f.placeId,
          1,
          Array.from({ length: MAX_CASCADE_DOCUMENTS_READ }, () => ({ claimIds: [claimId] })),
        ),
      };
    });
    const before = await readClaim(f.run, claimId);
    await failsWith(
      f.run((ctx) => hideClaims(ctx, [claimId], { now: NOW })),
      "conflict",
    );
    expect(await readClaim(f.run, claimId)).toEqual(before);
    expect(await heldFlags(f.run, sentenceIds)).toEqual(Array(sentenceIds.length).fill(false));
    expect(await audits(f.run)).toEqual([]);
  }, 60000);

  it("hideClaims over 120 claims across 3 versions holds every citing sentence in one pass", async () => {
    const f = await setup();
    const { claimIds, sentenceIds } = await f.run(async (ctx) => {
      const claimIds: Id<"claim">[] = [];
      for (let i = 0; i < 121; i++) claimIds.push(await addClaim(ctx, f, { status: "published" }));
      const sentenceIds: Id<"pageSentence">[] = [];
      for (let version = 1; version <= 3; version++) {
        sentenceIds.push(
          ...(await addPage(
            ctx,
            f.placeId,
            version,
            claimIds.map((id) => ({ claimIds: [id, claimIds[0]!] })),
          )),
        );
      }
      return { claimIds, sentenceIds };
    });
    const result = await f.run(async (ctx) => {
      const queries = vi.spyOn(ctx.db, "query");
      try {
        const result = await hideClaims(ctx, claimIds, { by: f.owner, now: NOW });
        expect(queries.mock.calls.filter(([table]) => table === "pageVersion")).toHaveLength(1);
        expect(queries.mock.calls.filter(([table]) => table === "pageSentence")).toHaveLength(3);
        return result;
      } finally {
        queries.mockRestore();
      }
    });
    expect(result).toEqual({ hidden: 121, sentencesHeld: 363 });
    expect(await heldFlags(f.run, sentenceIds)).toEqual(Array(363).fill(true));
    for (const id of claimIds) expect((await readClaim(f.run, id)).status).toBe("hidden");
  });

  it("an owner of another place cannot confirm", async () => {
    const f = await setup();
    const claimId = await f.run(async (ctx) => {
      const placeId = await addPlace(ctx, f.creator);
      const otherOwner = await ctx.db.insert("person", {
        tokenIdentifier: unique("https://mock.invalid|owner"),
        clerkUserId: unique("mock-owner"),
        role: "business_owner",
        displayName: "Mock other owner",
        isMock: true,
      });
      await ctx.db.insert("placeOwner", {
        placeId,
        personId: otherOwner,
        verifiedBy: f.steward,
        verifiedAt: 1,
      });
      return addClaim(ctx, f, { placeId });
    });
    await failsWith(
      f.run((ctx) =>
        transitionClaim(ctx, claimId, "confirm", { actor: "owner", by: f.owner, now: NOW }),
      ),
      "forbidden",
    );
    expect((await readClaim(f.run, claimId)).status).toBe("proposed");
    expect(await audits(f.run)).toEqual([]);
  });

  it("a demoted owner cannot confirm", async () => {
    const f = await setup();
    const claimId = await f.run(async (ctx) => {
      await ctx.db.patch("person", f.owner, { role: "user" });
      return addClaim(ctx, f);
    });
    await failsWith(
      f.run((ctx) =>
        transitionClaim(ctx, claimId, "confirm", { actor: "owner", by: f.owner, now: NOW }),
      ),
      "forbidden",
    );
    expect((await readClaim(f.run, claimId)).status).toBe("proposed");
    expect(await audits(f.run)).toEqual([]);
  });

  it("a non-steward cannot act as steward", async () => {
    const f = await setup();
    const { a, b } = await f.run(async (ctx) => ({
      a: await addClaim(ctx, f, { status: "published" }),
      b: await addClaim(ctx, f, { status: "published" }),
    }));
    await failsWith(
      f.run((ctx) =>
        transitionClaim(ctx, a, "hide", { actor: "steward", by: f.creator, now: NOW }),
      ),
      "forbidden",
    );
    await failsWith(
      f.run((ctx) => disputeClaims(ctx, a, b, { by: f.creator, now: NOW })),
      "forbidden",
    );
    expect((await readClaim(f.run, a)).status).toBe("published");
    expect((await readClaim(f.run, b)).status).toBe("published");
    expect(await audits(f.run)).toEqual([]);
  });

  it("hideClaims verifies ownership of each place and rolls back earlier hides", async () => {
    const f = await setup();
    const { own, other } = await f.run(async (ctx) => ({
      own: await addClaim(ctx, f, { status: "published" }),
      other: await addClaim(ctx, f, {
        placeId: await addPlace(ctx, f.creator),
        status: "published",
      }),
    }));
    for (const by of [f.owner, f.creator]) {
      await failsWith(
        f.run((ctx) => hideClaims(ctx, [own, other], { by, now: NOW })),
        "forbidden",
      );
      expect((await readClaim(f.run, own)).status).toBe("published");
      expect((await readClaim(f.run, other)).status).toBe("published");
      expect(await audits(f.run)).toEqual([]);
    }
    expect(
      await f.run((ctx) => hideClaims(ctx, [own, other], { by: f.steward, now: NOW })),
    ).toEqual({ hidden: 2, sentencesHeld: 0 });
  });

  it("hiding one of two disputed claims returns the partner to published", async () => {
    const f = await setup();
    const { a, b, sentenceIds } = await f.run(async (ctx) => {
      const a = await addClaim(ctx, f, { status: "published" });
      const b = await addClaim(ctx, f, { status: "published" });
      await disputeClaims(ctx, a, b, { by: f.steward, now: NOW });
      expect(await ctx.db.get("claim", a)).toMatchObject({ status: "disputed", disputedWith: b });
      expect(await ctx.db.get("claim", b)).toMatchObject({ status: "disputed", disputedWith: a });
      const sentenceIds = await addPage(ctx, f.placeId, 1, [
        { claimIds: [a] },
        { claimIds: [b] },
        { claimIds: [a, b] },
      ]);
      return { a, b, sentenceIds };
    });
    await f.run((ctx) => transitionClaim(ctx, a, "hide", { actor: "system", now: NOW }));
    expect((await readClaim(f.run, a)).status).toBe("hidden");
    expect((await readClaim(f.run, a)).disputedWith).toBeUndefined();
    expect((await readClaim(f.run, b)).status).toBe("published");
    expect((await readClaim(f.run, b)).disputedWith).toBeUndefined();
    expect(await heldFlags(f.run, sentenceIds)).toEqual([true, false, true]);
  });

  it("partner revert writes an undispute audit entry", async () => {
    const f = await setup();
    const { a, b } = await f.run(async (ctx) => {
      const a = await addClaim(ctx, f, { status: "published" });
      const b = await addClaim(ctx, f, { status: "published" });
      await disputeClaims(ctx, a, b, { by: f.steward, now: NOW });
      return { a, b };
    });
    await f.run((ctx) => hideClaims(ctx, [a], { by: f.owner, now: NOW }));
    const entries = await audits(f.run);
    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.action === "claim.undispute")).toMatchObject([
      {
        targetType: "claim",
        targetId: b,
        actorKind: "person",
        actorPersonId: f.owner,
        diff: { status: { from: "disputed", to: "published" } },
      },
    ]);
  });

  it.each(["edit", "remove"] as const)(
    "%s clears a disputed claim and its partner",
    async (event) => {
      const f = await setup();
      const { a, b } = await f.run(async (ctx) => {
        const a = await addClaim(ctx, f, { status: "published" });
        const b = await addClaim(ctx, f, { status: "published" });
        await disputeClaims(ctx, a, b, { by: f.steward, now: NOW });
        return { a, b };
      });
      const changed = await f.run((ctx) =>
        transitionClaim(ctx, a, event, {
          actor: "owner",
          by: f.owner,
          now: NOW,
          textOriginal: "Mock replacement.",
        }),
      );
      expect(changed.status).toBe(event === "edit" ? "owner_confirmed" : "hidden");
      expect(changed.disputedWith).toBeUndefined();
      const partner = await readClaim(f.run, b);
      expect(partner.status).toBe("published");
      expect(partner.disputedWith).toBeUndefined();
    },
  );

  it("undispute clears both links", async () => {
    const f = await setup();
    const { a, b, sentenceIds } = await f.run(async (ctx) => {
      const a = await addClaim(ctx, f, { status: "published" });
      const b = await addClaim(ctx, f, { status: "published" });
      await disputeClaims(ctx, a, b, { by: f.steward, now: NOW });
      const sentenceIds = await addPage(ctx, f.placeId, 1, [{ claimIds: [a, b] }]);
      return { a, b, sentenceIds };
    });
    await f.run((ctx) => transitionClaim(ctx, a, "undispute", { actor: "system", now: NOW }));
    for (const id of [a, b]) {
      const claim = await readClaim(f.run, id);
      expect(claim.status).toBe("published");
      expect(claim.disputedWith).toBeUndefined();
    }
    expect(await heldFlags(f.run, sentenceIds)).toEqual([false]);
  });

  it("reopen returns published open text to proposed, clears reviewerId and holds its sentences", async () => {
    const f = await setup(false);
    const { claimId, sentenceIds } = await f.run(async (ctx) => {
      const claimId = await addClaim(ctx, f, { origin: "open_text", status: "published" });
      // Older rows can carry a timestamp as well as the steward's approval.
      await ctx.db.patch("claim", claimId, { confirmedAt: 1 });
      return { claimId, sentenceIds: await addPage(ctx, f.placeId, 1, [{ claimIds: [claimId] }]) };
    });
    const reopened = await f.run(async (ctx) => {
      const claim = await transitionClaim(ctx, claimId, "reopen", { actor: "system", now: NOW });
      await ctx.db.insert("placeOwner", {
        placeId: f.placeId,
        personId: f.owner,
        verifiedBy: f.steward,
        verifiedAt: NOW,
      });
      return claim;
    });
    expect(reopened.status).toBe("proposed");
    expect(reopened.reviewerId).toBeUndefined();
    expect(reopened.confirmedAt).toBeUndefined();
    expect(reopened.disputedWith).toBeUndefined();
    expect(await heldFlags(f.run, sentenceIds)).toEqual([true]);
  });

  it("reopening disputed open text clears the partner and holds only its own citations", async () => {
    const f = await setup(false);
    const { a, b, sentenceIds } = await f.run(async (ctx) => {
      const a = await addClaim(ctx, f, { origin: "open_text", status: "published" });
      const b = await addClaim(ctx, f, { status: "published" });
      await disputeClaims(ctx, a, b, { by: f.steward, now: NOW });
      return {
        a,
        b,
        sentenceIds: await addPage(ctx, f.placeId, 1, [{ claimIds: [a] }, { claimIds: [b] }]),
      };
    });
    const reopened = await f.run((ctx) =>
      transitionClaim(ctx, a, "reopen", { actor: "steward", by: f.steward, now: NOW }),
    );
    expect(reopened.status).toBe("proposed");
    expect(reopened.disputedWith).toBeUndefined();
    const partner = await readClaim(f.run, b);
    expect(partner.status).toBe("published");
    expect(partner.disputedWith).toBeUndefined();
    expect(await heldFlags(f.run, sentenceIds)).toEqual([true, false]);
  });

  it("a refused transition throws conflict and changes nothing", async () => {
    const f = await setup();
    const claimId = await f.run((ctx) => addClaim(ctx, f, { status: "published" }));
    const before = await readClaim(f.run, claimId);
    const beforeAudit = await audits(f.run);
    const work = f.run((ctx) =>
      transitionClaim(ctx, claimId, "confirm", { actor: "owner", by: f.owner, now: NOW }),
    );
    await failsWith(work, "conflict");
    await expect(work).rejects.toMatchObject({
      data: { message: expect.stringMatching(/confirm.*published.*owner.*interview/) },
    });
    expect(await readClaim(f.run, claimId)).toEqual(before);
    expect(await audits(f.run)).toEqual(beforeAudit);
  });

  it("confirmation uses the actual placeOwner rows", async () => {
    const f = await setup();
    const claimId = await f.run((ctx) => addClaim(ctx, f, { origin: "open_text" }));
    await failsWith(
      f.run((ctx) =>
        transitionClaim(ctx, claimId, "confirm", { actor: "steward", by: f.steward, now: NOW }),
      ),
      "conflict",
    );
    expect((await readClaim(f.run, claimId)).status).toBe("proposed");
    expect(await audits(f.run)).toEqual([]);
  });

  it("an open-text caution fails with conflict before the publication rule", async () => {
    const f = await setup(false);
    const claimId = await f.run(async (ctx) => {
      const id = await addClaim(ctx, f, { origin: "open_text" });
      await ctx.db.patch("claim", id, {
        kind: "caution",
        cautionType: "mock",
        authorId: f.creator,
      });
      return id;
    });
    await failsWith(
      f.run((ctx) =>
        transitionClaim(ctx, claimId, "confirm", { actor: "steward", by: f.steward, now: NOW }),
      ),
      "conflict",
    );
  });

  it("a missing claim is not_found", async () => {
    const f = await setup();
    const missing = await f.run(async (ctx) => {
      const id = await addClaim(ctx, f);
      await ctx.db.delete("claim", id);
      return id;
    });
    await failsWith(
      f.run((ctx) => transitionClaim(ctx, missing, "hide", { actor: "system", now: NOW })),
      "not_found",
    );
    expect(await audits(f.run)).toEqual([]);
  });

  it("owner or steward without by throws", async () => {
    const f = await setup();
    const claimId = await f.run((ctx) => addClaim(ctx, f));
    const before = await readClaim(f.run, claimId);
    for (const actor of ["owner", "steward"] as const) {
      const work = f.run((ctx) => transitionClaim(ctx, claimId, "confirm", { actor, now: NOW }));
      await expect(work).rejects.toThrow(`Claim actor ${actor} requires by`);
      await expect(work).rejects.not.toHaveProperty("data");
    }
    expect(await readClaim(f.run, claimId)).toEqual(before);
    expect(await audits(f.run)).toEqual([]);
  });

  it("disputeClaims refuses claims of different places, the same claim twice, and a non-published claim", async () => {
    const f = await setup();
    const { a, b, otherPlace, proposed } = await f.run(async (ctx) => {
      const placeId = await addPlace(ctx, f.creator);
      return {
        a: await addClaim(ctx, f, { status: "published" }),
        b: await addClaim(ctx, f, { status: "published" }),
        otherPlace: await addClaim(ctx, f, { placeId, status: "published" }),
        proposed: await addClaim(ctx, f),
      };
    });
    const before = await Promise.all(
      [a, b, otherPlace, proposed].map((id) => readClaim(f.run, id)),
    );
    for (const [first, second] of [
      [a, otherPlace],
      [a, a],
      [a, proposed],
      [proposed, b],
    ] as const) {
      await failsWith(
        f.run((ctx) => disputeClaims(ctx, first, second, { by: f.steward, now: NOW })),
        "conflict",
      );
    }
    expect(
      await Promise.all([a, b, otherPlace, proposed].map((id) => readClaim(f.run, id))),
    ).toEqual(before);
    expect(await audits(f.run)).toEqual([]);
  });

  it("hideClaims skips hidden claims and reports counts", async () => {
    const f = await setup();
    const { a, b, hidden, sentenceIds } = await f.run(async (ctx) => {
      const a = await addClaim(ctx, f, { status: "published" });
      const b = await addClaim(ctx, f, { status: "published" });
      const hidden = await addClaim(ctx, f, { status: "hidden" });
      const sentenceIds = await addPage(ctx, f.placeId, 1, [
        { claimIds: [a] },
        { claimIds: [a, b] },
        { claimIds: [b] },
        { claimIds: [hidden], held: true },
      ]);
      return { a, b, hidden, sentenceIds };
    });
    const result = await f.run((ctx) => hideClaims(ctx, [hidden, a, a, b], { now: NOW }));
    expect(result).toEqual({ hidden: 2, sentencesHeld: 3 });
    expect(await heldFlags(f.run, sentenceIds)).toEqual([true, true, true, true]);
    const entries = await audits(f.run);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.actorKind === "system")).toBe(true);
    expect(await f.run((ctx) => hideClaims(ctx, [a, b, hidden], { now: NOW }))).toEqual({
      hidden: 0,
      sentencesHeld: 0,
    });
    expect(await audits(f.run)).toEqual(entries);
    const another = await f.run((ctx) => addClaim(ctx, f));
    expect(await f.run((ctx) => hideClaims(ctx, [another], { by: f.steward, now: NOW }))).toEqual({
      hidden: 1,
      sentencesHeld: 0,
    });
    expect((await audits(f.run)).at(-1)).toMatchObject({
      actorKind: "person",
      actorPersonId: f.steward,
    });
    expect(await f.run((ctx) => hideClaims(ctx, [], { now: NOW }))).toEqual({
      hidden: 0,
      sentencesHeld: 0,
    });
  });

  it("holdSentencesCiting counts newly held sentences once", async () => {
    const f = await setup();
    const { a, b, sentenceIds } = await f.run(async (ctx) => {
      const a = await addClaim(ctx, f, { status: "published" });
      const b = await addClaim(ctx, f, { status: "published" });
      return {
        a,
        b,
        sentenceIds: await addPage(ctx, f.placeId, 1, [
          { claimIds: [a, b] },
          { claimIds: [a] },
          { claimIds: [b], held: true },
        ]),
      };
    });
    expect(await f.run((ctx) => holdSentencesCiting(ctx, f.placeId, []))).toBe(0);
    expect(await f.run((ctx) => holdSentencesCiting(ctx, f.placeId, [a, b, a]))).toBe(2);
    expect(await f.run((ctx) => holdSentencesCiting(ctx, f.placeId, [a, b]))).toBe(0);
    expect(await heldFlags(f.run, sentenceIds)).toEqual([true, true, true]);
    expect((await readClaim(f.run, a)).status).toBe("published");
    expect(await audits(f.run)).toEqual([]);
  });

  it("every changed claim writes its own audit entry with its actor", async () => {
    const cases: readonly (readonly [Exclude<ClaimEvent, "dispute">, ClaimActor])[] = [
      ["confirm", "owner"],
      ["confirm", "steward"],
      ["edit", "owner"],
      ["remove", "owner"],
      ["remove", "steward"],
      ["publish", "steward"],
      ["publish", "system"],
      ["undispute", "steward"],
      ["undispute", "system"],
      ["hide", "steward"],
      ["hide", "system"],
      ["reopen", "steward"],
      ["reopen", "system"],
    ];
    for (const [event, actor] of cases) {
      const openText = event === "reopen" || (event === "confirm" && actor === "steward");
      const f = await setup(!openText);
      const claimId = await f.run(async (ctx) => {
        const id = await addClaim(ctx, f, {
          origin: openText ? "open_text" : "creator_note",
          status:
            event === "publish"
              ? "owner_confirmed"
              : event === "undispute" || event === "reopen"
                ? "published"
                : "proposed",
        });
        if (event === "undispute") {
          const partner = await addClaim(ctx, f, { status: "published" });
          await disputeClaims(ctx, id, partner, { by: f.steward, now: NOW });
        }
        return id;
      });
      const before = await readClaim(f.run, claimId);
      const entriesBefore = await audits(f.run);
      const by = actor === "system" ? undefined : actor === "owner" ? f.owner : f.steward;
      const changed = await f.run((ctx) =>
        transitionClaim(ctx, claimId, event, {
          actor,
          by,
          now: NOW,
          textOriginal: "Mock audited edit.",
        }),
      );
      const entries = await audits(f.run);
      expect(entries, `${event} by ${actor}`).toHaveLength(
        entriesBefore.length + (event === "undispute" ? 2 : 1),
      );
      const entry = entries.at(-1);
      expect(entry).toMatchObject({
        action: `claim.${event}`,
        targetType: "claim",
        targetId: claimId,
        actorKind: by ? "person" : "system",
      });
      expect(entry?.actorPersonId).toBe(by);
      expect(entry?.diff).toEqual({
        status: { from: before.status, to: changed.status },
        ...(event === "edit"
          ? { textOriginal: { from: before.textOriginal, to: "Mock audited edit." } }
          : {}),
      });
    }
  });

  it("disputeClaims writes one person audit entry per claim and keeps both citable", async () => {
    const f = await setup();
    const { a, b, sentenceIds } = await f.run(async (ctx) => {
      const a = await addClaim(ctx, f, { status: "published" });
      const b = await addClaim(ctx, f, { status: "published" });
      return { a, b, sentenceIds: await addPage(ctx, f.placeId, 1, [{ claimIds: [a, b] }]) };
    });
    await f.run((ctx) => disputeClaims(ctx, a, b, { by: f.steward, now: NOW }));
    const entries = await audits(f.run);
    expect(entries).toHaveLength(2);
    for (const [claimId, partner] of [
      [a, b],
      [b, a],
    ] as const) {
      expect(await readClaim(f.run, claimId)).toMatchObject({
        status: "disputed",
        disputedWith: partner,
      });
      expect(entries.find((entry) => entry.targetId === claimId)).toMatchObject({
        actorKind: "person",
        actorPersonId: f.steward,
        action: "claim.dispute",
        targetType: "claim",
        diff: { status: { from: "published", to: "disputed" } },
      });
    }
    expect(await heldFlags(f.run, sentenceIds)).toEqual([false]);
  });
});
