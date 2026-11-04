import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { dropCheck, isExcerptHeld } from "./translationChecks";

/**
 * Translations made from the quote as it stands now; one made from an earlier quote is left out, and
 * so is one the translation check holds back (the card then shows the quote alone).
 */
export async function excerptTranslations(ctx: QueryCtx, source: Doc<"source">) {
  const rows = await ctx.db
    .query("sourceExcerptTranslation")
    .withIndex("by_sourceId_and_lang", (q) => q.eq("sourceId", source._id))
    .take(8);
  const shown: { lang: string; text: string }[] = [];
  for (const row of rows)
    if (row.sourceText === source.excerpt && !(await isExcerptHeld(ctx, row)))
      shown.push({ lang: row.lang, text: row.text });
  return shown;
}

/**
 * Takes a found post's words out of its candidate and marks it hidden, so it is never linked again.
 * What stays is a private record: its address and author key, the check's verdict without its quotes,
 * and in shownQuote the fingerprint that keeps a copy of the post from being shown.
 */
export async function eraseCandidate(
  ctx: MutationCtx,
  candidate: Doc<"mentionCandidate">,
  hiddenBy?: Id<"person">,
) {
  // First, with the quote still there: this status change is what writes the fingerprint.
  if (candidate.status !== "hidden")
    await ctx.db.patch("mentionCandidate", candidate._id, {
      status: "hidden",
      hiddenAt: Date.now(),
      ...(hiddenBy ? { hiddenBy } : {}),
      checkStartedAt: undefined,
    });
  await ctx.db.patch("mentionCandidate", candidate._id, {
    text: "",
    title: undefined,
    locationName: undefined,
    ...(candidate.verdict
      ? { verdict: { ...candidate.verdict, quote: "", evidence: "", topics: [] } }
      : {}),
  });
}

/**
 * Erases what Noren holds of a found post's words once it comes off the page, however it did: the
 * source's quote, every translation and its check, and the candidate's text. Does nothing to a
 * member's post, whose note is the member's own words.
 */
export async function eraseFoundPost(
  ctx: MutationCtx,
  source: Doc<"source">,
  hiddenBy?: Id<"person">,
) {
  if (source.origin !== "story_finder") return;
  const translations = await ctx.db
    .query("sourceExcerptTranslation")
    .withIndex("by_sourceId_and_lang", (q) => q.eq("sourceId", source._id))
    .take(8);
  for (const translation of translations) {
    await dropCheck(ctx, translation._id);
    await ctx.db.delete("sourceExcerptTranslation", translation._id);
  }
  await ctx.db.patch("source", source._id, { excerpt: undefined, excerptLang: undefined });
  const candidate = await ctx.db
    .query("mentionCandidate")
    .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
    .first();
  if (candidate !== null) await eraseCandidate(ctx, candidate, hiddenBy);
}
