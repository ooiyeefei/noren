import type { Role } from "../domain/constants";
import type { RegionConfig } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an account is in its first days, when it has lower limits and its places wait for a
 * steward (FR-128, FR-129). A creator or business owner was vouched for by a steward, so only a
 * plain `user` counts. Convex decides with this; the add-place form uses it to word its promise.
 */
export function isNewAccount(
  person: { role: Role; joinedAt: number } | null | undefined,
  region: Pick<RegionConfig, "collection">,
  now: number,
): boolean {
  return (
    person?.role === "user" && now - person.joinedAt < region.collection.newAccount.days * DAY_MS
  );
}
