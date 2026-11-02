"use node";

import { createGateway } from "ai";
import { v } from "convex/values";
import { createClaimExtractor, createLanguageModel } from "../src/lib/ai/claim-extractor";
import type { TranscriptionConfig } from "../src/lib/ai/config";
import { extractJob, transcribeJob, translateJob } from "../src/lib/ai/jobs";
import { createMetaTranscriber } from "../src/lib/ai/meta";
import { createCompatibleTranscriber, createTranscriber } from "../src/lib/ai/transcriber";
import { createTranslator } from "../src/lib/ai/translator";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const transcribeInterview = internalAction({
  args: { interviewId: v.id("interview"), storageId: v.id("_storage"), language: v.string() },
  returns: v.null(),
  handler: async (ctx, input) => {
    let context: { vocabularyHint: string; durationSeconds?: number } | undefined;
    let modelVersion: string | undefined;
    await transcribeJob(input, {
      env: process.env,
      log: () => console.error(input.interviewId, "transcription failed"),
      loadAudio: async (storageId) => {
        const blob = await ctx.storage.get(storageId as Id<"_storage">);
        const provider = process.env.TRANSCRIBE_PROVIDER?.trim();
        if (blob !== null && (provider === "openai-compatible" || provider === "meta")) {
          context = await ctx.runQuery(internal.aiRequests.transcriptionContext, {
            interviewId: input.interviewId,
          });
        }
        return blob === null ? null : new Uint8Array(await blob.arrayBuffer());
      },
      makeTranscriber: (config: TranscriptionConfig) => {
        modelVersion =
          config.provider === "gateway" ? config.modelId : `${config.provider}:${config.modelId}`;
        if (config.provider === "openai-compatible")
          return createCompatibleTranscriber({ ...config, ...context });
        if (config.provider === "meta")
          return createMetaTranscriber({ ...config, vocabularyHint: context?.vocabularyHint });
        return createTranscriber({
          model: createGateway({ apiKey: config.apiKey }).transcription(config.modelId),
          modelVersion: config.modelId,
        });
      },
      saveMachineTranscript: (args) =>
        ctx.runMutation(internal.interviews.saveMachineTranscript, {
          interviewId: input.interviewId,
          ...args,
          modelVersion: modelVersion ?? args.modelVersion,
        }),
      recordProcessingError: (message) =>
        ctx.runMutation(internal.interviews.recordProcessingError, {
          interviewId: input.interviewId,
          message,
        }),
    });
    return null;
  },
});

export const extractClaims = internalAction({
  args: { interviewId: v.id("interview") },
  returns: v.null(),
  handler: async (ctx, input) => {
    await extractJob(input, {
      env: process.env,
      log: () => console.error(input.interviewId, "claim extraction failed"),
      loadForExtraction: () => ctx.runQuery(internal.interviews.loadForExtraction, input),
      makeExtractor: (config) => createClaimExtractor({ model: createLanguageModel(config) }),
      insertExtracted: ({ transcriptId, ...args }) =>
        ctx.runMutation(internal.claims.insertExtracted, {
          interviewId: input.interviewId,
          transcriptId: transcriptId as Id<"transcript">,
          ...args,
        }),
      recordProcessingError: (message) =>
        ctx.runMutation(internal.interviews.recordProcessingError, {
          interviewId: input.interviewId,
          message,
        }),
    });
    return null;
  },
});

export const translateClaims = internalAction({
  args: { placeId: v.id("place") },
  returns: v.null(),
  handler: async (ctx, input) => {
    await translateJob(input, {
      env: process.env,
      log: () => console.error(input.placeId, "translation failed"),
      listUntranslated: () =>
        ctx.runQuery(internal.claims.listUntranslated, { ...input, limit: 50 }),
      placeNames: () => ctx.runQuery(internal.aiRequests.placeNames, input),
      makeTranslator: (config) =>
        createTranslator({
          model: createLanguageModel(config),
          modelVersion: config.modelId,
        }),
      saveMachineTranslation: ({ claimId, ...args }) =>
        ctx.runMutation(internal.claims.saveMachineTranslation, {
          claimId: claimId as Id<"claim">,
          ...args,
        }),
    });
    return null;
  },
});
