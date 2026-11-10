import { v, type Infer } from "convex/values";
import { guessLang } from "../src/lib/story-finder/mention";
import { firstSentences } from "../src/lib/walk/sentences";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { canSeeSource, isStoryShown } from "./lib/access";
import { appError } from "./lib/errors";
import { excerptTranslations, hasNoCard } from "./lib/foundPosts";
import { liveStory } from "./lib/liveStory";
import { nameView, publicPool } from "./lib/publicPool";
import { regionConfig } from "./lib/region";

// Walk mode's one download. A phone must not tell Noren where it is, so it cannot ask for "the
// places near me" or "the story at this place": it asks once for the whole region and works out
// the rest itself. Everything here is what a signed-out visitor can already read on the map and on
// the place pages, the same for every caller. The query takes only the region, reads no viewer, and
// the region's file switches it off (features.walk) like every other part of walk mode.

/** Words read aloud per story: the first sentence or two, and never more than this many characters. */
const SNIPPET_SENTENCES = 2;
const SNIPPET_CHARS = 300;
/**
 * Places whose story snippet is read. A query may read 32,000 documents and 4,096 index ranges, and
 * each story place costs a few ranges. Places beyond this keep their dot but get no snippet.
 */
const SNIPPET_PLACE_LIMIT = 400;
const STORIES_READ = 10;
const SOURCES_READ = 50;

const snippetView = v.union(
  v.object({
    kind: v.literal("member"),
    writer: v.string(),
    lang: v.string(),
    text: v.string(),
    more: v.boolean(),
  }),
  v.object({
    kind: v.literal("stitched"),
    postsRead: v.number(),
    platforms: v.array(v.string()),
    sentences: v.array(v.object({ en: v.string(), ja: v.string() })),
  }),
  v.object({
    kind: v.literal("post"),
    platform: v.optional(v.string()),
    author: v.optional(v.string()),
    lang: v.optional(v.string()),
    text: v.string(),
    more: v.boolean(),
    translations: v.array(v.object({ lang: v.string(), text: v.string() })),
  }),
);
type SnippetView = Infer<typeof snippetView>;

const walkPlace = v.object({
  slug: v.string(),
  names: v.array(nameView),
  category: v.optional(v.string()),
  pin: v.object({ lat: v.number(), lng: v.number() }),
  /** False is "Not yet confirmed": open data that no person has checked in person. */
  confirmed: v.boolean(),
  hasStory: v.boolean(),
  snippet: v.optional(snippetView),
});

/**
 * The words to read for a place, from the best source it has: the newest story a member wrote, else
 * the story Noren's AI stitched from public posts, else the newest quote of a public post the story
 * finder found. Null when the place has none of these (it may still have a shared post).
 */
async function snippetFor(ctx: QueryCtx, place: Doc<"place">): Promise<SnippetView | null> {
  const stories = await ctx.db
    .query("story")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "live"))
    .order("desc")
    .take(STORIES_READ);
  const story = stories.find((candidate) => isStoryShown(place, candidate));
  if (story !== undefined) {
    const words = firstSentences(story.body, {
      maxSentences: SNIPPET_SENTENCES,
      maxChars: SNIPPET_CHARS,
    });
    if (words.text !== "") {
      const writer = await ctx.db.get("person", story.authorPersonId);
      return {
        kind: "member",
        writer: writer?.displayName ?? "",
        lang: story.lang,
        text: words.text,
        more: words.more,
      };
    }
  }

  const stitched = await liveStory(ctx, null, place);
  if (stitched !== null) {
    const sentences = stitched.sentences.slice(0, SNIPPET_SENTENCES);
    const platforms = new Set<string>();
    for (const sentence of sentences)
      for (const index of sentence.notes) platforms.add(stitched.notes[index]?.platform ?? "web");
    return {
      kind: "stitched",
      postsRead: stitched.postsRead,
      platforms: [...platforms],
      sentences: sentences.map(({ en, ja }) => ({ en, ja })),
    };
  }

  const sources = await ctx.db
    .query("source")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "live"))
    .take(SOURCES_READ);
  let newest: { source: Doc<"source">; when: number } | null = null;
  for (const source of sources) {
    // A found story with a quote and a card of its own on the place page. Tips are not read, and
    // nor are posts from platforms that get no card (their words are for the story agent only).
    if (
      source.origin !== "story_finder" ||
      source.foundKind !== "story" ||
      !source.excerpt ||
      hasNoCard(source) ||
      !(await canSeeSource(ctx, null, place, source))
    )
      continue;
    const when = source.postedAt ?? source.sharedAt ?? source._creationTime;
    if (newest === null || when > newest.when) newest = { source, when };
  }
  if (newest === null) return null;
  const { source } = newest;
  const quote = firstSentences(source.excerpt ?? "", {
    maxSentences: SNIPPET_SENTENCES,
    maxChars: SNIPPET_CHARS,
  });
  if (quote.text === "") return null;
  const lang = source.excerptLang ?? guessLang(source.excerpt ?? "");
  return {
    kind: "post",
    ...(source.platform === undefined ? {} : { platform: source.platform }),
    ...(source.authorHandle === undefined ? {} : { author: source.authorHandle }),
    ...(lang === undefined ? {} : { lang }),
    text: quote.text,
    more: quote.more,
    translations: (await excerptTranslations(ctx, source)).map((translation) => ({
      lang: translation.lang,
      text: firstSentences(translation.text, {
        maxSentences: SNIPPET_SENTENCES,
        maxChars: SNIPPET_CHARS,
      }).text,
    })),
  };
}

/**
 * Every place on the public map with a pin, and a short snippet for the places that have a story.
 * Downloaded once when a walk starts; the phone does the nearness itself. Takes no position.
 */
export const forRegion = query({
  args: { regionId: v.string() },
  returns: v.array(walkPlace),
  handler: async (ctx, { regionId }) => {
    if (!regionConfig(regionId).features.walk) throw appError("not_found", "Not found");
    const pool = await publicPool(ctx, regionId);
    const withStory = pool.filter((place) => place.hasStory).length;
    if (withStory > SNIPPET_PLACE_LIMIT) {
      console.warn(
        `walk.forRegion: ${withStory} places with a story in ${regionId}, reading ${SNIPPET_PLACE_LIMIT}`,
      );
    }
    let snippetsLeft = SNIPPET_PLACE_LIMIT;
    const places = [];
    for (const place of pool) {
      let snippet: SnippetView | null = null;
      if (place.hasStory && snippetsLeft > 0) {
        snippetsLeft--;
        const row = await ctx.db.get("place", place.id);
        snippet = row === null ? null : await snippetFor(ctx, row);
      }
      places.push({
        slug: place.slug,
        names: place.names,
        ...(place.category === undefined ? {} : { category: place.category }),
        pin: place.pin,
        confirmed: place.confirmedAt !== undefined,
        hasStory: place.hasStory,
        ...(snippet === null ? {} : { snippet }),
      });
    }
    return places;
  },
});
