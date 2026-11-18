import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Stops every automatic Instagram post of a story that has not gone out yet (queued, or being sent).
 * Called wherever a story stops being shareable: the writer's tick turned off, the story removed or
 * its writer's account deleted, or a steward posting it by hand. A post already sent is left alone;
 * the steward screen then shows a "remove by hand" task for it.
 *
 * A post in the middle of being sent is caught again just before Instagram's publish call, which
 * checks the same rules in its own transaction, so this is never the only guard.
 */
export async function cancelPendingPosts(
  ctx: MutationCtx,
  storyId: Id<"story">,
  reason: "withdrawn" | "removed" | "posted_by_hand",
): Promise<void> {
  const posts = await ctx.db
    .query("instagramPost")
    .withIndex("by_storyId", (q) => q.eq("storyId", storyId))
    .take(20);
  for (const post of posts) {
    if (post.status === "queued" || post.status === "publishing")
      await ctx.db.patch("instagramPost", post._id, { status: "cancelled", reason });
  }
}
