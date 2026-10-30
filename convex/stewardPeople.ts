import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole } from "./lib/auth";
import { roleValidator } from "./lib/validators";

export const list = query({
  args: { role: v.optional(roleValidator) },
  returns: v.array(
    v.object({
      _id: v.id("person"),
      displayName: v.string(),
      role: roleValidator,
      isMock: v.boolean(),
      verifiedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { role }) => {
    await requireRole(ctx, ["steward"]);
    const people =
      role === undefined
        ? await ctx.db.query("person").take(200)
        : await ctx.db
            .query("person")
            .withIndex("by_role", (q) => q.eq("role", role))
            .take(200);
    return people.map(({ _id, displayName, role, isMock, verifiedAt }) => ({
      _id,
      displayName,
      role,
      isMock,
      verifiedAt,
    }));
  },
});
