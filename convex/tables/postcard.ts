import { defineTable } from "convex/server";
import { v } from "convex/values";

/** One place on a card: a story the sender wrote there, or the place's stamp alone. */
export const postcardItem = v.union(
  v.object({ kind: v.literal("story"), storyId: v.id("story"), placeId: v.id("place") }),
  v.object({ kind: v.literal("stamp"), placeId: v.id("place") }),
);

export const postcardTables = {
  /**
   * A trip postcard (specs/004-trip-postcard): moments from several places a member went to,
   * and a message they wrote to someone, reachable through one private link.
   *
   * - `code` is the whole address: 24 random characters, never derived from anything. The row is
   *   deleted to withdraw the card, so a deleted card's link stops working in the same transaction.
   * - The card keeps no copy of a story's words or a photo. `items` only names them, and every read
   *   works out what still shows, so a story or photo removed later leaves the card with it.
   * - `message` is the sender's own text, as they finished editing it. `aiAssisted` says the
   *   writing helper drafted part of it, which the card then says in its own words.
   * - Nothing here holds an address. A later print-and-post step would add its own table that
   *   points at a card (see the plan's "later" section) and leave this one as it is.
   */
  postcard: defineTable({
    code: v.string(),
    senderPersonId: v.id("person"),
    regionId: v.string(),
    /** Who it is for, as the sender typed it: a name or a relationship. Shown on the card. */
    recipientName: v.string(),
    message: v.string(),
    /** The language the message is in, and the page the link opens in. */
    messageLang: v.string(),
    aiAssisted: v.boolean(),
    items: v.array(postcardItem),
  })
    .index("by_code", ["code"])
    .index("by_senderPersonId", ["senderPersonId"]),
};
