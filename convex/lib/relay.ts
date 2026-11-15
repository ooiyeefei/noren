import { v, type Infer } from "convex/values";
import { openQuestion } from "../../src/lib/slip/question";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { nameView, isPublicRealPlace } from "./publicPool";
import { readMapNames } from "./mapCopies";

/** Stories of one place read to find its newest question; more than this and the starter stands. */
const QUESTION_SCAN = 50;

/** A place named for a link: its address and its names, which the reader's page language picks from. */
export const placeRef = v.object({ slug: v.string(), names: v.array(nameView) });
export type PlaceRef = Infer<typeof placeRef>;

/**
 * The question sealed in a slip. Member words and a name only for a story that is still shown.
 * `carriedFrom` is set when the question was written at another place and carried here.
 */
export const slipQuestion = v.union(
  v.object({ kind: v.literal("starter"), key: v.string() }),
  v.object({
    kind: v.literal("story"),
    storyId: v.id("story"),
    text: v.string(),
    lang: v.string(),
    askedBy: v.string(),
    carriedFrom: v.optional(placeRef),
  }),
);
export type SlipQuestion = Infer<typeof slipQuestion>;

export async function placeRefOf(ctx: QueryCtx, place: Doc<"place">): Promise<PlaceRef> {
  return { slug: place.slug, names: place.mapNames ?? (await readMapNames(ctx, place._id)) };
}

/** A place's live stories that are not demo, newest first: the ones a real place shows. */
export async function shownStoriesAt(ctx: QueryCtx, placeId: Id<"place">): Promise<Doc<"story">[]> {
  const stories = await ctx.db
    .query("story")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
    .order("desc")
    .take(QUESTION_SCAN);
  return stories.filter((story) => !story.isMock);
}

/**
 * Whether a question written at `source` still shows at the place it was carried to: the story is
 * live and not demo, and the place it was written at is still a real place a signed-out visitor can
 * see and that the map has not dropped.
 */
export function carriedQuestionShown(source: Doc<"place"> | null, story: Doc<"story">): boolean {
  return (
    source !== null &&
    story.nextQuestion !== undefined &&
    story.status === "live" &&
    !story.isMock &&
    isPublicRealPlace(source)
  );
}

/**
 * A real place's open question for its slip: the newest of the shown questions written here for the
 * next visitor and, while "three doors" is on, the shown questions carried here from other places;
 * else the place's starter. A question written here but addressed to another place is never this
 * place's own, whether or not the feature is on. Draw places are real (never demo), so a story is
 * shown when it is live and not demo. `stories` is this place's shownStoriesAt when the caller
 * already has it, so the place's stories are read once.
 */
export async function openQuestionFor(
  ctx: QueryCtx,
  place: { id: Id<"place">; category: string | undefined },
  options: { thread?: boolean; stories?: readonly Doc<"story">[] } = {},
): Promise<SlipQuestion> {
  const here = options.stories ?? (await shownStoriesAt(ctx, place.id));
  const sources = new Map<Id<"place">, Doc<"place"> | null>();
  const candidates: { story: Doc<"story">; source: Doc<"place"> | null; carried: boolean }[] = [];
  for (const story of here) {
    if (story.nextQuestionFor === undefined)
      candidates.push({ story, source: null, carried: false });
  }
  if (options.thread === true) {
    const carriedHere = await ctx.db
      .query("story")
      .withIndex("by_nextQuestionFor_and_status", (q) =>
        q.eq("nextQuestionFor", place.id).eq("status", "live"),
      )
      .order("desc")
      .take(QUESTION_SCAN);
    for (const story of carriedHere) {
      if (!sources.has(story.placeId))
        sources.set(story.placeId, await ctx.db.get("place", story.placeId));
      const source = sources.get(story.placeId) ?? null;
      if (carriedQuestionShown(source, story)) candidates.push({ story, source, carried: true });
    }
  }
  const open = openQuestion({
    placeId: place.id,
    category: place.category,
    shown: candidates.map(({ story }) => ({
      id: story._id as string,
      addedAt: story._creationTime,
      nextQuestion: story.nextQuestion,
    })),
  });
  if (open.kind === "starter") return open;
  const chosen = candidates.find(({ story }) => story._id === open.storyId)!;
  const author = await ctx.db.get("person", chosen.story.authorPersonId);
  return {
    kind: "story",
    storyId: chosen.story._id,
    text: open.text,
    lang: chosen.story.lang,
    askedBy: author?.displayName ?? "",
    ...(chosen.carried && chosen.source !== null
      ? { carriedFrom: await placeRefOf(ctx, chosen.source) }
      : {}),
  };
}
