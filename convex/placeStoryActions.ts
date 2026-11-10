"use node";

import { v } from "convex/values";
import { createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig, reportMode, toolStep } from "../src/lib/ai/config";
import { classifyCheckError } from "../src/lib/ai/translation-check";
import { runStoryAgent } from "../src/lib/story-agent/agent";
import { createStoryChecker } from "../src/lib/story-agent/check";
import { createStoryWriter } from "../src/lib/story-agent/story";
import { describeCheckFailure } from "../src/lib/story-finder/check";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * One run of the story agent for one place. The second reader runs on a Modal endpoint that sleeps, so
 * the run wakes it first and comes back later rather than waiting here. Errors keep only their name and
 * status: an SDK error can carry the posts.
 */
export const writeStory = internalAction({
  args: { runId: v.id("placeStoryRun") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const write = aiConfig("write_story", process.env);
    const check = aiConfig("check_story", process.env);
    if (!write.ok || !check.ok) {
      const error = !write.ok ? write.reason : check.ok ? "no model is set" : check.reason;
      console.error(`story agent stopped: ${error}`);
      await ctx.runMutation(internal.placeStories.failRun, { runId, error });
      return null;
    }
    const checker = createStoryChecker({
      model: createLanguageModel(check.config),
      reportMode: reportMode(check.config),
    });
    const started = await ctx.runMutation(internal.placeStories.beginRun, {
      runId,
      writer: process.env.AI_MODEL_WRITE_STORY?.trim() ?? write.config.modelId,
      checker: process.env.AI_MODEL_CHECK_STORY?.trim() ?? check.config.modelId,
    });
    if (started === null) return null;
    const stop = async (error: unknown) => {
      const failure = describeCheckFailure(error);
      console.error(`story agent run ${runId} stopped: ${failure}`);
      if (classifyCheckError(error) === "retry")
        await ctx.runMutation(internal.placeStories.waitForChecker, { runId, error: failure });
      else await ctx.runMutation(internal.placeStories.failRun, { runId, error: failure });
    };
    try {
      await checker.wake();
    } catch (error) {
      await stop(error);
      return null;
    }
    try {
      const sentences = await runStoryAgent(started, {
        writer: createStoryWriter({
          model: createLanguageModel(write.config),
          // Meta's Model API and Claude are asked with tool_choice "auto"; see toolStep.
          ...toolStep(write.config, 16_000),
        }),
        checker,
        step: (step) =>
          ctx.runMutation(internal.placeStories.addStep, {
            runId,
            step: { ...step, at: Date.now() },
          }),
      });
      await ctx.runMutation(internal.placeStories.saveStory, {
        runId,
        sentences,
        postsRead: started.posts.length,
      });
    } catch (error) {
      await stop(error);
    }
    return null;
  },
});
