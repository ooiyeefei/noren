import type {
  ClaimExtractor,
  ExtractedClaim,
  Transcriber,
  Translator,
  TranslatorInputKind,
} from "../ports/index";
import { getRegionConfig } from "../region/registry";
import { anchorClaims } from "./claim-extractor";
import { aiConfig, type AiModelConfig, type TranscriptionConfig } from "./config";
import { toTranscriptSegments } from "./transcriber";
import {
  classifyCheckError,
  describeCheckError,
  type CheckReport,
  type TranslationChecker,
} from "./translation-check";
import { placeGlossary } from "./translator";

export type JobDeps = {
  env: Readonly<Record<string, string | undefined>>;
  log: (line: string) => void;
};

const KEY_VARIABLES = [
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "META_API_KEY",
  "MODAL_PROXY_TOKEN",
  "TRANSCRIBE_API_KEY",
] as const;

function safeMessage(message: string, deps: JobDeps): string {
  return KEY_VARIABLES.reduce((safe, variable) => {
    const key = deps.env[variable]?.trim();
    return key ? safe.replaceAll(key, "[redacted]") : safe;
  }, message);
}

function describe(error: unknown): string {
  return error instanceof Error
    ? `${error.name || "Error"}: ${error.message.trim() || String(error)}`
    : `NonError: ${String(error) || "unknown thrown value"}`;
}

async function recordFailure(
  message: string,
  deps: JobDeps & { recordProcessingError(message: string): Promise<unknown> },
) {
  const safe = safeMessage(message, deps);
  deps.log(safe);
  try {
    await deps.recordProcessingError(safe);
  } catch (error) {
    deps.log(safeMessage(`recording processing error failed (${describe(error)})`, deps));
  }
}

export async function transcribeJob(
  input: { interviewId: string; storageId: string; language: string },
  deps: JobDeps & {
    loadAudio(storageId: string): Promise<Uint8Array | null>;
    makeTranscriber(config: TranscriptionConfig): Transcriber;
    saveMachineTranscript(args: {
      segments: { start: number; end: number; text: string }[];
      lang: string;
      modelVersion: string;
      durationS?: number;
    }): Promise<unknown>;
    recordProcessingError(message: string): Promise<unknown>;
  },
): Promise<"saved" | "failed"> {
  try {
    const config = aiConfig("transcribe", deps.env);
    if (!config.ok) throw new Error(config.reason);
    const audio = await deps.loadAudio(input.storageId);
    if (audio === null) throw new Error("the audio file is missing");
    const result = await deps
      .makeTranscriber(config.config)
      .transcribe(audio, { language: input.language });
    await deps.saveMachineTranscript({
      segments: toTranscriptSegments(result),
      lang: result.language,
      modelVersion: config.config.modelId,
      ...(Number.isFinite(result.durationSeconds) && result.durationSeconds >= 0
        ? { durationS: result.durationSeconds }
        : {}),
    });
    return "saved";
  } catch (error) {
    await recordFailure(`transcription failed (${describe(error)})`, deps);
    return "failed";
  }
}

export async function extractJob(
  _input: { interviewId: string },
  deps: JobDeps & {
    loadForExtraction(): Promise<{
      transcriptId: string;
      text: string;
      language: string;
      regionId: string;
    }>;
    makeExtractor(config: AiModelConfig): ClaimExtractor;
    insertExtracted(args: {
      transcriptId: string;
      modelVersion: string;
      items: ExtractedClaim[];
    }): Promise<{ inserted: number; dropped: number }>;
    recordProcessingError(message: string): Promise<unknown>;
  },
): Promise<{ inserted: number; dropped: number } | "failed"> {
  try {
    const config = aiConfig("extract", deps.env);
    if (!config.ok) throw new Error(config.reason);
    const transcript = await deps.loadForExtraction();
    const region = getRegionConfig(transcript.regionId);
    if (!region) throw new Error("the interview's region is not configured");
    const raw = await deps
      .makeExtractor(config.config)
      .extract(transcript.text, { regionConfig: region });
    const items = anchorClaims(transcript.text, raw, region);
    const result = await deps.insertExtracted({
      transcriptId: transcript.transcriptId,
      items,
      modelVersion: config.config.modelId,
    });
    const dropped = result.dropped + raw.length - items.length;
    if (!result.inserted) {
      await recordFailure(
        `no claims were proposed: ${dropped} dropped by the quote check (Error: no anchored claims inserted)`,
        deps,
      );
    }
    return { inserted: result.inserted, dropped };
  } catch (error) {
    await recordFailure(`claim extraction failed (${describe(error)})`, deps);
    return "failed";
  }
}

