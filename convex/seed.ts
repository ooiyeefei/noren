import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { internalMutation } from "./lib/gate";
import { regionConfig } from "./lib/region";
import { roleValidator } from "./lib/validators";

export const markMockPerson = internalMutation({
  args: { clerkUserId: v.string(), role: roleValidator, regionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId, role, regionId }) => {
    const displayName = regionConfig(regionId).demo.mockAccountLabels[role];
    const person = await ctx.db
      .query("person")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (person === null) throw appError("not_found", "sign in once with this account first");
    if (!person.isMock) {
      const place = await ctx.db
        .query("place")
        .withIndex("by_createdBy", (q) => q.eq("createdBy", person._id))
        .first();
      const interview = await ctx.db
        .query("interview")
        .withIndex("by_interviewerId", (q) => q.eq("interviewerId", person._id))
        .first();
      const ownership = await ctx.db
        .query("placeOwner")
        .withIndex("by_personId", (q) => q.eq("personId", person._id))
        .first();
      if (place || interview || ownership)
        throw appError(
          "conflict",
          "cannot mark an account mock after it has created or owns content",
        );
    }
    if (person.isMock && person.role === role && person.displayName === displayName) return null;
    await ctx.db.patch("person", person._id, { role, isMock: true, displayName });
    await writeAudit(ctx, {
      actorKind: "system",
      action: "person.mark_mock",
      targetType: "person",
      targetId: person._id,
      diff: { role: { from: person.role, to: role }, isMock: { from: person.isMock, to: true } },
    });
    return null;
  },
});

export const personIdFor = internalQuery({
  args: { clerkUserId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ personId: v.id("person"), role: roleValidator, isMock: v.boolean() }),
  ),
  handler: async (ctx, { clerkUserId }) => {
    const person = await ctx.db
      .query("person")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    return person === null
      ? null
      : { personId: person._id, role: person.role, isMock: person.isMock };
  },
});
