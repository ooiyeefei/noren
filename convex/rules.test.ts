/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { triggers } from "./lib/gate";
import schema from "./schema";

// The data-model rules, driven through the same triggers the app's mutations use. They guard the
// constitution and spec rules named on each group (research D19).

const modules = import.meta.glob("./**/*.ts");

type Run = <T>(fn: (ctx: MutationCtx) => Promise<T>) => Promise<T>;

function backend(): Run {
  const t = convexTest(schema, modules);
  return (fn) => t.run((ctx) => fn(triggers.wrapDB(ctx)));
}

/** Rejects with a rule failure whose name is `rule`. */
const violates = (work: Promise<unknown>, rule: string) =>
  expect(work).rejects.toThrow(new RegExp(rule));

let counter = 0;
const unique = (prefix: string) => `${prefix}-${++counter}`;

const person = (ctx: MutationCtx, role: Doc<"person">["role"] = "creator", isMock = false) =>
  ctx.db.insert("person", {
    tokenIdentifier: unique("https://test.invalid|user"),
    clerkUserId: unique("user"),
    role,
    displayName: "Test Person",
    isMock,
  });

const place = (ctx: MutationCtx, createdBy: Id<"person">, regionId = "nagasaki") =>
  ctx.db.insert("place", {
    regionId,
    slug: unique("place"),
    visibility: "draft",
    createdBy,
    isMock: false,
  });

const interview = (ctx: MutationCtx, placeId: Id<"place">, interviewerId: Id<"person">) =>
  ctx.db.insert("interview", {
    placeId,
    interviewerId,
    language: "ja",
    status: "consent_pending",
    isMock: false,
  });

const consent = (ctx: MutationCtx, interviewId: Id<"interview">, recordedBy: Id<"person">) =>
  ctx.db.insert("consent", {
    interviewId,
    scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
    textVersion: "draft-0",
    textLang: "en",
    recordedAt: Date.now(),
    recordedBy,
    assisted: false,
  });

/** A transcript row; `corrected` makes it a person-corrected version. */
const transcript = (
  ctx: MutationCtx,
  interviewId: Id<"interview">,
  version: number,
  corrected: boolean,
  by: Id<"person">,
) =>
  ctx.db.insert("transcript", {
    interviewId,
    version,
    lang: "ja",
    origin: corrected ? "human_corrected" : "machine",
    segments: [{ start: 0, end: 1, text: "text" }],
    ...(corrected ? { createdBy: by } : { modelVersion: "test-model" }),
  });

/** An interview claim with a valid quote span; the caller supplies the transcript it cites. */
const interviewClaim = (
  ctx: MutationCtx,
  placeId: Id<"place">,
  transcriptId: Id<"transcript">,
  status: Doc<"claim">["status"] = "proposed",
) =>
  ctx.db.insert("claim", {
    placeId,
    kind: "story",
    textOriginal: "text",
    langOriginal: "ja",
    origin: "interview",
    sourceTranscriptId: transcriptId,
    spanStart: 0,
    spanEnd: 4,
    quote: "text",
    status,
    ...(status === "owner_confirmed" || status === "published" ? { confirmedAt: Date.now() } : {}),
    isMock: false,
  });

const openTextSnippet = (ctx: MutationCtx, placeId: Id<"place">) =>
  ctx.db.insert("openTextSnippet", {
    placeId,
    lang: "en",
    text: "A bridge.",
    licence: "CC-BY-SA-4.0",
    sourceUrl: "https://example.org/a",
    attribution: "Example",
    retrievedAt: Date.now(),
  });

const openTextClaim = (
  ctx: MutationCtx,
  placeId: Id<"place">,
  snippetId: Id<"openTextSnippet">,
  steward: Id<"person">,
  status: Doc<"claim">["status"],
) =>
  ctx.db.insert("claim", {
    placeId,
    kind: "fact",
    textOriginal: "A bridge.",
    langOriginal: "en",
    origin: "open_text",
    sourceOpenTextId: snippetId,
    status,
    reviewerId: steward,
    isMock: false,
  });

