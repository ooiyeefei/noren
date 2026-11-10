import { v } from "convex/values";
import { aiConfig } from "../src/lib/ai/config";
import { activeRegionConfig } from "../src/lib/region/registry";
import { appError } from "./lib/errors";
import { requirePerson } from "./lib/auth";
import { internalMutation } from "./lib/gate";
import { consumeRateLimit } from "./lib/rateLimit";
import { regionConfig } from "./lib/region";

// The gate in front of the in-app planner ("Plan my day", convex/plannerActions.ts). Everything the
// planner does is behind features.planner in the region file: off, nothing answers.
//
// What this stores is a count per account and window (the rateLimit table: a key made of the account's
// id, and a number). It stores no question, no answer, no memory and no start.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Questions one account may ask. A question is a few model calls, so this is what keeps the bill bounded. */
export const PLANNER_PER_MINUTE = 5;
export const PLANNER_PER_DAY = 40;

/** Whether the planner (and with it the memory page) is switched on for this region. */
export function plannerEnabled(regionId: string): boolean {
  return regionConfig(regionId).features.planner;
}

/**
 * Called by the action with the caller's sign-in. In this order, so a stranger learns nothing:
 * the switch (off is "not found" for everyone), then sign-in, then whether AI is set up, then the
 * limits. A question that cannot be answered because AI is not set up costs nobody a slot.
 */
export const begin = internalMutation({
  args: {},
  returns: v.object({ regionId: v.string() }),
  handler: async (ctx) => {
    const regionId = activeRegionConfig().id;
    if (!plannerEnabled(regionId)) throw appError("not_found", "Not found");
    const person = await requirePerson(ctx);
    const config = aiConfig("plan", process.env);
    if (!config.ok) throw appError("conflict", config.reason);
    const now = Date.now();
    for (const [name, limit, windowMs] of [
      ["minute", PLANNER_PER_MINUTE, MINUTE_MS],
      ["day", PLANNER_PER_DAY, DAY_MS],
    ] as const) {
      const result = await consumeRateLimit(ctx, {
        key: `planner:${name}:${person._id}`,
        limit,
        windowMs,
        now,
      });
      if (!result.ok) throw appError("rate_limited", "too many planner questions just now");
    }
    return { regionId };
  },
});
