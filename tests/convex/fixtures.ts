import { convexTest, type TestConvex } from "convex-test";
import nagasaki from "../../regions/nagasaki.json";
import type {
  ClaimKind,
  ClaimOrigin,
  ClaimStatus,
  InterviewStatus,
  PlaceKind,
  Role,
  SourceAdapterId,
  SourceStatus,
  Visibility,
} from "../../src/lib/domain/constants";
import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { triggers } from "../../convex/lib/gate";
import schema from "../../convex/schema";

export const ISSUER = "https://clerk.test.invalid";
// Matches convex-test's module map, supplied by import.meta.glob in each Convex test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Modules = Record<string, () => Promise<any>>;

let serial = 0;

export function newBackend(
  modules: Modules,
  options: { transactionLimits?: { documentsRead?: number; databaseQueries?: number } } = {},
): {
  t: TestConvex<typeof schema>;
  run<T>(fn: (ctx: MutationCtx) => Promise<T>): Promise<T>;
  as(name: string): ReturnType<TestConvex<typeof schema>["withIdentity"]>;
} {
  const t = convexTest({ schema, modules, ...options });
  return {
    t,
    run: (fn) => t.run((ctx) => fn(triggers.wrapDB(ctx))),
    as: (name) => t.withIdentity({ subject: name, issuer: ISSUER }),
  };
}

export type Backend = ReturnType<typeof newBackend>;

export async function addPerson(
  b: Backend,
  name: string,
  role: Role,
  options: { isMock?: boolean } = {},
): Promise<Id<"person">> {
  return await b.run((ctx) =>
    ctx.db.insert("person", {
      tokenIdentifier: `${ISSUER}|${name}`,
      clerkUserId: name,
      role,
      displayName: `Test Person (${name})`,
      isMock: options.isMock ?? false,
    }),
  );
}

export async function addPlace(
  b: Backend,
  options: {
    createdBy: Id<"person">;
    visibility?: Visibility;
    demoPublicBasis?: "fictional";
    kind?: PlaceKind;
    category?: string;
    isMock?: boolean;
    regionId?: string;
    slug?: string;
    withNames?: boolean;
    withPin?: boolean;
  },
): Promise<Id<"place">> {
  return await b.run(async (ctx) => {
    const creator = await ctx.db.get("person", options.createdBy);
    const placeId = await ctx.db.insert("place", {
      createdBy: options.createdBy,
      visibility: options.visibility ?? "draft",
      demoPublicBasis:
        "demoPublicBasis" in options
          ? options.demoPublicBasis
          : options.visibility === "demo_public"
            ? "fictional"
            : undefined,
      kind: options.kind,
      category: options.category,
      isMock: options.isMock ?? (options.visibility === "demo_public" || creator?.isMock || false),
      regionId: options.regionId ?? "nagasaki",
      slug: options.slug ?? `test-place-${++serial}`,
    });
    if (options.withNames ?? true) {
      for (const [lang, script, value] of [
        ["ja", "kanji", "テスト店"],
        ["en", "latin", "Test Shop"],
      ] as const) {
        await ctx.db.insert("placeName", {
          placeId,
          lang,
          script,
          value,
          isPrimary: true,
          confirmedBy: options.createdBy,
        });
      }
    }
    if (options.withPin ?? true) {
      await ctx.db.insert("pin", {
        placeId,
        lat: nagasaki.defaultCenter.lat,
        lng: nagasaki.defaultCenter.lng,
        placedBy: options.createdBy,
        placedAt: Date.now(),
      });
    }
    return placeId;
  });
}

export async function addOwner(
  b: Backend,
  placeId: Id<"place">,
  personId: Id<"person">,
  verifiedBy: Id<"person">,
): Promise<Id<"placeOwner">> {
  return await b.run(async (ctx) => {
    await ctx.db.patch("person", personId, { role: "business_owner" });
    return await ctx.db.insert("placeOwner", {
      placeId,
      personId,
      verifiedBy,
      verifiedAt: Date.now(),
    });
  });
}

