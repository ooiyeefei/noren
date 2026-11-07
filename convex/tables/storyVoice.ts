import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Short-lived upload permits contain no recording or transcript. */
export const voiceTables = {
  voiceUpload: defineTable({
    personId: v.id("person"),
    sha256: v.string(),
    storageId: v.optional(v.id("_storage")),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_personId", ["personId"]),
};
