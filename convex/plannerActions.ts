"use node";

import { createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig, toolStep } from "../src/lib/ai/config";
import { NOREN_ORIGIN } from "../src/lib/connector/urls";
import {
  PlannerUnavailable,
  checkRequest,
  planReply,
  replyValidator,
  requestFields,
  type PlannerReply,
} from "../src/lib/planner";
import { actionConnectorData } from "../src/lib/planner/action-data";
import { RequestError } from "../src/lib/planner/request";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { appError } from "./lib/errors";
import { regionConfig } from "./lib/region";

/** Claude's thinking counts toward its output limit, so it gets room for the answer as well. */
const CLAUDE_MAX_OUTPUT_TOKENS = 8000;

/**
 * "Plan my day". The page sends the recent turns, the memory snapshot a question needs and where to
 * start (a neighbourhood or a place, never coordinates); this runs the planner's model against
 * Noren's tools and returns the checked answer (src/lib/planner/resolve.ts). It is stateless:
 * nothing the person said is stored, and what comes back is not either.
 *
 * Logs name an error and never include what was asked or answered.
 */
export const ask = action({
  args: requestFields,
  returns: replyValidator,
  handler: async (ctx, args): Promise<PlannerReply> => {
    // The switch, sign-in, AI settings and limits, in that order (convex/planner.ts).
    const { regionId }: { regionId: string } = await ctx.runMutation(internal.planner.begin, {});
    const config = aiConfig("plan", process.env);
    if (!config.ok) throw appError("conflict", config.reason);
    const region = regionConfig(regionId);
    // Too big or empty is turned away before a model is even built.
    let request;
    try {
      request = checkRequest(args);
    } catch (error) {
      if (error instanceof RequestError) throw appError("invalid_input", error.message);
      throw error;
    }
    try {
      return await planReply(request, {
        model: createLanguageModel(config.config),
        data: actionConnectorData(ctx, regionId),
        region,
        origin: NOREN_ORIGIN,
        now: Date.now,
        ...(toolStep(config.config, CLAUDE_MAX_OUTPUT_TOKENS).maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: CLAUDE_MAX_OUTPUT_TOKENS }),
      });
    } catch (error) {
      if (error instanceof RequestError) throw appError("invalid_input", error.message);
      const name =
        error instanceof PlannerUnavailable
          ? "unavailable"
          : error instanceof Error
            ? error.name || "Error"
            : "NonError";
      console.error(`planner failed (${name})`);
      throw appError("conflict", "the planner could not answer; try again");
    }
  },
});
