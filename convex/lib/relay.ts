import { v, type Infer } from "convex/values";
import { openQuestion } from "../../src/lib/slip/question";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Stories of one place read to find its newest question; more than this and the starter stands. */
const QUESTION_SCAN = 50;

/** The question sealed in a slip. Member words and a name only for a story that is still shown. */
export const slipQuestion = v.union(
  v.object({ kind: v.literal("starter"), key: v.string() }),
  v.object({
    kind: v.literal("story"),
    storyId: v.id("story"),
    text: v.string(),
    lang: v.string(),
    askedBy: v.string(),
  }),
);
export type SlipQuestion = Infer<typeof slipQuestion>;

/**
 * A real place's open question for its slip: the newest shown story's question, else the place's
 * starter. Draw places are real (never demo), so a story is shown when it is live and not demo.
 */
export async function openQuestionFor(
  ctx: QueryCtx,
  place: { id: Id<"place">; category: string | undefined },
): Promise<SlipQuestion> {
  const stories = await ctx.db
    .query("story")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place.id).eq("status", "live"))
    .order("desc")
    .take(QUESTION_SCAN);
  const shown = stories
    .filter((story) => !story.isMock)
    .map((story) => ({
      id: story._id as string,
      addedAt: story._creationTime,
      nextQuestion: story.nextQuestion,
    }));
  const open = openQuestion({ placeId: place.id, category: place.category, shown });
  if (open.kind === "starter") return open;
  const story = stories.find(({ _id }) => _id === open.storyId)!;
  const author = await ctx.db.get("person", story.authorPersonId);
  return {
    kind: "story",
    storyId: story._id,
    text: open.text,
    lang: story.lang,
    askedBy: author?.displayName ?? "",
  };
}
