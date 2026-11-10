import { defineTable } from "convex/server";
import { v } from "convex/values";

export const connectorTables = {
  /**
   * How many times each place was suggested in a week, so quieter places get their turn in the next
   * draw (src/lib/draw/weights.ts). Nothing else: no person, no device, no address, no question
   * asked. A row is written only by a draw in convex/connector.ts, in the same transaction that
   * returns the stops, and rows older than a few weeks are removed by a cron.
   */
  placeExposure: defineTable({
    placeId: v.id("place"),
    /** The ISO week in the region's time, such as "2026-W46". Sorts as plain text. */
    weekKey: v.string(),
    count: v.number(),
    /**
     * The last day (YYYY-MM-DD, region time) this place was the daily omikuji slip that counted.
     * The slip is the same for everyone that day, so it adds to count once, not once per asker.
     */
    lastOmikujiDay: v.optional(v.string()),
  }).index("by_weekKey_and_placeId", ["weekKey", "placeId"]),
};
