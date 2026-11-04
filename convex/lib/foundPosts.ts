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
 * A story's sentences rest on the words they cite, so a post coming off the page takes out every
 * sentence citing it, and the place's run logs, which can quote it.
 */
async function eraseFromPlaceStory(ctx: MutationCtx, source: Doc<"source">) {
  const story = await ctx.db
    .query("placeStory")
    .withIndex("by_placeId", (q) => q.eq("placeId", source.placeId))
    .first();
  if (story !== null) {
    const sentences = story.sentences.filter(
      ({ citations }) => !citations.some(({ sourceId }) => sourceId === source._id),
    );
    if (sentences.length === 0) await ctx.db.delete("placeStory", story._id);
    else if (sentences.length < story.sentences.length)
      await ctx.db.patch("placeStory", story._id, { sentences });
  }
  const runs = await ctx.db
    .query("placeStoryRun")
    .withIndex("by_placeId", (q) => q.eq("placeId", source.placeId))
    .take(50);
  for (const run of runs)
    if (run.steps.length > 0) await ctx.db.patch("placeStoryRun", run._id, { steps: [] });
}

/**
 * Erases what Noren holds of a found post's words once it comes off the page, however it did: the
 * source's quote, every translation and its check, the candidate's text, and any story sentence
 * citing it. Does nothing to a member's post, whose note is the member's own words.
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
  await eraseFromPlaceStory(ctx, source);
  const candidate = await ctx.db
    .query("mentionCandidate")
    .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
    .first();
  if (candidate !== null) await eraseCandidate(ctx, candidate, hiddenBy);
}
