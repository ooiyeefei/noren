import type { ClaimExtractor, ExtractedClaim, Transcriber, Translator } from "../ports/index";
import { getRegionConfig } from "../region/registry";
import { anchorClaims } from "./claim-extractor";
import { aiConfig, type AiModelConfig, type TranscriptionConfig } from "./config";
import { toTranscriptSegments } from "./transcriber";
import { placeGlossary } from "./translator";

export type JobDeps = {
  env: Readonly<Record<string, string | undefined>>;
  log: (line: string) => void;
};

function safeMessage(message: string, deps: JobDeps): string {
  const key = deps.env.AI_GATEWAY_API_KEY?.trim();
  return key ? message.replaceAll(key, "[redacted]") : message;
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
              inputKind: "claim",
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