const pageVersion = (ctx: MutationCtx, placeId: Id<"place">, version = 1) =>
  ctx.db.insert("pageVersion", { placeId, version, generatedBy: "test-model", status: "held" });

/** A creator, a place and an interview, ready for the consent and claim tests. */
async function interviewSetup(run: Run) {
  return run(async (ctx) => {
    const creator = await person(ctx);
    const placeId = await place(ctx, creator);
    const interviewId = await interview(ctx, placeId, creator);
    return { creator, placeId, interviewId };
  });
}

describe("consent (FR-008)", () => {
  it("is refused unless all four scopes are given", async () => {
    const run = backend();
    const { creator, interviewId } = await interviewSetup(run);
    const give = (voiceRetention: boolean) => (ctx: MutationCtx) =>
      ctx.db.insert("consent", {
        interviewId,
        scope: {
          publish: true,
          aiProcessing: true,
          transferAbroad: true,
          // @ts-expect-error the schema only allows `true`; the runtime check below proves it
          voiceRetention,
        },
        textVersion: "v",
        textLang: "en",
        recordedAt: Date.now(),
        recordedBy: creator,
        assisted: false,
      });
    await expect(run(give(false))).rejects.toThrow(/Validator error/);
    // The same row with the scope given is accepted, so the scope was the only difference.
    await run(give(true));
  });

  it("is recorded once per interview", async () => {
    const run = backend();
    const { creator, interviewId } = await interviewSetup(run);
    await run((ctx) => consent(ctx, interviewId, creator));
    await violates(
      run((ctx) => consent(ctx, interviewId, creator)),
      "consent_one_per_interview",
    );
  });

  it("blocks audio and later statuses until a consent exists, and allows them after", async () => {
    const run = backend();
    const { creator, interviewId } = await interviewSetup(run);
    await violates(
      run((ctx) => ctx.db.patch(interviewId, { status: "uploaded" })),
      "interview_requires_consent",
    );
    await run(async (ctx) => {
      const audio = await ctx.storage.store(new Blob(["audio"]));
      await expect(ctx.db.patch(interviewId, { audioStorageId: audio })).rejects.toThrow(
        /interview_requires_consent/,
      );
    });

    await run((ctx) => consent(ctx, interviewId, creator));
    await run(async (ctx) => {
      const audio = await ctx.storage.store(new Blob(["audio"]));
      await ctx.db.patch(interviewId, { audioStorageId: audio, status: "uploaded" });
    });
  });

  it("lets an interview be marked withdrawn, then blocks any further progress", async () => {
    const run = backend();
    const { creator, interviewId } = await interviewSetup(run);
    const consentId = await run((ctx) => consent(ctx, interviewId, creator));
    await run((ctx) => ctx.db.patch(interviewId, { status: "uploaded" }));

    await run((ctx) => ctx.db.patch(consentId, { withdrawnAt: Date.now() }));
    // Hiding is never blocked, even if the audio has not been cleared yet.
    await run((ctx) => ctx.db.patch(interviewId, { status: "withdrawn" }));
    await violates(
      run((ctx) => ctx.db.patch(interviewId, { status: "transcribing" })),
      "interview_requires_consent",
    );
  });
});

