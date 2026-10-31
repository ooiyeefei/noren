import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./lib/gate";
import { refreshMapCopies } from "./lib/mapCopies";

/**
 * Copies every place's names, pin, published page and people's stories onto its row
 * (lib/mapCopies.ts), one page of places at a time. Run once after deploying the copies:
 * `npx convex run mapCopies:backfill '{"cursor":null}'`. Safe to run again.
 */
export const backfill = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ processed: v.number(), isDone: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("place").paginate({ numItems: 200, cursor });
    for (const place of page.page) await refreshMapCopies(ctx, place._id);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.mapCopies.backfill, { cursor: page.continueCursor });
    }
    return { processed: page.page.length, isDone: page.isDone };
  },
});