export async function addSource(
  b: Backend,
  options: {
    placeId: Id<"place">;
    addedBy: Id<"person">;
    adapter?: SourceAdapterId;
    url?: string;
    status?: SourceStatus;
    demoConsentBy?: Id<"person">;
    isMock?: boolean;
  },
): Promise<Id<"source">> {
  return await b.run(async (ctx) => {
    const person = await ctx.db.get("person", options.addedBy);
    const url = options.url ?? `https://example.com/post-${++serial}`;
    return await ctx.db.insert("source", {
      placeId: options.placeId,
      addedBy: options.addedBy,
      platform: "test",
      adapter: options.adapter ?? "link_card",
      url,
      canonicalUrl: url,
      status: options.status ?? "live",
      demoConsentBy: options.demoConsentBy,
      demoConsentAt: options.demoConsentBy === undefined ? undefined : Date.now(),
      isMock: options.isMock ?? person?.isMock ?? false,
    });
  });
}

export async function addInterview(
  b: Backend,
  options: {
    placeId: Id<"place">;
    interviewerId: Id<"person">;
    consent?: boolean;
    status?: InterviewStatus;
    isMock?: boolean;
    language?: string;
    ownerPersonId?: Id<"person">;
  },
): Promise<Id<"interview">> {
  return await b.run(async (ctx) => {
    const person = await ctx.db.get("person", options.interviewerId);
    const interviewId = await ctx.db.insert("interview", {
      placeId: options.placeId,
      interviewerId: options.interviewerId,
      ownerPersonId: options.ownerPersonId,
      language: options.language ?? "ja",
      status: "consent_pending",
      isMock: options.isMock ?? person?.isMock ?? false,
    });
    if (options.consent ?? true) {
      await ctx.db.insert("consent", {
        interviewId,
        scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
        textVersion: nagasaki.consent.textVersion,
        textLang: options.language ?? "ja",
        recordedAt: Date.now(),
        recordedBy: options.interviewerId,
        assisted: person?.role === "steward",
      });
    }
    if (options.status !== undefined && options.status !== "consent_pending") {
      await ctx.db.patch("interview", interviewId, { status: options.status });
    }
    return interviewId;
  });
}

export async function addCorrectedTranscript(
  b: Backend,
  options: {
    interviewId: Id<"interview">;
    createdBy: Id<"person">;
    segments?: { start: number; end: number; text: string }[];
  },
): Promise<{ transcriptId: Id<"transcript">; text: string }> {
  return await b.run(async (ctx) => {
    const interview = await ctx.db.get("interview", options.interviewId);
    if (interview === null) throw new Error("fixture interview is missing");
    const latest = await ctx.db
      .query("transcript")
      .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", options.interviewId))
      .order("desc")
      .first();
    const segments = options.segments ?? [
      { start: 0, end: 5, text: "これはテスト用の文字起こしです。" },
    ];
    const transcriptId = await ctx.db.insert("transcript", {
      interviewId: options.interviewId,
      createdBy: options.createdBy,
      version: (latest?.version ?? 0) + 1,
      lang: interview.language,
      origin: "human_corrected",
      segments,
    });
    return { transcriptId, text: segments.map((segment) => segment.text).join("\n") };
  });
}

async function fixtureSteward(ctx: MutationCtx): Promise<Id<"person">> {
  const steward = await ctx.db
    .query("person")
    .withIndex("by_role", (q) => q.eq("role", "steward"))
    .first();
  if (steward !== null) return steward._id;
  const name = `test-steward-${++serial}`;
  return await ctx.db.insert("person", {
    tokenIdentifier: `${ISSUER}|${name}`,
    clerkUserId: name,
    role: "steward",
    displayName: "Test Steward (mock)",
    isMock: true,
  });
}