describe("interview claims (FR-009, FR-010, principle III)", () => {
  it("a whole-transcript span with the quote '。' is refused", async () => {
    const run = backend();
    const { creator, placeId, interviewId } = await interviewSetup(run);
    const text = "架空のテストです。\n喫茶𠮷です。";
    const transcriptId = await run(async (ctx) => {
      const id = await transcript(ctx, interviewId, 1, true, creator);
      await ctx.db.patch("transcript", id, {
        segments: text.split("\n").map((text, start) => ({ start, end: start + 1, text })),
      });
      return id;
    });
    await violates(
      run((ctx) =>
        ctx.db.insert("claim", {
          placeId,
          kind: "story",
          textOriginal: "テスト記述。",
          langOriginal: "ja",
          origin: "interview",
          sourceTranscriptId: transcriptId,
          spanStart: 0,
          spanEnd: text.length,
          quote: "。",
          status: "proposed",
          isMock: false,
        }),
      ),
      "claim_interview_needs_quote",
    );
    expect(await run((ctx) => ctx.db.query("claim").take(10))).toEqual([]);
  });

  it("a quote equal to the slice passes, including surrogate pairs", async () => {
    const run = backend();
    const { creator, placeId, interviewId } = await interviewSetup(run);
    const text = "テスト。\n喫茶𠮷です。";
    const transcriptId = await run(async (ctx) => {
      const id = await transcript(ctx, interviewId, 1, true, creator);
      await ctx.db.patch("transcript", id, {
        segments: text.split("\n").map((text, start) => ({ start, end: start + 1, text })),
      });
      return id;
    });
    for (const quote of [text, "𠮷", "。\n喫茶𠮷"]) {
      const spanStart = text.indexOf(quote);
      const claimId = await run((ctx) =>
        ctx.db.insert("claim", {
          placeId,
          kind: "story",
          textOriginal: "テスト記述。",
          langOriginal: "ja",
          origin: "interview",
          sourceTranscriptId: transcriptId,
          spanStart,
          spanEnd: spanStart + quote.length,
          quote,
          status: "proposed",
          isMock: false,
        }),
      );
      expect(await run((ctx) => ctx.db.get("claim", claimId))).toMatchObject({ quote });
    }
    for (const [spanStart, spanEnd] of [
      [-1, 3],
      [0.5, 4],
      [0, text.length + 1],
      [0, 0],
    ]) {
      await violates(
        run((ctx) =>
          ctx.db.insert("claim", {
            placeId,
            kind: "story",
            textOriginal: "テスト記述。",
            langOriginal: "ja",
            origin: "interview",
            sourceTranscriptId: transcriptId,
            spanStart: spanStart!,
            spanEnd: spanEnd!,
            quote: text,
            status: "proposed",
            isMock: false,
          }),
        ),
        "claim_interview_needs_quote",
      );
    }
  });

  it("needs a quote and a span", async () => {
    const run = backend();
    const { creator, placeId, interviewId } = await interviewSetup(run);
    const transcriptId = await run(async (ctx) => {
      await consent(ctx, interviewId, creator);
      return transcript(ctx, interviewId, 1, true, creator);
    });
    await violates(
      run((ctx) =>
        ctx.db.insert("claim", {
          placeId,
          kind: "story",
          textOriginal: "x",
          langOriginal: "ja",
          origin: "interview",
          sourceTranscriptId: transcriptId,
          status: "proposed",
          isMock: false,
        }),
      ),
      "claim_interview_needs_quote",
    );
  });

  it("rejects a machine transcript and a transcript from another place", async () => {
    const run = backend();
    const { creator, placeId, interviewId } = await interviewSetup(run);
    const { machine, corrected, otherPlace } = await run(async (ctx) => {
      await consent(ctx, interviewId, creator);
      return {
        machine: await transcript(ctx, interviewId, 1, false, creator),
        corrected: await transcript(ctx, interviewId, 2, true, creator),
        otherPlace: await place(ctx, creator),
      };
    });

    await violates(
      run((ctx) => interviewClaim(ctx, placeId, machine)),
      "claim_needs_corrected_transcript",
    );
    await run((ctx) => interviewClaim(ctx, placeId, corrected));
    await violates(
      run((ctx) => interviewClaim(ctx, otherPlace, corrected)),
      "claim_needs_corrected_transcript",
    );
  });

  it("numbers each transcript version once, from 1", async () => {
    const run = backend();
    const { creator, interviewId } = await interviewSetup(run);
    await run((ctx) => transcript(ctx, interviewId, 1, false, creator));
    await violates(
      run((ctx) => transcript(ctx, interviewId, 1, true, creator)),
      "transcript_interview_version_unique",
    );
    await violates(
      run((ctx) => transcript(ctx, interviewId, 0, false, creator)),
      "transcript_version_positive",
    );
  });
});

