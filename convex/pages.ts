import { v, type Infer } from "convex/values";
import { composeDeterministic, DETERMINISTIC_COMPOSER } from "../src/lib/claims/compose";
import { createGroundingChecker, verbatimEntailment } from "../src/lib/claims/grounding";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { canManagePlace, isPubliclyReadablePlace, isPublicSafeClaim } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requireRole } from "./lib/auth";
import { transitionClaim } from "./lib/claimEffects";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { regionConfig } from "./lib/region";
import {
  claimKindValidator,
  claimOriginValidator,
  licenceValidator,
  translationOriginValidator,
} from "./lib/validators";
import { canReadPlace } from "./lib/visibility";

const sentenceView = v.object({
  lang: v.string(),
  ordinal: v.number(),
  text: v.string(),
  textLang: v.string(),
  translation: v.union(v.literal("original"), translationOriginValidator),
  claimIds: v.array(v.id("claim")),
});
const claimView = v.object({
  _id: v.id("claim"),
  kind: claimKindValidator,
  cautionType: v.optional(v.string()),
  textOriginal: v.string(),
  langOriginal: v.string(),
  origin: claimOriginValidator,
  status: v.union(v.literal("published"), v.literal("disputed")),
  disputedWith: v.optional(v.id("claim")),
  quote: v.optional(v.string()),
  confirmedAt: v.optional(v.number()),
  aiAssisted: v.boolean(),
  isMock: v.boolean(),
  translations: v.array(
    v.object({
      lang: v.string(),
      text: v.string(),
      origin: translationOriginValidator,
      reviewedBy: v.optional(v.string()),
    }),
  ),
  openText: v.optional(
    v.object({
      sourceUrl: v.string(),
      attribution: v.string(),
      licence: licenceValidator,
      revisionRef: v.optional(v.string()),
    }),
  ),
});
const pageView = v.object({
  placeId: v.id("place"),
  version: v.number(),
  composedAt: v.number(),
  generatedBy: v.string(),
  sentences: v.array(sentenceView),
  claims: v.array(claimView),
});
export type PageSentenceView = Infer<typeof sentenceView>;
export type PageClaimView = Infer<typeof claimView>;
export type PageView = Infer<typeof pageView>;

type CitableClaim = Doc<"claim"> & { status: "published" | "disputed" };
function isCitable(claim: Doc<"claim"> | null): claim is CitableClaim {
  return claim !== null && (claim.status === "published" || claim.status === "disputed");
}

async function translationsFor(ctx: QueryCtx, claimId: Id<"claim">) {
  const rows = await ctx.db
    .query("claimTranslation")
    .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claimId))
    .take(50);
  const preferred = new Map<string, Doc<"claimTranslation">>();
  for (const row of rows) {
    if (!preferred.has(row.lang) || row.origin === "human") preferred.set(row.lang, row);
  }
  return [...preferred.values()];
}

export const compose = mutation({
  args: { placeId: v.id("place") },
  returns: v.object({
    pageVersionId: v.id("pageVersion"),
    version: v.number(),
    sentenceCount: v.number(),
    heldCount: v.number(),
    publishedClaims: v.number(),
  }),
  handler: async (ctx, { placeId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const place = await ctx.db.get("place", placeId);
    if (place === null) throw appError("not_found", "place not found");
    const confirmed = await ctx.db
      .query("claim")
      .withIndex("by_placeId_and_status", (q) =>
        q.eq("placeId", placeId).eq("status", "owner_confirmed"),
      )
      .take(200);
    const now = Date.now();
    for (const claim of confirmed) {
      await transitionClaim(ctx, claim._id, "publish", { actor: "steward", by: steward._id, now });
    }
    const claims = (
      await Promise.all(
        (["published", "disputed"] as const).map((status) =>
          ctx.db
            .query("claim")
            .withIndex("by_placeId_and_status", (q) =>
              q.eq("placeId", placeId).eq("status", status),
            )
            .take(200),
        ),
      )
    ).flat();
    const translated = await Promise.all(claims.map((claim) => translationsFor(ctx, claim._id)));
    const sentences = composeDeterministic(
      claims.map((claim, index) => ({
        id: claim._id,
        kind: claim.kind,
        status: claim.status,
        textOriginal: claim.textOriginal,
        langOriginal: claim.langOriginal,
        translations: Object.fromEntries(translated[index]!.map((row) => [row.lang, row.text])),
      })),
      regionConfig(place.regionId).locales,
    );
    if (sentences.length === 0)
      throw appError("conflict", "nothing to compose: no published story or fact claims");
    const textsByClaim = new Map(
      claims.map((claim, index) => [
        claim._id,
        [claim.textOriginal, ...translated[index]!.map((row) => row.text)],
      ]),
    );
    const verdicts = await createGroundingChecker({
      entailment: verbatimEntailment(textsByClaim),
    }).check(
      sentences,
      claims.map((claim) => ({
        id: claim._id,
        status: claim.status,
        textOriginal: claim.textOriginal,
        quote: claim.quote ?? (claim.origin === "open_text" ? claim.textOriginal : ""),
      })),
    );
    const heldCount = verdicts.filter((result) => result.verdict === "hold").length;
    const latest = await ctx.db
      .query("pageVersion")
      .withIndex("by_placeId_and_version", (q) => q.eq("placeId", placeId))
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    const pageVersionId = await ctx.db.insert("pageVersion", {
      placeId,
      version,
      generatedBy: DETERMINISTIC_COMPOSER,
      reviewedBy: steward._id,
      status: heldCount < sentences.length ? "published" : "held",
    });
    for (const [index, sentence] of sentences.entries()) {
      await ctx.db.insert("pageSentence", {
        pageVersionId,
        lang: sentence.lang,
        ordinal: sentence.ordinal,
        text: sentence.text,
        claimIds: sentence.claimIds.map((id) => claims.find((claim) => claim._id === id)!._id),
        held: verdicts[index]!.verdict === "hold",
      });
    }
    const counts = {
      version,
      sentenceCount: sentences.length,
      heldCount,
      publishedClaims: confirmed.length,
    };
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "page.compose",
      targetType: "pageVersion",
      targetId: pageVersionId,
      diff: counts,
    });
    return { pageVersionId, ...counts };
  },
});

