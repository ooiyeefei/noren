import { defineTable } from "convex/server";
import { v } from "convex/values";

// The neighbourhood noren collection (spec 002). A place always gives the same panel, a panel shows
// none of its art until the person has dyed it, and progress belongs to that person alone.

export const collectionTables = {
  /** One neighbourhood's collection. `panelCount` is fixed when it is made. */
  collectionSet: defineTable({
    regionId: v.string(),
    neighbourhoodId: v.string(),
    names: v.record(v.string(), v.string()),
    panelCount: v.number(),
    status: v.union(v.literal("draft"), v.literal("live")),
    /** Sent only to someone who has finished the set. */
    wholeArtId: v.optional(v.id("_storage")),
  })
    .index("by_regionId_and_status", ["regionId", "status"])
    .index("by_regionId_and_neighbourhoodId", ["regionId", "neighbourhoodId"]),

  collectionPanel: defineTable({
    setId: v.id("collectionSet"),
    index: v.number(),
    /** Sent only to someone who has dyed this panel. */
    artId: v.optional(v.id("_storage")),
  }).index("by_setId_and_index", ["setId", "index"]),

  /** Which places fill which panel: one to three per panel, and a place fills at most one. */
  collectionPlace: defineTable({
    setId: v.id("collectionSet"),
    panelIndex: v.number(),
    placeId: v.id("place"),
    /**
     * The English text of a live sentence a steward picked. Sentence positions shift when a post
     * comes down, so the text is what stays matched to the story.
     */
    pickedLineEn: v.optional(v.string()),
  })
    .index("by_placeId", ["placeId"])
    .index("by_setId_and_panelIndex", ["setId", "panelIndex"]),

  /**
   * One row per person, made with the person. Each visit holds the place, its set and panel, and the
   * date in the region's offset, with no time of day and no coordinates (FR-105). A panel counts as
   * dyed when any visit holds it, so swapping a place later undoes nothing. A badge copies what it
   * shows, so it survives later changes to the set (FR-110).
   */
  personCollection: defineTable({
    personId: v.id("person"),
    visits: v.array(
      v.object({
        placeId: v.id("place"),
        setId: v.id("collectionSet"),
        panelIndex: v.number(),
        day: v.string(),
      }),
    ),
    badges: v.array(
      v.object({
        setId: v.id("collectionSet"),
        names: v.record(v.string(), v.string()),
        wholeArtId: v.optional(v.id("_storage")),
        finishedOn: v.string(),
      }),
    ),
  }).index("by_personId", ["personId"]),
};