describe("claim status rules (FR-011, FR-012)", () => {
  async function correctedTranscript(run: Run) {
    const { creator, placeId, interviewId } = await interviewSetup(run);
    const transcriptId = await run(async (ctx) => {
      await consent(ctx, interviewId, creator);
      return transcript(ctx, interviewId, 1, true, creator);
    });
    return { placeId, transcriptId };
  }

  it("cannot be published without a confirmation", async () => {
    const run = backend();
    const { placeId, transcriptId } = await correctedTranscript(run);
    const claimId = await run((ctx) => interviewClaim(ctx, placeId, transcriptId));
    await violates(
      run((ctx) => ctx.db.patch(claimId, { status: "published" })),
      "claim_publication_needs_confirmation",
    );
    await run((ctx) => ctx.db.patch(claimId, { status: "published", confirmedAt: Date.now() }));
  });

  it("requires a vocabulary key and an author for a caution", async () => {
    const run = backend();
    const { placeId, transcriptId } = await correctedTranscript(run);
    await violates(
      run((ctx) =>
        ctx.db.insert("claim", {
          placeId,
          kind: "caution",
          textOriginal: "cash only",
          langOriginal: "ja",
          origin: "interview",
          sourceTranscriptId: transcriptId,
          spanStart: 0,
          spanEnd: 4,
          quote: "text",
          status: "proposed",
          isMock: false,
        }),
      ),
      "claim_caution_needs_key_and_author",
    );
  });

  it("marks disputed claims with the claim they conflict with", async () => {
    const run = backend();
    const { placeId, transcriptId } = await correctedTranscript(run);
    const [a, b] = await run(async (ctx) => [
      await interviewClaim(ctx, placeId, transcriptId, "published"),
      await interviewClaim(ctx, placeId, transcriptId, "published"),
    ]);
    if (a === undefined || b === undefined) throw new Error("fixtures were not created");

    await violates(
      run((ctx) => ctx.db.patch(a, { status: "disputed" })),
      "claim_disputed_link",
    );
    await violates(
      run((ctx) => ctx.db.patch(a, { status: "disputed", disputedWith: a })),
      "claim_disputed_link",
    );
    await run((ctx) => ctx.db.patch(a, { status: "disputed", disputedWith: b }));
  });
});

describe("open text and business owners (constitution III, v1.2.0)", () => {
  async function landmarkWithOpenText(run: Run) {
    return run(async (ctx) => {
      const steward = await person(ctx, "steward");
      const placeId = await place(ctx, steward);
      const snippetId = await openTextSnippet(ctx, placeId);
      return { steward, placeId, snippetId };
    });
  }

  it("may be published, on approval, about a place with no owner", async () => {
    const run = backend();
    const { steward, placeId, snippetId } = await landmarkWithOpenText(run);
    await run((ctx) => openTextClaim(ctx, placeId, snippetId, steward, "published"));
  });

  it("cannot be published once the place has an owner, and an owner cannot be attached over it", async () => {
    const run = backend();
    const { steward, placeId, snippetId } = await landmarkWithOpenText(run);
    const claimId = await run((ctx) =>
      openTextClaim(ctx, placeId, snippetId, steward, "published"),
    );
    const owner = await run((ctx) => person(ctx, "business_owner"));
    const attach = (ctx: MutationCtx) =>
      ctx.db.insert("placeOwner", {
        placeId,
        personId: owner,
        verifiedBy: steward,
        verifiedAt: Date.now(),
      });

    await violates(run(attach), "place_owner_after_open_text");

    await run((ctx) => ctx.db.patch(claimId, { status: "proposed" }));
    await run(attach);
    await violates(
      run((ctx) => openTextClaim(ctx, placeId, snippetId, steward, "published")),
      "claim_open_text_needs_no_owner",
    );
  });
});

