import type { MutationCtx } from "../_generated/server";

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
