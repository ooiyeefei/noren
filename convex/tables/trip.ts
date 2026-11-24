import { defineTable } from "convex/server";
import { v } from "convex/values";

export const sharedTripCheck = v.union(
  v.object({
    rule: v.string(),
    verdict: v.literal("met"),
    restsOn: v.object({
      kind: v.union(v.literal("owner"), v.literal("member"), v.literal("post")),
      factId: v.optional(v.string()),
    }),
  }),
  v.object({
    rule: v.string(),
    verdict: v.literal("not_known"),
    reason: v.union(v.literal("no_record"), v.literal("too_old"), v.literal("not_recorded_here")),
  }),
);

const stop = {
  kind: v.literal("stop"),
  at: v.string(),
  minutes: v.number(),
  turnLabel: v.optional(v.string()),
  checks: v.array(sharedTripCheck),
};

export const sharedTripDay = v.object({
  index: v.number(),
  date: v.optional(v.string()),
  night: v.optional(v.string()),
  items: v.array(
    v.union(
      v.object({ ...stop, placeId: v.string() }),
      v.object({ ...stop, pinLabel: v.string() }),
      v.object({
        kind: v.literal("drive"),
        from: v.string(),
        to: v.string(),
        minutes: v.number(),
        kilometres: v.number(),
        estimated: v.literal(true),
      }),
      v.object({
        kind: v.literal("rest"),
        at: v.string(),
        minutes: v.number(),
        why: v.union(
          v.literal("stretch"),
          v.literal("after_lunch"),
          v.literal("need"),
          v.literal("meal"),
        ),
      }),
    ),
  ),
});

export const tripTables = {
  tripShare: defineTable({
    code: v.string(),
    ownerPersonId: v.id("person"),
    regionId: v.string(),
    title: v.string(),
    days: v.array(sharedTripDay),
    deviceTripId: v.string(),
  })
    .index("by_code", ["code"])
    .index("by_ownerPersonId", ["ownerPersonId"]),
};
