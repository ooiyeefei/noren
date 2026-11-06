import { v } from "convex/values";
import type { PaginationOptions, UserIdentity } from "convex/server";
import { ASSIGNABLE_ROLES } from "../src/lib/domain/constants";
import { cleanDisplayName } from "../src/lib/domain/display-name";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { currentPerson, findPerson, nameIsConfirmed, requirePerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { eraseFoundPost } from "./lib/foundPosts";
import { internalMutation, mutation } from "./lib/gate";
import { removePhotos } from "./lib/storyPhotos";
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

const DELETED_NAME = "Former member";
/**
 * Rows touched by one run of `continueDeletion`. Small, because each deleted story or hidden link
 * also rereads its place's stories through the map copy trigger, and a mutation has a read limit.
 */
const DELETION_BATCH = 20;
/** What an audit entry about a deleted person may still say: its other keys can hold their name. */
const AUDIT_KEYS_KEPT = new Set(["role", "isMock"]);

/** Clerk's identities hold the issuer's address, so this can never match a real sign-in. */
const deletedIdentity = (personId: Id<"person">) => `deleted:${personId}`;

type DeletionStep = (
  ctx: MutationCtx,
  personId: Id<"person">,
  paginationOpts: PaginationOptions,
) => Promise<{ isDone: boolean; continueCursor: string }>;

/**
 * What account deletion does to a person's rows, one entry per table ("Account deletion" in
 * specs/002-noren-collection/data-model.md). Each entry handles one page and returns it, and
 * `continueDeletion` runs one page per transaction. To cover another table, add an entry here, ahead
 * of any table its rows depend on, and a decision in DELETION_DECISIONS in people.test.ts.
 *
 * Every entry must be safe to run twice, because an operator reruns them all after a failed run.
 */
const DELETION_STEPS: readonly DeletionStep[] = [
  // Deleted in every state, with both files queued for removal from storage. Ahead of stories,
  // because a photo names its story.
  async (ctx, personId, paginationOpts) => {
    const page = await ctx.db
      .query("storyPhoto")
      .withIndex("by_uploaderPersonId", (q) => q.eq("uploaderPersonId", personId))
      .paginate(paginationOpts);
    await removePhotos(ctx, page.page);
    return page;
  },
  // Deleted. The entry above removed the only rows that name a story.
  async (ctx, personId, paginationOpts) => {
    const page = await ctx.db
      .query("story")
      .withIndex("by_authorPersonId", (q) => q.eq("authorPersonId", personId))
      .paginate(paginationOpts);
    for (const story of page.page) await ctx.db.delete("story", story._id);
    return page;
  },
  // Hidden through the same steps as sources.remove, because AI story citations may point at it.
  async (ctx, personId, paginationOpts) => {
    const page = await ctx.db
      .query("source")
      .withIndex("by_addedBy", (q) => q.eq("addedBy", personId))
      .paginate(paginationOpts);
    for (const source of page.page) {
      if (source.status !== "hidden")
        await ctx.db.patch("source", source._id, { status: "hidden" });
      await eraseFoundPost(ctx, source, personId);
    }
    return page;
  },
  // Deleted. Nothing refers to a check by id, and the place keeps its own confirmation.
  async (ctx, personId, paginationOpts) => {
    const page = await ctx.db
      .query("placeCheck")
      .withIndex("by_personId_and_verdict", (q) => q.eq("personId", personId))
      .paginate(paginationOpts);
    for (const check of page.page) await ctx.db.delete("placeCheck", check._id);
    return page;
  },
  // Deleted with its translations. A note has one per region language, so one read gets them all.
  async (ctx, personId, paginationOpts) => {
    const page = await ctx.db
      .query("note")
      .withIndex("by_authorPersonId", (q) => q.eq("authorPersonId", personId))
      .paginate(paginationOpts);
    for (const note of page.page) {
      const translations = await ctx.db
        .query("noteTranslation")
        .withIndex("by_noteId_and_lang", (q) => q.eq("noteId", note._id))
        .take(8);
      for (const translation of translations)
        await ctx.db.delete("noteTranslation", translation._id);
      await ctx.db.delete("note", note._id);
    }
    return page;
  },
  // Kept, pointing at the empty row. An entry about the person loses whatever could name them, such
  // as the from and to of a changed display name.
  async (ctx, personId, paginationOpts) => {
    const page = await ctx.db
      .query("auditLog")
      .withIndex("by_targetType_and_targetId", (q) =>
        q.eq("targetType", "person").eq("targetId", personId),
      )
      .paginate(paginationOpts);
    for (const entry of page.page) {
      if (entry.diff === undefined) continue;
      const kept = Object.entries(entry.diff).filter(([key]) => AUDIT_KEYS_KEPT.has(key));
      if (kept.length === Object.keys(entry.diff).length) continue;
      await ctx.db.patch("auditLog", entry._id, {
        diff: kept.length === 0 ? undefined : Object.fromEntries(kept),
      });
    }
    return page;
  },
];

/**
 * Deletes the caller's account from Noren (FR-130). POST /api/account/delete calls this, then
 * deletes the Clerk user, which it can only do in that order because this needs the Clerk token.
 *
 * The person's row and collection change here, in one transaction, so the moment this commits the
 * token no longer finds them. The rest continues in `continueDeletion`. Places, pins and place names
 * they made stay as facts about the place, and rate limit rows expire by themselves; both now lead
 * only to the empty row, so no name shows.
 *
 * It is safe to press again if the Clerk step fails. The token then finds no row, or a new empty one
 * that a page load made through `ensureCurrent`, which this empties in turn.
 */
export const deleteMine = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw appError("unauthenticated", "sign in to continue");
    const person = await findPerson(ctx, identity.tokenIdentifier);
    if (person === null) return null;
    if (person.role !== "user") {
      throw appError("forbidden", `a steward deletes ${person.role} accounts`);
    }
    // A steward can make someone a plain user without touching what they hold, and interviews,
    // consents and ownership still depend on them, so they ask a steward like any other role.
    const interview = await ctx.db
      .query("interview")
      .withIndex("by_interviewerId", (q) => q.eq("interviewerId", person._id))
      .first();
    const ownership = await ctx.db
      .query("placeOwner")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .first();
    if (interview !== null || ownership !== null) {
      throw appError("forbidden", "a steward deletes accounts that hold interviews or ownership");
    }
    const collection = await ctx.db
      .query("personCollection")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .unique();
    if (collection !== null) await ctx.db.delete("personCollection", collection._id);
    // A replace, so any profile field added later goes too unless it is listed here.
    await ctx.db.replace("person", person._id, {
      tokenIdentifier: deletedIdentity(person._id),
      clerkUserId: deletedIdentity(person._id),
      role: person.role,
      displayName: DELETED_NAME,
      isMock: person.isMock,
    });
    await ctx.scheduler.runAfter(0, internal.people.continueDeletion, {
      personId: person._id,
      step: 0,
      cursor: null,
    });
    return null;
  },
});

/**
 * Runs one page of one deletion step, then schedules the next. The person can't restart this, because
 * their token no longer finds their row, so if a run fails an operator starts it again from the
 * failed scheduled function's person id, which repeats nothing harmful:
 *
 *   npx convex run people:continueDeletion '{"personId": "...", "step": 0, "cursor": null}'
 */
export const continueDeletion = internalMutation({
  args: { personId: v.id("person"), step: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { personId, step, cursor }) => {
    const person = await ctx.db.get("person", personId);
    if (person?.tokenIdentifier !== deletedIdentity(personId)) {
      throw appError("conflict", "this person's deletion has not started");
    }
    const run = DELETION_STEPS[step];
    if (run === undefined) return null;
    const page = await run(ctx, personId, { numItems: DELETION_BATCH, cursor });
    await ctx.scheduler.runAfter(
      0,
      internal.people.continueDeletion,
      page.isDone
        ? { personId, step: step + 1, cursor: null }
        : { personId, step, cursor: page.continueCursor },
    );
    return null;
  },
});
