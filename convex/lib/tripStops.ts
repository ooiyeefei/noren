import { v, type Infer } from "convex/values";
import { keyedUniform } from "../../src/lib/draw/rng";
import { QUOTES_PER_STOP } from "../../src/lib/planner/resolve";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { factValue } from "../tables/facts";
import { isSourceShownToEveryone, isStoryShown } from "./access";
import { nameIsConfirmed } from "./auth";
import { appError } from "./errors";
import { hasNoCard } from "./foundPosts";
import { readMapNames } from "./mapCopies";
import { isPublicRealPlace, nameView, pinOf } from "./publicPool";
import { enabledRegionIds } from "./region";

export async function tripFactsFor(ctx: QueryCtx, place: Doc<"place">) {
  const facts = await ctx.db
    .query("placeFact")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "live"))
    .order("desc")
    .take(60);
  const visible = [];
  for (const fact of facts) {
    const { _id: factId, regionId, isMock, basis, key, day, value } = fact;
    if (isMock !== place.isMock || regionId !== place.regionId) continue;
    const record = { factId, key, value, day };
    if (basis === "member" && fact.personId !== undefined) {
      const reporter = await ctx.db.get("person", fact.personId);
      if (reporter && reporter.tokenIdentifier !== `deleted:${reporter._id}`) {
        visible.push({ ...record, basis, reporterName: reporter.displayName });
      }
    } else if (basis === "post" && fact.sourceId !== undefined && fact.quote) {
      const source = await ctx.db.get("source", fact.sourceId);
      if (
        source?.origin === "story_finder" &&
        source.placeId === place._id &&
        source.isMock === isMock &&
        isSourceShownToEveryone(place, source)
      ) {
        visible.push({ ...record, basis, source: sourceCredit(source), quote: fact.quote });
      }
    }
  }
  return visible;
}

function sourceCredit(source: Doc<"source">) {
  return {
    _id: source._id,
    url: source.canonicalUrl,
    platform: source.platform,
    authorHandle: source.authorHandle,
    authorUrl: source.authorUrl,
  };
}

const sourceCreditView = v.object({
  _id: v.id("source"),
  url: v.string(),
  platform: v.string(),
  authorHandle: v.optional(v.string()),
  authorUrl: v.optional(v.string()),
});

const factFields = {
  factId: v.id("placeFact"),
  key: v.string(),
  value: factValue,
  day: v.string(),
};

const stopQuote = v.union(
  v.object({
    kind: v.literal("story"),
    storyId: v.id("story"),
    text: v.string(),
    lang: v.string(),
    authorName: v.string(),
  }),
  v.object({
    kind: v.literal("post"),
    text: v.string(),
    lang: v.optional(v.string()),
    source: sourceCreditView,
  }),
);

// A place supplies a stable seed, so reopening a plan makes the same draw from the current pool.
async function quotesFor(ctx: QueryCtx, place: Doc<"place">): Promise<Infer<typeof stopQuote>[]> {
  const stories = await ctx.db
    .query("story")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "live"))
    .order("desc")
    .take(200);
  const pool = [];
  const authors = new Map<string, { name: string; shown: number } | null>();
  for (const story of stories) {
    if (pool.length >= 50) break;
    if (!isStoryShown(place, story)) continue;
    let author = authors.get(story.authorPersonId);
    if (author === undefined) {
      const person = await ctx.db.get("person", story.authorPersonId);
      author =
        person &&
        nameIsConfirmed(person) &&
        person.displayName.trim() &&
        person.tokenIdentifier !== `deleted:${person._id}`
          ? { name: person.displayName, shown: 0 }
          : null;
      authors.set(story.authorPersonId, author);
    }
    if (!author || author.shown >= 20) continue;
    author.shown++;
    pool.push({
      kind: "story" as const,
      storyId: story._id,
      text: story.body,
      lang: story.lang,
      authorName: author.name,
    });
  }
  const draw = (id: string) => keyedUniform(`trip-quote:${place._id}`, id);
  const quotes: Infer<typeof stopQuote>[] = pool
    .sort((a, b) => draw(a.storyId) - draw(b.storyId))
    .slice(0, QUOTES_PER_STOP);
  if (quotes.length < QUOTES_PER_STOP) {
    const sources = await ctx.db
      .query("source")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "live"))
      .take(50);
    const posts = sources.flatMap((source) =>
      source.origin === "story_finder" &&
      source.excerpt &&
      !hasNoCard(source) &&
      isSourceShownToEveryone(place, source)
        ? [
            {
              kind: "post" as const,
              text: source.excerpt,
              lang: source.excerptLang,
              source: sourceCredit(source),
            },
          ]
        : [],
    );
    quotes.push(
      ...posts
        .sort((a, b) => draw(a.source._id) - draw(b.source._id))
        .slice(0, QUOTES_PER_STOP - quotes.length),
    );
  }
  return quotes;
}

export const tripStopDetails = v.object({
  placeId: v.id("place"),
  slug: v.string(),
  names: v.array(nameView),
  category: v.optional(v.string()),
  pin: v.union(v.object({ lat: v.number(), lng: v.number() }), v.null()),
  confirmed: v.boolean(),
  quotes: v.array(stopQuote),
  // The plan carries the rule and factId. Only the current public record supplies its credit.
  facts: v.array(
    v.union(
      v.object({ ...factFields, basis: v.literal("member"), reporterName: v.string() }),
      v.object({
        ...factFields,
        basis: v.literal("post"),
        source: sourceCreditView,
        quote: v.string(),
      }),
    ),
  ),
});

export type TripStopDetails = Infer<typeof tripStopDetails>;

/** Resolve in input order so a missing place leaves a null in the same position. */
export async function readTripStops(
  ctx: QueryCtx,
  placeIds: readonly string[],
): Promise<(TripStopDetails | null)[]> {
  if (placeIds.length > 84) throw appError("invalid_input", "at most 84 trip stops");
  const enabled = new Set(enabledRegionIds());
  const stops = new Map(
    [...new Set(placeIds)].map(
      (placeId) =>
        [
          placeId,
          (async () => {
            const id = ctx.db.normalizeId("place", placeId);
            const place = id === null ? null : await ctx.db.get("place", id);
            if (place === null || !enabled.has(place.regionId) || !isPublicRealPlace(place))
              return null;
            return {
              placeId: place._id,
              slug: place.slug,
              names: place.mapNames ?? (await readMapNames(ctx, place._id)),
              category: place.category,
              pin: await pinOf(ctx, place),
              confirmed: place.confirmedAt !== undefined,
              quotes: await quotesFor(ctx, place),
              facts: await tripFactsFor(ctx, place),
            };
          })(),
        ] as const,
    ),
  );
  return Promise.all(placeIds.map((placeId) => stops.get(placeId) ?? null));
}
