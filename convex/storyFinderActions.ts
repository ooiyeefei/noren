"use node";

import { v } from "convex/values";
import { createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig } from "../src/lib/ai/config";
import { translateJob } from "../src/lib/ai/jobs";
import { createTranslator } from "../src/lib/ai/translator";
import { createMentionChecker, describeCheckFailure } from "../src/lib/story-finder/check";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
/** Candidates per scheduled action: 32 checks of up to two minutes, eight at a time, fit in its ten. */
const CHECK_BATCH = 32;
/** Posts checked at the same time within a batch. */
const PARALLEL = 8;
/** Posts one linking call considers, and how many such calls the end of a run makes at most. */
const ATTACH_LIMIT = 100;
const ATTACH_ROUNDS = 20;

async function mapLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

/**
 * Checks one batch of pending candidates with the AI_MODEL_CHECK_MENTION model, one call per post,
 * records each result, then schedules the next batch until `remaining` runs out or nothing is
 * pending, and then links what passed. Each result goes through recordCheck, which applies the code
 * checks before writing.
 */
export const checkBatch = internalAction({
  args: { stewardPersonId: v.id("person"), remaining: v.number(), attach: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = aiConfig("check_mention", process.env);
    if (!config.ok) {
      console.error(`story finder check stopped: ${config.reason}`);
      return null;
    }
    const modelSetting = process.env.AI_MODEL_CHECK_MENTION?.trim() ?? config.config.modelId;
    const batch = await ctx.runMutation(internal.storyFinder.claimForCheck, {
      limit: Math.min(CHECK_BATCH, args.remaining),
      now: Date.now(),
    });
    if (batch.length) {
      const checker = createMentionChecker({
        model: createLanguageModel(config.config),
        // Meta's Model API accepts only tool_choice "auto" (see check.ts).
        forceTool: config.config.provider !== "meta",
      });
      const results = await mapLimit(batch, PARALLEL, async (candidate) => {
        const started = Date.now();
        try {
          const reported = await checker.check({
            place: { names: candidate.placeNames, category: candidate.category },
            post: {
              platform: candidate.platform,
              text: candidate.text,
              author: candidate.author,
              title: candidate.title,
              locationName: candidate.locationName,
            },
          });
          return {
            candidate,
            latencyMs: Date.now() - started,
            result: { ok: true as const, reported },
          };
        } catch (error) {
          // Name and status only: an SDK error can carry the post or the response.
          const failure = describeCheckFailure(error);
          console.error(`story finder check failed for ${candidate.candidateId}: ${failure}`);
          return {
            candidate,
            latencyMs: Date.now() - started,
            result: { ok: false as const, error: failure },
          };
        }
      });
      for (const { candidate, latencyMs, result } of results) {
        // Nothing is linked here: the posts that pass are linked together when the whole run has
        // been checked, stories first (see below), so the order of the checks decides nothing.
        await ctx.runMutation(internal.storyFinder.recordCheck, {
          candidateId: candidate.candidateId,
          stewardPersonId: args.stewardPersonId,
          attach: false,
          modelSetting,
          latencyMs,
          result,
        });
      }
    }
    const remaining = args.remaining - batch.length;
    if (batch.length > 0 && remaining > 0) {
      await ctx.scheduler.runAfter(0, internal.storyFinderActions.checkBatch, {
        ...args,
        remaining,
      });
      return null;
    }
    // The run is over: link what passed, stories before tips and the newest first within each kind
    // (attachOrder), so a place with room for a few gets its best. A batch of 100 at a time; a
    // call that linked nothing ends it.
    if (args.attach)
      for (let round = 0; round < ATTACH_ROUNDS; round++) {
        const { attached, considered } = await ctx.runMutation(
          internal.storyFinder.attachAcceptedBatch,
          { stewardPersonId: args.stewardPersonId, limit: ATTACH_LIMIT },
        );
        if (attached === 0 || considered < ATTACH_LIMIT) break;
      }
    return null;
  },
});

/**
 * Translates the quotes of a place's found posts into the region's other languages with the same
 * job and AI_MODEL_TRANSLATE setting that translate owners' statements, under a prompt that treats
 * the quote as a stranger's untrusted words (input kind public_post_quote). The result is shown
 * labelled as a machine translation.
 */
export const translateExcerpts = internalAction({
  args: { placeId: v.id("place") },
  returns: v.null(),
  handler: async (ctx, input) => {
    await translateJob(input, {
      env: process.env,
      log: () => console.error(input.placeId, "excerpt translation failed"),
      listUntranslated: async () =>
        (
          await ctx.runQuery(internal.storyFinder.untranslatedExcerpts, { ...input, limit: 50 })
        ).map(({ sourceId, ...item }) => ({ claimId: sourceId, ...item })),
      placeNames: () => ctx.runQuery(internal.aiRequests.placeNames, input),
      makeTranslator: (config) =>
        createTranslator({ model: createLanguageModel(config), modelVersion: config.modelId }),
      // Framed as a stranger's untrusted words in the translator's prompt.
      inputKind: "public_post_quote",
      // Saving queues the translation check (Glimmer) in the same run as statements' checks.
      saveMachineTranslation: ({ claimId, ...args }) =>
        ctx.runMutation(internal.storyFinder.saveExcerptTranslation, {
          sourceId: claimId as Id<"source">,
          ...args,
        }),
    });
    return null;
  },
});
