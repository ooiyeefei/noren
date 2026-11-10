import { v } from "convex/values";
import { aiReadingOffered } from "../src/lib/connector/policy";
import { query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { regionConfig } from "./lib/region";

/**
 * Whether the viewer, as the writer, has allowed AI to read this story with their name: Noren's
 * planner, and assistants such as Claude or ChatGPT through the connector. Null for everyone else,
 * for a story that is not showing, and while the region has both the connector and the planner off,
 * so the page offers the choice only where it means something.
 */
export const choiceOf = query({
  args: { storyId: v.id("story") },
  returns: v.union(v.object({ allowed: v.boolean() }), v.null()),
  handler: async (ctx, { storyId }) => {
    const viewer = await currentPerson(ctx);
    const story = await ctx.db.get("story", storyId);
    if (viewer === null || story === null || story.authorPersonId !== viewer._id) return null;
    if (story.status !== "live") return null;
    const place = await ctx.db.get("place", story.placeId);
    if (place === null || !aiReadingOffered(regionConfig(place.regionId).features)) return null;
    return { allowed: story.connectorAllowedAt !== undefined };
  },
});

/**
 * The writer allows or stops allowing AI to read this story, with their name (Noren's planner and
 * the connector, one tick for both), as they could when writing it. Only the writer may. Each real
 * change is audited and stamped with its time; asking for the state the story is already in changes
 * and records nothing. Turning it on needs a live story on a region that has the connector or the
 * planner on. Turning it off is never refused, so a writer's "no" is always heard.
 */
export const setAllowed = mutation({
  args: { storyId: v.id("story"), on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { storyId, on }) => {
    const person = await requirePerson(ctx);
    const story = await ctx.db.get("story", storyId);
    if (story === null) throw appError("not_found", "story not found");
    if (story.authorPersonId !== person._id)
      throw appError("forbidden", "only the writer may change this");
    if (on === (story.connectorAllowedAt !== undefined)) return null;
    if (on) {
      const place = await ctx.db.get("place", story.placeId);
      if (story.status !== "live" || place === null)
        throw appError("conflict", "only a story that is showing can be offered to the connector");
      if (!aiReadingOffered(regionConfig(place.regionId).features))
        throw appError("invalid_input", "this region does not offer AI reading of stories");
    }
    await ctx.db.patch("story", storyId, { connectorAllowedAt: on ? Date.now() : undefined });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: on ? "story.connector_allowed" : "story.connector_withdrawn",
      targetType: "story",
      targetId: storyId,
      diff: { connectorAllowed: on },
    });
    return null;
  },
});
