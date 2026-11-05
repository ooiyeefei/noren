import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { guessLang } from "../../src/lib/story-finder/mention";
import { canSeeSource, countsVisits } from "./access";
import type { Viewer } from "./visibility";

/**
 * What a place's story says for this viewer right now: each sentence names the notes behind it by
 * position, and a sentence citing a post that is no longer shown comes off with it. Null when the
 * story is withdrawn or nothing is left of it. The caller has already checked canReadPlace.
 */
export async function liveStory(ctx: QueryCtx, viewer: Viewer, place: Doc<"place">) {
  const story = await ctx.db
    .query("placeStory")
    .withIndex("by_placeId", (q) => q.eq("placeId", place._id))
    .first();
  if (story === null || story.withdrawnAt !== undefined) return null;
  const sentences = [];
  const notes = [];
  const numbered = new Map<string, number>();
  for (const { en, ja, citations } of story.sentences) {
    const sources = [];
    for (const { sourceId, words } of citations) {
      const source = await ctx.db.get("source", sourceId);
      if (source !== null && (await canSeeSource(ctx, viewer, place, source)))
        sources.push({ source, words });
    }
    if (sources.length === 0 || sources.length < citations.length) continue;
    const at = [];
    for (const { source, words } of sources) {
      const key = JSON.stringify([source._id, words]);
      let index = numbered.get(key);
      if (index === undefined) {
        index = notes.length;
        numbered.set(key, index);
        const lang = guessLang(words);
        notes.push({
          sourceId: source._id,
          words,
          ...(lang === undefined ? {} : { lang }),
          ...(source.platform === undefined ? {} : { platform: source.platform }),
          canonicalUrl: source.canonicalUrl,
          ...(source.authorHandle === undefined ? {} : { authorHandle: source.authorHandle }),
          ...(source.postedAt === undefined ? {} : { postedAt: source.postedAt }),
          countsVisits: countsVisits(place, source),
        });
      }
      at.push(index);
    }
    sentences.push({ en, ja, notes: at });
  }
  if (sentences.length === 0) return null;
  return { sentences, notes, postsRead: story.postsRead };
}
