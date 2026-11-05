import { v } from "convex/values";
import type { UserIdentity } from "convex/server";
import { ASSIGNABLE_ROLES } from "../src/lib/domain/constants";
import type { Id } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
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
 * A person's collection row is made before they ever check in, because Convex stamps every row with
 * the moment it was made and a check-in must leave no time of day behind (FR-105).
 */
async function ensureCollectionRow(ctx: MutationCtx, personId: Id<"person">) {
  const row = await ctx.db
    .query("personCollection")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .unique();
  if (row === null) await ctx.db.insert("personCollection", { personId, visits: [], badges: [] });
}

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
    if (existing !== null) {
      await ensureCollectionRow(ctx, existing._id);
      return existing._id;
    }
    const personId = await ctx.db.insert("person", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      role: "user",
      displayName: displayNameFrom(identity),
      isMock: false,
    });
    await ensureCollectionRow(ctx, personId);
    return personId;
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

/**
 * Sets the name shown beside what a person shares, from the CLI: `npx convex run people:setDisplayName`.
 * A sign-in that carries no name leaves the fallback, and it stays until someone changes it here.
 */
export const setDisplayName = internalMutation({
  args: { personId: v.id("person"), displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, { personId, displayName: input }) => {
    const displayName = input.trim();
    if (!displayName || displayName.length > 80 || displayName.includes("@")) {
      throw appError(
        "invalid_input",
        "a display name is 1 to 80 characters and not an email address",
      );
    }
    const person = await ctx.db.get("person", personId);
    if (person === null) throw appError("not_found", "no such person");
    await ctx.db.patch("person", personId, { displayName });
    await writeAudit(ctx, {
      actorKind: "system",
      action: "person.set_display_name",
      targetType: "person",
      targetId: personId,
      diff: { displayName: { from: person.displayName, to: displayName } },
    });
    return null;
  },
});