export const getPublished = query({
  args: { placeId: v.id("place") },
  returns: v.union(pageView, v.null()),
  handler: async (ctx, { placeId }): Promise<PageView | null> => {
    const viewer = await currentPerson(ctx);
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, viewer, place))) return null;
    const version = await ctx.db
      .query("pageVersion")
      .withIndex("by_placeId_and_status_and_version", (q) =>
        q.eq("placeId", placeId).eq("status", "published"),
      )
      .order("desc")
      .first();
    if (version === null) return null;
    const publicOnly =
      isPubliclyReadablePlace(place) && !(await canManagePlace(ctx, viewer, place));
    const candidates = (
      await Promise.all(
        regionConfig(place.regionId).locales.map((lang) =>
          ctx.db
            .query("pageSentence")
            .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) =>
              q.eq("pageVersionId", version._id).eq("lang", lang),
            )
            .take(200),
        ),
      )
    )
      .flat()
      .filter((sentence) => !sentence.held);
    const claims = new Map<Id<"claim">, CitableClaim>();
    const ids = new Set(candidates.flatMap((sentence) => sentence.claimIds));
    for (const id of ids) {
      const claim = await ctx.db.get("claim", id);
      if (
        isCitable(claim) &&
        claim.placeId === placeId &&
        (!publicOnly || isPublicSafeClaim(claim, place))
      )
        claims.set(id, claim);
    }
    const visible = candidates.filter(
      (sentence) => sentence.claimIds.length > 0 && sentence.claimIds.every((id) => claims.has(id)),
    );
    const cited = new Set(visible.flatMap((sentence) => sentence.claimIds));
    for (const id of claims.keys()) if (!cited.has(id)) claims.delete(id);
    const published = await ctx.db
      .query("claim")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "published"))
      .take(200);
    for (const claim of published) {
      if (
        isCitable(claim) &&
        (claim.kind === "caution" || claim.kind === "topic") &&
        (!publicOnly || isPublicSafeClaim(claim, place))
      )
        claims.set(claim._id, claim);
    }
    const views: PageClaimView[] = [];
    for (const claim of claims.values()) {
      const translations = await translationsFor(ctx, claim._id);
      const snippet =
        claim.origin === "open_text" && claim.sourceOpenTextId !== undefined
          ? await ctx.db.get("openTextSnippet", claim.sourceOpenTextId)
          : null;
      views.push({
        _id: claim._id,
        kind: claim.kind,
        cautionType: claim.cautionType,
        textOriginal: claim.textOriginal,
        langOriginal: claim.langOriginal,
        origin: claim.origin,
        status: claim.status,
        disputedWith: claim.disputedWith,
        quote: claim.quote,
        confirmedAt: claim.confirmedAt,
        aiAssisted: claim.modelVersion !== undefined,
        isMock: claim.isMock,
        translations: translations.map(({ lang, text, origin, reviewedBy }) => ({
          lang,
          text,
          origin,
          reviewedBy,
        })),
        openText:
          snippet === null
            ? undefined
            : {
                sourceUrl: snippet.sourceUrl,
                attribution: snippet.attribution,
                licence: snippet.licence,
                revisionRef: snippet.revisionRef,
              },
      });
    }
    const byId = new Map(views.map((claim) => [claim._id, claim]));
    const sentences: PageSentenceView[] = visible
      .map<PageSentenceView>(({ lang, ordinal, text, claimIds }) => {
        const first = byId.get(claimIds[0]!)!;
        const translated =
          lang === first.langOriginal
            ? undefined
            : first.translations.find((row) => row.lang === lang && row.text === text);
        return {
          lang,
          ordinal,
          text,
          claimIds,
          translation: translated?.origin ?? "original",
          textLang: translated === undefined ? first.langOriginal : lang,
        };
      })
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.ordinal - b.ordinal);
    return {
      placeId,
      version: version.version,
      composedAt: version._creationTime,
      generatedBy: version.generatedBy,
      sentences,
      claims: views,
    };
  },
});