export async function addClaim(
  b: Backend,
  options: {
    placeId: Id<"place">;
    status?: ClaimStatus;
    origin?: ClaimOrigin;
    kind?: ClaimKind;
    text?: string;
    transcriptId?: Id<"transcript">;
    snippetId?: Id<"openTextSnippet">;
    reviewerId?: Id<"person">;
    authorId?: Id<"person">;
    cautionType?: string;
    isMock?: boolean;
    disputedWith?: Id<"claim">;
  },
): Promise<Id<"claim">> {
  if (options.disputedWith !== undefined) {
    throw new Error("addClaim refuses a one-sided dispute; use addDisputePair");
  }
  return await b.run(async (ctx) => {
    const origin = options.origin ?? "creator_note";
    const status = options.status ?? "proposed";
    const confirmed = ["owner_confirmed", "published", "disputed"].includes(status);
    let sourceOpenTextId = options.snippetId;
    let reviewerId = options.reviewerId;
    let quote: string | undefined;
    let isMock = options.isMock;
    let lang = "ja";
    if (origin === "interview") {
      if (options.transcriptId === undefined) {
        throw new Error("an interview fixture claim needs transcriptId");
      }
      const transcript = await ctx.db.get("transcript", options.transcriptId);
      if (transcript === null) throw new Error("fixture transcript is missing");
      quote = transcript.segments
        .map((segment) => segment.text)
        .join("\n")
        .slice(0, 32);
      const interview = await ctx.db.get("interview", transcript.interviewId);
      isMock ??= interview?.isMock ?? false;
      lang = transcript.lang;
    } else if (origin === "open_text") {
      if (confirmed) reviewerId ??= await fixtureSteward(ctx);
      if (sourceOpenTextId === undefined) {
        sourceOpenTextId = await ctx.db.insert("openTextSnippet", {
          placeId: options.placeId,
          lang,
          text: options.text ?? "これは公開ライセンスのテスト用テキストです。",
          licence: "CC-BY-SA-4.0",
          sourceUrl: `https://example.com/open-text-${++serial}`,
          attribution: "Fictional test text, CC BY-SA 4.0",
          retrievedAt: Date.now(),
          approvedBy: reviewerId,
        });
      }
    } else if (isMock === undefined) {
      const author = options.authorId ? await ctx.db.get("person", options.authorId) : null;
      const place = await ctx.db.get("place", options.placeId);
      isMock = author?.isMock || place?.isMock || false;
    }
    return await ctx.db.insert("claim", {
      placeId: options.placeId,
      kind: options.kind ?? "story",
      origin,
      status,
      textOriginal: options.text ?? quote ?? "これはテスト用の記述です。",
      langOriginal: lang,
      sourceTranscriptId: options.transcriptId,
      spanStart: quote === undefined ? undefined : 0,
      spanEnd: quote?.length,
      quote,
      sourceOpenTextId,
      reviewerId,
      authorId: options.authorId,
      cautionType: options.cautionType,
      confirmedAt: confirmed && origin !== "open_text" ? Date.now() : undefined,
      isMock: isMock ?? false,
    });
  });
}

export async function addDisputePair(
  b: Backend,
  firstOptions: Omit<Parameters<typeof addClaim>[1], "status" | "disputedWith">,
  secondOptions: Omit<Parameters<typeof addClaim>[1], "status" | "disputedWith">,
): Promise<{ first: Id<"claim">; second: Id<"claim"> }> {
  if (firstOptions.placeId !== secondOptions.placeId) {
    throw new Error("a dispute pair must belong to the same place");
  }
  const first = await addClaim(b, { ...firstOptions, status: "published" });
  const second = await addClaim(b, { ...secondOptions, status: "published" });
  await b.run(async (ctx) => {
    await ctx.db.patch("claim", first, { status: "disputed", disputedWith: second });
    await ctx.db.patch("claim", second, { status: "disputed", disputedWith: first });
  });
  return { first, second };
}

export async function addPage(
  b: Backend,
  options: {
    placeId: Id<"place">;
    version?: number;
    status?: "held" | "published";
    sentences: { lang: string; text: string; claimIds: Id<"claim">[]; held?: boolean }[];
  },
): Promise<Id<"pageVersion">> {
  return await b.run(async (ctx) => {
    const latest = await ctx.db
      .query("pageVersion")
      .withIndex("by_placeId_and_version", (q) => q.eq("placeId", options.placeId))
      .order("desc")
      .first();
    const pageVersionId = await ctx.db.insert("pageVersion", {
      placeId: options.placeId,
      version: options.version ?? (latest?.version ?? 0) + 1,
      status: options.status ?? "published",
      generatedBy: "test-fixture",
    });
    for (const [ordinal, sentence] of options.sentences.entries()) {
      await ctx.db.insert("pageSentence", {
        pageVersionId,
        ordinal,
        ...sentence,
        held: sentence.held ?? false,
      });
    }
    return pageVersionId;
  });
}

function errorData(error: unknown): { code?: unknown; rule?: unknown } | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) return;
  const data = error.data;
  if (typeof data === "object" && data !== null) return data;
}

/** The ConvexError data code, or what happened instead. */
export async function errorCode(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "did not fail";
  } catch (error) {
    const code = errorData(error)?.code;
    return typeof code === "string" ? code : `threw without a code: ${String(error)}`;
  }
}

/** The rule of a rule_violation, or what happened instead. */
export async function ruleOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "did not fail";
  } catch (error) {
    const data = errorData(error);
    if (data?.code === "rule_violation" && typeof data.rule === "string") return data.rule;
    return typeof data?.code === "string" ? data.code : `threw without a code: ${String(error)}`;
  }
}