describe("page sentences (FR-014, SC-003)", () => {
  async function pageSetup(run: Run) {
    return run(async (ctx) => {
      const creator = await person(ctx);
      const placeId = await place(ctx, creator);
      const interviewId = await interview(ctx, placeId, creator);
      await consent(ctx, interviewId, creator);
      const transcriptId = await transcript(ctx, interviewId, 1, true, creator);
      return {
        placeId,
        creator,
        publishedId: await interviewClaim(ctx, placeId, transcriptId, "published"),
        proposedId: await interviewClaim(ctx, placeId, transcriptId, "proposed"),
        pageVersionId: await pageVersion(ctx, placeId),
        transcriptId,
      };
    });
  }
  const sentence = (
    ctx: MutationCtx,
    pageVersionId: Id<"pageVersion">,
    ordinal: number,
    held: boolean,
    claimIds: Id<"claim">[],
  ) =>
    ctx.db.insert("pageSentence", {
      pageVersionId,
      ordinal,
      lang: "en",
      text: "A sentence.",
      held,
      claimIds,
    });

  it("accepts a sentence that cites a published claim", async () => {
    const run = backend();
    const { publishedId, pageVersionId } = await pageSetup(run);
    await run((ctx) => sentence(ctx, pageVersionId, 1, false, [publishedId]));
  });

  it("accepts a sentence that cites a disputed claim", async () => {
    const run = backend();
    const { publishedId, pageVersionId, placeId, transcriptId } = await pageSetup(run);
    const otherId = await run((ctx) => interviewClaim(ctx, placeId, transcriptId, "published"));
    await run((ctx) => ctx.db.patch(publishedId, { status: "disputed", disputedWith: otherId }));
    await run((ctx) => sentence(ctx, pageVersionId, 1, false, [publishedId]));
  });

  it("rejects a sentence that is not held and cites nothing", async () => {
    const run = backend();
    const { pageVersionId } = await pageSetup(run);
    await violates(
      run((ctx) => sentence(ctx, pageVersionId, 1, false, [])),
      "sentence_needs_claim",
    );
  });

  it("allows a held sentence with no citation, and blocks a proposed claim under an unheld sentence", async () => {
    const run = backend();
    const { proposedId, pageVersionId } = await pageSetup(run);
    await run((ctx) => sentence(ctx, pageVersionId, 1, true, []));
    await violates(
      run((ctx) => sentence(ctx, pageVersionId, 2, false, [proposedId])),
      "sentence_cites_published_claims",
    );
  });

  it("blocks a sentence from citing a claim about another place", async () => {
    const run = backend();
    const { creator, pageVersionId } = await pageSetup(run);
    const elsewhere = await run(async (ctx) => {
      const placeId = await place(ctx, creator);
      const interviewId = await interview(ctx, placeId, creator);
      await consent(ctx, interviewId, creator);
      const transcriptId = await transcript(ctx, interviewId, 1, true, creator);
      return interviewClaim(ctx, placeId, transcriptId, "published");
    });
    await violates(
      run((ctx) => sentence(ctx, pageVersionId, 1, false, [elsewhere])),
      "sentence_cites_same_place",
    );
  });

  it("applies the same checks when a held sentence is released", async () => {
    const run = backend();
    const { proposedId, pageVersionId } = await pageSetup(run);
    const heldId = await run((ctx) => sentence(ctx, pageVersionId, 1, true, [proposedId]));
    await violates(
      run((ctx) => ctx.db.patch(heldId, { held: false })),
      "sentence_cites_published_claims",
    );
  });
});

