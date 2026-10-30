import { v } from "convex/values";
import { query } from "./_generated/server";

/** Public without auth: checks ID shape only, revealing neither record existence nor access. */
export const normalize = query({
  args: { table: v.union(v.literal("place"), v.literal("interview")), id: v.string() },
  returns: v.union(v.id("place"), v.id("interview"), v.null()),
  handler: (ctx, { table, id }) => ctx.db.normalizeId(table, id),
});
