import type { PlaceKind } from "../../src/lib/domain/constants";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requirePerson } from "./auth";
import { appError } from "./errors";
import { canReadPlace, type Viewer } from "./visibility";

export type { Viewer } from "./visibility";

export function placeKind(place: Doc<"place">): PlaceKind {
  return place.kind ?? "business";
}

export function isPublicDemoPlace(
  place: Pick<Doc<"place">, "visibility" | "demoPublicBasis" | "isMock">,
): boolean {
  return (
    place.visibility === "demo_public" &&
    place.demoPublicBasis === "fictional" &&
    place.isMock === true
  );
}

export function mayJoinPublicDemo(place: Doc<"place">): boolean {
  return isPubliclyReadablePlace(place);
}

export function isPubliclyReadablePlace(
  place: Pick<Doc<"place">, "visibility" | "demoPublicBasis" | "isMock">,
): boolean {
  return (place.visibility === "public" && place.isMock === false) || isPublicDemoPlace(place);
}

export async function isVerifiedOwner(
  ctx: QueryCtx,
  personId: Id<"person">,
  placeId: Id<"place">,
): Promise<boolean> {
  const person = await ctx.db.get("person", personId);
  if (person?.role !== "business_owner") return false;
  const owner = await ctx.db
    .query("placeOwner")
    .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", placeId).eq("personId", personId))
    .unique();
  return owner !== null;
}

export async function placeHasOwner(ctx: QueryCtx, placeId: Id<"place">): Promise<boolean> {
  const owner = await ctx.db
    .query("placeOwner")
    .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", placeId))
    .first();
  return owner !== null;
}

export async function canManagePlace(
  ctx: QueryCtx,
  viewer: Viewer,
  place: Doc<"place">,
): Promise<boolean> {
  if (viewer === null) return false;
  return (
    viewer.role === "steward" ||
    viewer._id === place.createdBy ||
    (await isVerifiedOwner(ctx, viewer._id, place._id))
  );
}

export function canEditPlace(viewer: Viewer, place: Doc<"place">): boolean {
  return viewer !== null && (viewer.role === "steward" || viewer._id === place.createdBy);
}

/** Unreadable drafts must be indistinguishable from missing places. */
export async function loadReadablePlace(
  ctx: QueryCtx,
  viewer: Viewer,
  placeId: Id<"place">,
): Promise<Doc<"place">> {
  const place = await ctx.db.get("place", placeId);
  if (place === null || !(await canReadPlace(ctx, viewer, place))) {
    throw appError("not_found", "place not found");
  }
  return place;
}

export async function requireEditablePlace(
  ctx: QueryCtx,
  placeId: Id<"place">,
): Promise<{ person: Doc<"person">; place: Doc<"place"> }> {
  const person = await requirePerson(ctx);
  const place = await loadReadablePlace(ctx, person, placeId);
  if (!canEditPlace(person, place)) {
    throw appError("forbidden", "only the place's creator or a steward may edit its names and pin");
  }
  return { person, place };
}

/** The caller has already checked canReadPlace. */
export async function canSeeSource(
  ctx: QueryCtx,
  viewer: Viewer,
  place: Doc<"place">,
  source: Doc<"source">,
): Promise<boolean> {
  if (source.placeId !== place._id || source.status !== "live") return false;
  return (
    ((isPubliclyReadablePlace(place) || place.visibility === "pilot") &&
      source.demoConsentAt !== undefined) ||
    (viewer !== null && source.addedBy === viewer._id) ||
    (await canManagePlace(ctx, viewer, place))
  );
}

/** The caller must separately check that the claim isCitable. */
export function isPublicSafeClaim(
  claim: Pick<Doc<"claim">, "isMock" | "origin">,
  place: Pick<Doc<"place">, "isMock">,
): boolean {
  return claim.origin === "open_text" || claim.isMock === place.isMock;
}

function canWorkOnInterview(person: Doc<"person">, interview: Doc<"interview">): boolean {
  return (
    person.role === "steward" ||
    (person.role === "creator" && person._id === interview.interviewerId)
  );
}

async function requireInterviewAccess(
  ctx: QueryCtx,
  interviewId: Id<"interview">,
  allowOwner: boolean,
): Promise<{ person: Doc<"person">; interview: Doc<"interview">; place: Doc<"place"> }> {
  const person = await requirePerson(ctx);
  const interview = await ctx.db.get("interview", interviewId);
  if (interview === null) throw appError("not_found", "interview not found");
  const place = await ctx.db.get("place", interview.placeId);
  if (place === null || !(await canReadPlace(ctx, person, place))) {
    throw appError("not_found", "interview not found");
  }
  const allowed =
    canWorkOnInterview(person, interview) ||
    (allowOwner && (await isVerifiedOwner(ctx, person._id, interview.placeId)));
  if (!allowed) throw appError("forbidden", "you may not access this interview");
  return { person, interview, place };
}

export async function requireInterviewer(
  ctx: QueryCtx,
  interviewId: Id<"interview">,
): Promise<{ person: Doc<"person">; interview: Doc<"interview">; place: Doc<"place"> }> {
  return await requireInterviewAccess(ctx, interviewId, false);
}

export async function requireInterviewReader(
  ctx: QueryCtx,
  interviewId: Id<"interview">,
): Promise<{ person: Doc<"person">; interview: Doc<"interview">; place: Doc<"place"> }> {
  return await requireInterviewAccess(ctx, interviewId, true);
}
