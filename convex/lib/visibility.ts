import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isPubliclyReadablePlace } from "./access";

/** The verified caller's person row, or null for a signed-out visitor. */
export type Viewer = Doc<"person"> | null;

/**
 * Who may read a place (data-model.md, contracts/http-api.md):
 * - `public` with `isMock === false`: anyone; otherwise draft access.
 * - `demo_public` with a fictional basis and `isMock === true`: anyone; otherwise draft access.
 * - `pilot`: any signed-in person.
 * - `draft`: stewards, the person who created the place, and its verified owner.
 *
 * Every Convex function that returns a place or anything on its page goes through this, or through
 * `readablePlaces`, so a page cannot serve a draft by forgetting a check.
 */
export async function canReadPlace(
  ctx: QueryCtx,
  viewer: Viewer,
  place: Doc<"place">,
): Promise<boolean> {
  if (isPubliclyReadablePlace(place)) return true;
  if (place.visibility === "pilot") return viewer !== null;
  if (viewer === null) return false;
  if (viewer.role === "steward" || place.createdBy === viewer._id) return true;
  if (viewer.role !== "business_owner") return false;
  const ownership = await ctx.db
    .query("placeOwner")
    .withIndex("by_placeId_and_personId", (q) =>
      q.eq("placeId", place._id).eq("personId", viewer._id),
    )
    .unique();
  return ownership !== null;
}

/**
 * The places of one region that `viewer` may read, for the map and list. It reads each visibility
 * through its index, checks the public-read predicate, and is agreed with
 * `canReadPlace` by a test. `limit` caps each visibility, not the total.
 */
export async function readablePlaces(
  ctx: QueryCtx,
  viewer: Viewer,
  options: { regionId: string; limit?: number },
): Promise<Doc<"place">[]> {
  const { regionId, limit = 100 } = options;
  const inRegion = (visibility: Doc<"place">["visibility"]) =>
    ctx.db
      .query("place")
      .withIndex("by_regionId_and_visibility", (q) =>
        q.eq("regionId", regionId).eq("visibility", visibility),
      )
      .take(limit);

  const found = new Map<Doc<"place">["_id"], Doc<"place">>();
  const ownerships =
    viewer?.role === "business_owner"
      ? await ctx.db
          .query("placeOwner")
          .withIndex("by_personId", (q) => q.eq("personId", viewer._id))
          .take(limit)
      : [];
  const owned = new Set(ownerships.map(({ placeId }) => placeId));
  const add = (places: Doc<"place">[]) => {
    for (const place of places) found.set(place._id, place);
  };

  for (const visibility of ["public", "demo_public"] as const) {
    for (const place of await inRegion(visibility)) {
      if (
        isPubliclyReadablePlace(place) ||
        (viewer !== null &&
          (viewer.role === "steward" || place.createdBy === viewer._id || owned.has(place._id)))
      )
        found.set(place._id, place);
    }
  }
  if (viewer === null) return [...found.values()];
  add(await inRegion("pilot"));

  if (viewer.role === "steward") {
    add(await inRegion("draft"));
    return [...found.values()];
  }

  const isOwnDraft = (place: Doc<"place">) =>
    place.regionId === regionId &&
    (place.visibility === "draft" ||
      ((place.visibility === "demo_public" || place.visibility === "public") &&
        !isPubliclyReadablePlace(place)));
  add(
    (
      await ctx.db
        .query("place")
        .withIndex("by_createdBy", (q) => q.eq("createdBy", viewer._id))
        .take(limit)
    ).filter(isOwnDraft),
  );
  if (viewer.role === "business_owner") {
    for (const { placeId } of ownerships) {
      const place = await ctx.db.get("place", placeId);
      if (place !== null && isOwnDraft(place)) found.set(place._id, place);
    }
  }
  return [...found.values()];
}
