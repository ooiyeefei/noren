import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Role } from "../../src/lib/domain/constants";
import { appError } from "./errors";

/** The person row for a verified token, or null before their first sign-in has created one. */
export async function findPerson(
  ctx: QueryCtx,
  tokenIdentifier: string,
): Promise<Doc<"person"> | null> {
  return await ctx.db
    .query("person")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

/** The verified caller's person row: null when signed out or not yet registered. */
export async function currentPerson(ctx: QueryCtx): Promise<Doc<"person"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity === null ? null : await findPerson(ctx, identity.tokenIdentifier);
}

/**
 * Any signed-in person, whatever their role ("user and above" in contracts/http-api.md). The
 * caller is identified only from the verified token, never from an argument.
 */
export async function requirePerson(ctx: QueryCtx): Promise<Doc<"person">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw appError("unauthenticated", "sign in to continue");
  const person = await findPerson(ctx, identity.tokenIdentifier);
  if (person === null) {
    throw appError(
      "unauthenticated",
      "signed in, but this person has no record yet: call people.ensureCurrent first",
    );
  }
  return person;
}

/**
 * The caller must hold one of `roles`. Two rules from the contract are built in: a steward may do
 * everything a creator can, and `business_owner` always means the verified owner of `placeId`,
 * which is therefore required whenever `business_owner` is listed (a missing one is a programming
 * error and fails for every caller, so it cannot hide until an owner tries it).
 */
export async function requireRole(
  ctx: QueryCtx,
  roles: readonly Role[],
  options: { placeId?: Id<"place"> } = {},
): Promise<Doc<"person">> {
  const { placeId } = options;
  if (roles.includes("business_owner") && placeId === undefined) {
    throw new Error("requireRole: listing business_owner needs the placeId they must own");
  }
  const person = await requirePerson(ctx);
  const allowed = new Set<Role>(roles);
  if (allowed.has("creator")) allowed.add("steward");
  if (!allowed.has(person.role)) {
    throw appError("forbidden", `the ${person.role} role may not do this`);
  }
  if (person.role === "business_owner" && placeId !== undefined) {
    const ownership = await ctx.db
      .query("placeOwner")
      .withIndex("by_placeId_and_personId", (q) =>
        q.eq("placeId", placeId).eq("personId", person._id),
      )
      .unique();
    if (ownership === null) {
      throw appError("forbidden", "only the verified owner of this place may do this");
    }
  }
  return person;
}
