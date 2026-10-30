import { v } from "convex/values";
import type { UserIdentity } from "convex/server";
import { ASSIGNABLE_ROLES } from "../src/lib/domain/constants";
import { query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { currentPerson, findPerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { literals, roleValidator } from "./lib/validators";

const FALLBACK_NAME = "New member";

/**
 * The name a person signed up with, never their email address: a display name can end up on a
 * page, and an email must not.
 */
function displayNameFrom(identity: Pick<UserIdentity, "name" | "nickname">): string {
  for (const candidate of [identity.name, identity.nickname]) {
    const name = candidate?.trim();
    if (name) return name;
  }
  return FALLBACK_NAME;
}

/**
 * Who the caller is, for the page header: their name and role, or null when signed out or not yet
 * registered. It returns nothing that identifies them to the outside (no token, no Clerk user ID).
 */
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ displayName: v.string(), role: roleValidator, isMock: v.boolean() }),
  ),
  handler: async (ctx) => {
    const person = await currentPerson(ctx);
    return person === null
      ? null
      : { displayName: person.displayName, role: person.role, isMock: person.isMock };
  },
});

/**
 * Creates the caller's `person` row on their first sign-in, as a plain `user`, and returns it on
 * every later call without changing it. Nothing comes from the client: not the role, not the mock
 * flag, not the identity. Two tabs can call this at once on a first sign-in; Convex reruns the
 * loser, which then finds the row, and the `person_token_unique` rule backs that up.
 */
export const ensureCurrent = mutation({
  args: {},
  returns: v.id("person"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw appError("unauthenticated", "sign in to continue");
    const existing = await findPerson(ctx, identity.tokenIdentifier);
    if (existing !== null) return existing._id;
    return await ctx.db.insert("person", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      role: "user",
      displayName: displayNameFrom(identity),
      isMock: false,
    });
  },
});

/**
 * A steward sets another person's role to user, creator or business_owner. It never makes a
 * steward and never changes one (stewards are made with `bootstrapSteward`), so a steward cannot
 * lock themselves out. The audit entry commits with the change.
 */
export const setRole = mutation({
  args: { personId: v.id("person"), role: literals(ASSIGNABLE_ROLES) },
  returns: v.null(),
  handler: async (ctx, { personId, role }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const target = await ctx.db.get("person", personId);
    if (target === null) throw appError("not_found", `no person ${personId}`);
    if (target.role === "steward") {
      throw appError("conflict", "a steward's role cannot be changed with setRole");
    }
    if (target.role === role) return null;
    await ctx.db.patch("person", personId, { role });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "person.set_role",
      targetType: "person",
      targetId: personId,
      diff: { role: { from: target.role, to: role } },
    });
    return null;
  },
});

/**
 * Admin only (an internal function, so the app cannot call it): makes a person a steward. It is
 * the only way to create one, for the first steward and any later one. The person must have signed
 * in once, so that their row exists; find the Clerk user ID in the Clerk dashboard:
 *
 *   npx convex run people:bootstrapSteward '{"clerkUserId": "user_..."}'
 */
export const bootstrapSteward = internalMutation({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId }) => {
    const person = await ctx.db
      .query("person")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (person === null) {
      throw appError(
        "not_found",
        `no person for Clerk user ${clerkUserId}: that person must sign in once first, then run this again`,
      );
    }
    if (person.role === "steward") return null;
    await ctx.db.patch("person", person._id, { role: "steward" });
    await writeAudit(ctx, {
      actorKind: "system",
      action: "person.bootstrap_steward",
      targetType: "person",
      targetId: person._id,
      diff: { role: { from: person.role, to: "steward" } },
    });
    return null;
  },
});
