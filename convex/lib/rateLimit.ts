import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appError } from "./errors";

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
const CONTRIBUTIONS_PER_DAY = { place: 20, post: 50 } as const;

/** Any signed-in member may add places and posts; a daily cap stops one account flooding the map. */
export async function limitContribution(
  ctx: MutationCtx,
  person: Doc<"person">,
  kind: keyof typeof CONTRIBUTIONS_PER_DAY,
): Promise<void> {
  if (person.role === "steward") return;
  const result = await consumeRateLimit(ctx, {
    key: `contribution:${kind}:${person._id}`,
    limit: CONTRIBUTIONS_PER_DAY[kind],
    windowMs: DAY_MS,
    now: Date.now(),
  });
  if (!result.ok) throw appError("rate_limited", `too many ${kind}s added today`);
}
