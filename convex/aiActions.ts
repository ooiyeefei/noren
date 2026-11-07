"use node";

import { readWav } from "../src/lib/audio/wav";
import { createGateway } from "ai";
import { v } from "convex/values";
import { createClaimExtractor, createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig, type TranscriptionConfig } from "../src/lib/ai/config";
import { createFollowUpAgent, type FollowUp, type FollowUpInput } from "../src/lib/ai/follow-ups";
import { checkTranslationsJob, extractJob, transcribeJob, translateJob } from "../src/lib/ai/jobs";
import { createMetaTranscriber } from "../src/lib/ai/meta";
import { createCompatibleTranscriber, createTranscriber } from "../src/lib/ai/transcriber";
import { createTranslationChecker } from "../src/lib/ai/translation-check";
import { createTranslator } from "../src/lib/ai/translator";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { appError } from "./lib/errors";
import { regionConfig } from "./lib/region";

/** The same provider selection for interviews and ephemeral member recordings. */
export function transcriptionProvider(
  config: TranscriptionConfig,
  context?: { vocabularyHint: string; durationSeconds?: number },
) {
  if (config.provider === "openai-compatible")
    return createCompatibleTranscriber({ ...config, ...context });
  if (config.provider === "meta")
    return createMetaTranscriber({ ...config, vocabularyHint: context?.vocabularyHint });
  return createTranscriber({
    model: createGateway({ apiKey: config.apiKey }).transcription(config.modelId),
    modelVersion: config.modelId,
  });
}

export const transcribeStoryAudio = internalAction({
  args: {
    storageId: v.id("_storage"),
    language: v.union(v.literal("en"), v.literal("ja")),
    maxSeconds: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, { storageId, language, maxSeconds }) => {
    const blob = await ctx.storage.get(storageId);
    if (!blob || blob.size > 44 + 32000 * maxSeconds)
      throw appError("invalid_input", "recording is missing or too large");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const wav = readWav(bytes);
    if (
      !wav ||
      wav.format !== 1 ||
      wav.channels !== 1 ||
      wav.sampleRate !== 16000 ||
      wav.bitsPerSample !== 16 ||
      !wav.data.length ||
      wav.data.length / 32000 > maxSeconds
    )
      throw appError("invalid_input", "recording must be a short speech WAV");
    const config = aiConfig("transcribe", process.env);
    if (!config.ok) throw appError("conflict", "speech input is unavailable; type your story");
    try {
      const result = await transcriptionProvider(config.config).transcribe(bytes, { language });
      const text = result.text.trim();
      if (!text || text.length > 1000) throw new Error("TranscriptLength");
      return text;
    } catch (error) {
      console.error(
        `story transcription failed (${error instanceof Error ? error.name || "Error" : "NonError"})`,
      );
      throw appError("conflict", "speech could not be transcribed; try again or type your story");
    }
  },
});

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
        return transcriptionProvider(config, context);
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

const followUpValidator = v.object({
  question: v.string(),
  translation: v.optional(v.string()),
  basis: v.union(
    v.object({ kind: v.literal("quote"), quote: v.string() }),
    v.object({ kind: v.literal("gap"), cautionType: v.string() }),
  ),
});

/**
 * The follow-up agent: reads the owner's words and suggests what the interviewer could ask next.
 * Questions go back to the interviewer only; nothing is stored or published.
 */
export const suggestFollowUps = action({
  args: { interviewId: v.id("interview"), readerLanguage: v.string() },
  returns: v.array(followUpValidator),
  handler: async (ctx, args): Promise<FollowUp[]> => {
    // Checks access first, then the setting, as the other AI requests do.
    const context: Omit<FollowUpInput, "region"> & { regionId: string } = await ctx.runMutation(
      internal.aiRequests.beginFollowUps,
      args,
    );
    const config = aiConfig("followup", process.env);
    if (!config.ok) throw appError("conflict", config.reason);
    try {
      return await createFollowUpAgent({ model: createLanguageModel(config.config) }).suggest({
        ...context,
        region: regionConfig(context.regionId),
      });
    } catch (error) {
      console.error(
        args.interviewId,
        `follow-up suggestions failed (${error instanceof Error ? error.name : "NonError"})`,
      );
      throw appError("conflict", "follow-up questions could not be suggested; try again");
    }
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

/**
 * One run of the translation check (see checkTranslationsJob). Only translationChecks.finishRun
 * schedules the next run, so a sleeping endpoint is retried by scheduling, never by waiting here.
 */
export const checkTranslations = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    try {
      await checkTranslationsJob({
        env: process.env,
        log: (line) => console.error("translation check:", line),
        now: () => Date.now(),
        startBatch: () => ctx.runMutation(internal.translationChecks.startBatch, {}),
        makeChecker: (config) => createTranslationChecker({ model: createLanguageModel(config) }),
        makeTranslator: (config) =>
          createTranslator({
            model: createLanguageModel(config),
            modelVersion: config.modelId,
            timeoutMs: 60_000,
          }),
        placeNames: (placeId) =>
          ctx.runQuery(internal.aiRequests.placeNames, { placeId: placeId as Id<"place"> }),
        record: (item, modelSetting, outcome) =>
          ctx.runMutation(internal.translationChecks.recordOutcome, {
            checkId: item.checkId as Id<"translationCheck">,
            text: item.text,
            modelSetting,
            outcome,
          }),
        saveRetranslation: (item, newText, modelVersion) =>
          ctx.runMutation(internal.translationChecks.saveRetranslation, {
            checkId: item.checkId as Id<"translationCheck">,
            text: item.text,
            newText,
            modelVersion,
          }),
      });
    } finally {
      await ctx.runMutation(internal.translationChecks.finishRun, {});
    }
    return null;
  },
});
