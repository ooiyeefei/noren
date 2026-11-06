import { isNewAccount } from "../../src/lib/region/new-account";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appError } from "./errors";
import { regionConfig } from "./region";

/** Counters share the caller's transaction, including Convex's conflict retries. */
export async function consumeRateLimit(
  ctx: MutationCtx,
  { key, limit, windowMs, now }: { key: string; limit: number; windowMs: number; now: number },
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const row = await ctx.db
    .query("rateLimit")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row === null) {
    await ctx.db.insert("rateLimit", { key, windowStart: now, count: 1 });
  } else if (now >= row.windowStart + windowMs) {
    await ctx.db.patch("rateLimit", row._id, { windowStart: now, count: 1 });
  } else if (row.count >= limit) {
    return { ok: false, retryAfterMs: row.windowStart + windowMs - now };
  } else {
    await ctx.db.patch("rateLimit", row._id, { count: row.count + 1 });
  }
  return { ok: true };
}

const DAY_MS = 24 * 60 * 60 * 1000;
// A preview runs on each pasted link; a draft is one model call.
const CONTRIBUTIONS_PER_DAY = {
  place: 20,
  post: 50,
  story: 50,
  preview: 200,
  draft: 30,
  check: 100,
  report: 20,
} as const;

/** Whether this person's account is still in its first days, in this region's reckoning. */
export function isNewMember(person: Doc<"person">, regionId: string, now: number): boolean {
  return isNewAccount(
    { role: person.role, joinedAt: person._creationTime },
    regionConfig(regionId),
    now,
  );
}

/**
 * Any signed-in member may add places and posts; a daily cap stops one account flooding the map. An
 * account in its first days has the region's lower caps (FR-128). The count carries over when the
 * higher cap starts, because both use the same key.
 */
export async function limitContribution(
  ctx: MutationCtx,
  person: Doc<"person">,
  kind: keyof typeof CONTRIBUTIONS_PER_DAY,
  regionId: string,
): Promise<void> {
  if (person.role === "steward") return;
  const now = Date.now();
  const result = await consumeRateLimit(ctx, {
    key: `contribution:${kind}:${person._id}`,
    limit: isNewMember(person, regionId, now)
      ? regionConfig(regionId).collection.newAccount.perDay[kind]
      : CONTRIBUTIONS_PER_DAY[kind],
    windowMs: DAY_MS,
    now,
  });
  if (!result.ok) throw appError("rate_limited", `too many ${kind}s added today`);
}