describe("uniqueness, which Convex does not enforce itself", () => {
  it("gives each person one token identifier", async () => {
    const run = backend();
    const token = unique("https://test.invalid|dup");
    const create = (ctx: MutationCtx) =>
      ctx.db.insert("person", {
        tokenIdentifier: token,
        clerkUserId: unique("user"),
        role: "user",
        displayName: "Same Token",
        isMock: false,
      });
    await run(create);
    await violates(run(create), "person_token_unique");
  });

  it("gives each place one slug per region", async () => {
    const run = backend();
    const creator = await run((ctx) => person(ctx));
    const make = (regionId: string) => (ctx: MutationCtx) =>
      ctx.db.insert("place", {
        regionId,
        slug: "dejima",
        visibility: "draft",
        createdBy: creator,
        isMock: false,
      });
    await run(make("nagasaki"));
    await violates(run(make("nagasaki")), "place_slug_unique");
    await run(make("malaysia"));
  });

  it("gives each place one pin, inside the earth's coordinates", async () => {
    const run = backend();
    const { creator, placeId } = await interviewSetup(run);
    const pin = (lat: number, lng: number) => (ctx: MutationCtx) =>
      ctx.db.insert("pin", { placeId, lat, lng, placedBy: creator, placedAt: Date.now() });
    await violates(run(pin(91, 129.8)), "pin_lat_range");
    await violates(run(pin(32.7, 181)), "pin_lng_range");
    await run(pin(32.7, 129.8));
    await violates(run(pin(32.8, 129.9)), "pin_one_per_place");
  });

  it("allows one primary name per language", async () => {
    const run = backend();
    const { creator, placeId } = await interviewSetup(run);
    const name = (lang: string, value: string, isPrimary: boolean) => (ctx: MutationCtx) =>
      ctx.db.insert("placeName", {
        placeId,
        lang,
        script: lang === "ja" ? "kanji" : "latin",
        value,
        isPrimary,
        confirmedBy: creator,
      });
    await run(name("ja", "出島", true));
    await violates(run(name("ja", "出島和蘭商館跡", true)), "place_name_one_primary_per_lang");
    await run(name("ja", "出島和蘭商館跡", false));
    await run(name("en", "Dejima", true));
    await violates(run(name("en", "  ", false)), "place_name_value_not_blank");
  });
});

describe("other rows", () => {
  it("source demo-consent fields are set together", async () => {
    const run = backend();
    const { creator, placeId } = await interviewSetup(run);
    await violates(
      run((ctx) =>
        ctx.db.insert("source", {
          placeId,
          platform: "youtube",
          adapter: "youtube",
          url: "https://youtu.be/x",
          canonicalUrl: "https://youtu.be/x",
          addedBy: creator,
          status: "live",
          demoConsentAt: Date.now(),
          isMock: false,
        }),
      ),
      "source_demo_consent_paired",
    );
  });

  it("OSM candidates must carry the ODbL licence", async () => {
    const run = backend();
    const candidate = (osmId: number, licence: string) => (ctx: MutationCtx) =>
      ctx.db.insert("seedOsmCandidate", {
        regionId: "nagasaki",
        osmType: "node",
        osmId,
        tags: { "name:ja": "出島" },
        lat: 32.7,
        lng: 129.8,
        // @ts-expect-error the schema only allows ODbL-1.0 here; the runtime check proves it
        licence,
      });
    await expect(run(candidate(1, "CC0"))).rejects.toThrow(/Validator error/);
    await run(candidate(1, "ODbL-1.0"));
    await violates(run(candidate(1, "ODbL-1.0")), "seed_osm_candidate_unique");
  });

  it("AI audit entries name the model", async () => {
    const run = backend();
    await violates(
      run((ctx) =>
        ctx.db.insert("auditLog", { actorKind: "ai", action: "compose", targetType: "place" }),
      ),
      "audit_log_actor_fields",
    );
    await run((ctx) =>
      ctx.db.insert("auditLog", {
        actorKind: "ai",
        action: "compose",
        targetType: "place",
        modelVersion: "test-model",
      }),
    );
  });

  it("link counts are totals per source per day, never negative", async () => {
    const run = backend();
    const { creator, placeId } = await interviewSetup(run);
    const sourceId = await run((ctx) =>
      ctx.db.insert("source", {
        placeId,
        platform: "youtube",
        adapter: "youtube",
        url: "https://youtu.be/y",
        canonicalUrl: "https://youtu.be/y",
        addedBy: creator,
        status: "live",
        isMock: false,
      }),
    );
    const count = (day: string, n: number) => (ctx: MutationCtx) =>
      ctx.db.insert("linkCountDaily", { sourceId, day, count: n, isMock: false });
    await run(count("2026-10-29", 3));
    await violates(run(count("2026-10-29", 1)), "link_count_unique");
    await violates(run(count("29/10/2026", 1)), "link_count_day_format");
    await violates(run(count("2026-10-30", -1)), "link_count_not_negative");
  });
});
