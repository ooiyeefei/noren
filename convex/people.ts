import { v } from "convex/values";
import type { UserIdentity } from "convex/server";
import { ASSIGNABLE_ROLES } from "../src/lib/domain/constants";
import { cleanDisplayName } from "../src/lib/domain/display-name";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { currentPerson, findPerson, nameIsConfirmed, requirePerson, requireRole } from "./lib/auth";
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
 * `nameConfirmed` is false exactly when a share would be refused with `name_not_confirmed`.
 * `joinedAt` lets the add-place form say what will happen, since a query may not read the clock.
 */
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      displayName: v.string(),
      role: roleValidator,
      isMock: v.boolean(),
      nameConfirmed: v.boolean(),
      joinedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const person = await currentPerson(ctx);
    return person === null
      ? null
      : {
          displayName: person.displayName,
          role: person.role,
          isMock: person.isMock,
          nameConfirmed: nameIsConfirmed(person),
          joinedAt: person._creationTime,
        };
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

function checkedDisplayName(input: string): string {
  const displayName = cleanDisplayName(input);
  if (displayName === null) {
    throw appError(
      "invalid_input",
      "a display name is 1 to 80 characters and not an email address",
    );
  }
  return displayName;
}

/** A demo account's name is the label that says it is a demo, so it stays as it is. */
async function requireRealPerson(ctx: QueryCtx): Promise<Doc<"person">> {
  const person = await requirePerson(ctx);
  if (person.isMock) throw appError("forbidden", "a demo account keeps its label");
  return person;
}

/**
 * The caller chooses the name shown beside what they share (FR-131). Choosing it is seeing it, so
 * this confirms it too. The audit entry holds no names, because it outlives a deleted account.
 */
export const setMyDisplayName = mutation({
  args: { displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, { displayName: input }) => {
    const person = await requireRealPerson(ctx);
    const displayName = checkedDisplayName(input);
    if (displayName === person.displayName && person.nameConfirmedAt !== undefined) return null;
    await ctx.db.patch("person", person._id, { displayName, nameConfirmedAt: Date.now() });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "person.set_my_display_name",
      targetType: "person",
      targetId: person._id,
    });
    return null;
  },
});

/**
 * The caller keeps the name they were shown (FR-131). A name from a sign-in provider can break the
 * rule, for example an email address typed as a name, and then they must choose another.
 */
export const confirmMyDisplayName = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const person = await requireRealPerson(ctx);
    if (person.nameConfirmedAt !== undefined) return null;
    checkedDisplayName(person.displayName);
    await ctx.db.patch("person", person._id, { nameConfirmedAt: Date.now() });
    return null;
  },
});

/** Whether the person's name has been shown in public, beside something they shared. */
async function hasShared(ctx: QueryCtx, personId: Id<"person">): Promise<boolean> {
  const story = await ctx.db
    .query("story")
    .withIndex("by_authorPersonId", (q) => q.eq("authorPersonId", personId))
    .first();
  if (story !== null) return true;
  const source = await ctx.db
    .query("source")
    .withIndex("by_addedBy", (q) => q.eq("addedBy", personId))
    .filter((q) => q.neq(q.field("sharedAt"), undefined))
    .first();
  if (source !== null) return true;
  const place = await ctx.db
    .query("place")
    .withIndex("by_createdBy", (q) => q.eq("createdBy", personId))
    .filter((q) => q.neq(q.field("sharedAt"), undefined))
    .first();
  return place !== null;
}

/**
 * Members who already shared have seen their name on the page, so they aren't asked again (R13).
 * Others see it on their first share. Stewards and demo accounts are never asked, so they are left
 * alone. Run once, straight after deploying, because until then these members are refused too:
 * `npx convex run people:backfillNameConfirmed '{"cursor":null}'`.
 */
export const backfillNameConfirmed = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ confirmed: v.number(), isDone: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("person").paginate({ numItems: 100, cursor });
    let confirmed = 0;
    for (const person of page.page) {
      if (nameIsConfirmed(person) || !(await hasShared(ctx, person._id))) continue;
      await ctx.db.patch("person", person._id, { nameConfirmedAt: Date.now() });
      confirmed++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.people.backfillNameConfirmed, {
        cursor: page.continueCursor,
      });
    }
    return { confirmed, isDone: page.isDone };
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
    const displayName = checkedDisplayName(input);
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
