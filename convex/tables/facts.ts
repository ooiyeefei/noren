import { defineTable } from "convex/server";
import { v } from "convex/values";

export const factValue = v.union(v.literal("yes"), v.literal("no"));
export const factStatus = v.union(v.literal("live"), v.literal("removed"), v.literal("hidden"));

export const factTables = {
  placeFact: defineTable({
    placeId: v.id("place"),
    regionId: v.string(),
    key: v.string(),
    value: factValue,
    basis: v.union(v.literal("member"), v.literal("post")),
    personId: v.optional(v.id("person")),
    sourceId: v.optional(v.id("source")),
    quote: v.optional(v.string()),
    day: v.string(),
    status: factStatus,
    isMock: v.boolean(),
  })
    .index("by_placeId_and_status", ["placeId", "status"])
    .index("by_personId_and_placeId_and_key", ["personId", "placeId", "key"])
    .index("by_sourceId", ["sourceId"])
    .index("by_regionId_and_status", ["regionId", "status"]),
};
