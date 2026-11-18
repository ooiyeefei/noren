"use node";

import { v } from "convex/values";
import { createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig } from "../src/lib/ai/config";
import { createPostcardDrafter } from "../src/lib/postcard/draft";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { appError } from "./lib/errors";

/**
 * "Help me write it". The member sends the moments they picked, who it is for and, if they like, a few
 * words of their own; this returns a draft of the message, which they edit, regenerate or ignore. The
 * draft is not stored and nothing is sent anywhere: the card holds only the text the member finishes
 * with (postcards.create).
 *
 * The gate (convex/postcards.ts, beginDraft) decides what the model may be given: the place names, the
 * member's few words, and the words of a story only when its writer allowed AI to read it. The model is
 * the one that drafts a member's line from their own post (AI_MODEL_WRITE_STORY).
 *
 * Logs name a step and an error, and never include what was written.
 */
export const draft = action({
  args: {
    items: v.array(
      v.union(
        v.object({ kind: v.literal("story"), storyId: v.id("story") }),
        v.object({ kind: v.literal("stamp"), placeId: v.id("place") }),
      ),
    ),
    recipientName: v.string(),
    note: v.optional(v.string()),
    lang: v.string(),
  },
  returns: v.object({
    message: v.union(v.string(), v.null()),
    failure: v.optional(v.string()),
    withheld: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ message: string | null; failure?: string; withheld: number }> => {
    const input = await ctx.runMutation(internal.postcards.beginDraft, args);
    const config = aiConfig("write_story", process.env);
    if (!config.ok) throw appError("conflict", config.reason);
    const result = await createPostcardDrafter({ model: createLanguageModel(config.config) }).draft(
      {
        language: input.language,
        recipient: input.recipient,
        ...(input.note === undefined ? {} : { note: input.note }),
        places: input.places,
      },
    );
    if (result.message === null) {
      console.error(`postcard draft failed (${result.failure})`);
      return { message: null, failure: result.failure, withheld: input.withheld };
    }
    return { message: result.message, withheld: input.withheld };
  },
});