export async function translateJob(
  _input: { placeId: string },
  deps: JobDeps & {
    listUntranslated(): Promise<{ claimId: string; text: string; from: string; to: string }[]>;
    placeNames(): Promise<{ lang: string; value: string; isPrimary: boolean }[]>;
    makeTranslator(config: AiModelConfig): Translator;
    /** What the items are (default "claim"); a found post's quote is "public_post_quote". */
    inputKind?: TranslatorInputKind;
    saveMachineTranslation(args: {
      claimId: string;
      lang: string;
      sourceText: string;
      text: string;
      modelVersion: string;
    }): Promise<unknown>;
  },
): Promise<{ translated: number; failed: number }> {
  let pending: Awaited<ReturnType<typeof deps.listUntranslated>> = [];
  let translated = 0;
  let failed = 0;
  const log = (error: unknown) =>
    deps.log(safeMessage(`translation failed (${describe(error)})`, deps));
  try {
    const config = aiConfig("translate", deps.env);
    if (!config.ok) {
      log(new Error(config.reason));
      return { translated: 0, failed: 0 };
    }
    pending = await deps.listUntranslated();
    if (!pending.length) return { translated: 0, failed: 0 };
    const names = await deps.placeNames();
    const translator = deps.makeTranslator(config.config);
    const groups = new Map<string, typeof pending>();
    for (const item of pending) {
      const key = JSON.stringify([item.from, item.to]);
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      // Keep every item even if a dependency supplies more than the query's usual 50-item cap.
      for (let offset = 0; offset < group.length; offset += 50) {
        const batch = group.slice(offset, offset + 50);
        const first = batch[0];
        if (!first) continue;
        const { from, to } = first;
        try {
          const result = await translator.translate(
            batch.map(({ claimId, text }) => ({ itemId: claimId, text })),
            {
              from,
              to,
              inputKind: deps.inputKind ?? "claim",
              glossary: placeGlossary(names, from, to),
            },
          );
          if (!result.ok) throw new Error(result.reason);
          for (const item of batch) {
            const output = result.items.find(({ itemId }) => itemId === item.claimId);
            if (!output?.text.trim()) {
              failed++;
              log(new Error(`no translation returned for claim ${item.claimId}`));
              continue;
            }
            try {
              await deps.saveMachineTranslation({
                claimId: item.claimId,
                lang: to,
                sourceText: item.text,
                text: output.text,
                modelVersion: config.config.modelId,
              });
              translated++;
            } catch (error) {
              failed++;
              log(error);
            }
          }
        } catch (error) {
          failed += batch.length;
          log(error);
        }
      }
    }
    return { translated, failed };
  } catch (error) {
    log(error);
    return { translated, failed: Math.max(failed, pending.length - translated) };
  }
}

export type TranslationCheckItem = {
  checkId: string;
  text: string;
  lang: string;
  original: string;
  originalLang: string;
  placeId: string;
  retranslated: boolean;
  /**
   * How the translator frames the words when it translates them again: a statement ("claim", the
   * default) or a found post's quote, a stranger's untrusted words ("public_post_quote").
   */
  inputKind?: TranslatorInputKind;
};
export type TranslationCheckOutcome =
  | ({ kind: "report" } & CheckReport)
  | { kind: "retry"; sent: boolean; error?: string }
  | { kind: "defer" }
  | { kind: "fail"; error: string }
  | { kind: "retranslation_failed"; error: string };
export type TranslationCheckStep =
  "passed" | "retranslate" | "held" | "waiting" | "unavailable" | "stale";

/** A run stops starting checks after this, leaving the rest for the next run. */
export const CHECK_RUN_BUDGET_MS = 4 * 60_000;

/**
 * One run of the translation check over every check that is due. The first request that finds
 * the endpoint asleep (or unreachable) stops the run from sending more: the rest wait with it, so
 * the wake it started serves them all when the next run comes 30 seconds later.
 */
export async function checkTranslationsJob(
  deps: JobDeps & {
    now(): number;
    startBatch(): Promise<TranslationCheckItem[]>;
    makeChecker(config: AiModelConfig): TranslationChecker;
    makeTranslator(config: AiModelConfig): Translator;
    placeNames(placeId: string): Promise<{ lang: string; value: string; isPrimary: boolean }[]>;
    record(
      item: TranslationCheckItem,
      modelSetting: string,
      outcome: TranslationCheckOutcome,
    ): Promise<TranslationCheckStep>;
    saveRetranslation(
      item: TranslationCheckItem,
      text: string,
      modelVersion: string,
    ): Promise<boolean>;
  },
): Promise<Record<TranslationCheckStep, number>> {
  const counts: Record<TranslationCheckStep, number> = {
    passed: 0,
    retranslate: 0,
    held: 0,
    waiting: 0,
    unavailable: 0,
    stale: 0,
  };
  const log = (line: string) => deps.log(safeMessage(line, deps));
  const setting = deps.env.AI_MODEL_CHECK_TRANSLATION?.trim() ?? "";
  // Leased by this run and not yet recorded; released in `finally` if the run fails.
  const open = new Map<string, TranslationCheckItem>();
  const record = async (item: TranslationCheckItem, outcome: TranslationCheckOutcome) => {
    const step = await deps.record(item, setting, outcome);
    if (step === "retranslate") open.set(item.checkId, item);
    else open.delete(item.checkId);
    counts[step] += 1;
    return step;
  };
  try {
    const items = await deps.startBatch();
    for (const item of items) open.set(item.checkId, item);
    if (!items.length) return counts;
    const config = aiConfig("check_translation", deps.env);
    if (!config.ok) {
      log(`translation check failed (Error: ${config.reason})`);
      for (const item of items) await record(item, { kind: "fail", error: config.reason });
      return counts;
    }
    const checker = deps.makeChecker(config.config);
    const started = deps.now();
    let waking = false;
    const blocked = (): TranslationCheckOutcome | undefined =>
      waking
        ? { kind: "retry", sent: false }
        : deps.now() - started > CHECK_RUN_BUDGET_MS
          ? { kind: "defer" }
          : undefined;
    const attempt = async (item: TranslationCheckItem): Promise<TranslationCheckOutcome> => {
      try {
        const report = await checker.check({
          original: item.original,
          originalLang: item.originalLang,
          translation: item.text,
          translationLang: item.lang,
        });
        return { kind: "report", ...report };
      } catch (error) {
        const description = safeMessage(describeCheckError(error), deps);
        if (classifyCheckError(error) === "retry") {
          waking = true;
          return { kind: "retry", sent: true, error: description };
        }
        log(`translation check failed (${description})`);
        return { kind: "fail", error: description };
      }
    };
    const retranslate = async (item: TranslationCheckItem, report: CheckReport) => {
      const translate = aiConfig("translate", deps.env);
      if (!translate.ok) throw new Error(translate.reason);
      const names = await deps.placeNames(item.placeId);
      const result = await deps
        .makeTranslator(translate.config)
        .translate([{ itemId: item.checkId, text: item.original }], {
          from: item.originalLang,
          to: item.lang,
          glossary: placeGlossary(names, item.originalLang, item.lang),
          inputKind: item.inputKind ?? "claim",
          feedback: { added: report.added, missing: report.missing },
        });
      if (!result.ok) throw new Error(result.reason);
      const text = result.items.find(({ itemId }) => itemId === item.checkId)?.text.trim();
      if (!text) throw new Error("no translation returned");
      return { text, modelVersion: translate.config.modelId };
    };

    for (const item of items) {
      const wait = blocked();
      if (wait) {
        await record(item, wait);
        continue;
      }
      const first = await attempt(item);
      if ((await record(item, first)) !== "retranslate" || first.kind !== "report") continue;
      // The loop's one correction: translate again with what the check found, then check again.
      let again: { text: string; modelVersion: string };
      try {
        again = await retranslate(item, first);
      } catch (error) {
        const description = safeMessage(describe(error), deps);
        log(`re-translation failed (${description})`);
        await record(item, { kind: "retranslation_failed", error: description });
        continue;
      }
      if (!(await deps.saveRetranslation(item, again.text, again.modelVersion))) {
        open.delete(item.checkId);
        counts.stale += 1;
        continue;
      }
      const next = { ...item, text: again.text, retranslated: true };
      open.set(item.checkId, next);
      await record(next, blocked() ?? (await attempt(next)));
    }
  } catch (error) {
    log(`translation check run failed (${describe(error)})`);
  } finally {
    for (const item of open.values()) {
      try {
        await deps.record(item, setting, { kind: "defer" });
      } catch (error) {
        log(`releasing a translation check failed (${describe(error)})`);
      }
    }
  }
  return counts;
}
