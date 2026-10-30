import { createOpenAI, type OpenAITranscriptionModelOptions } from "@ai-sdk/openai";
import { transcribe as sdkTranscribe, type TranscriptionModel } from "ai";
import type { Transcriber, Transcription, TranscriptSegment } from "../ports/index";

function splitText(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 5000) {
    const boundaries = [...rest.slice(0, 5000).matchAll(/。|！|？|\. |! |\? /g)];
    const last = boundaries.at(-1);
    const cut = last ? last.index + last[0].length : 4000;
    const chunk = rest.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function toTranscriptSegments(result: Transcription): TranscriptSegment[] {
  const duration = Number.isFinite(result.durationSeconds)
    ? Math.max(0, result.durationSeconds)
    : 0;
  const source = result.segments.some((segment) => segment.text.trim())
    ? result.segments
    : [{ start: 0, end: duration, text: result.text }];
  const segments = source.flatMap(({ start, end, text }) => {
    const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
    const safeEnd = Number.isFinite(end) ? Math.max(safeStart, end) : safeStart;
    return splitText(text).map((chunk) => ({ start: safeStart, end: safeEnd, text: chunk }));
  });
  if (!segments.length) throw new Error("the transcription contains no text");
  if (segments.length > 2000) throw new Error("the transcription exceeds 2000 segments");
  return segments;
}

export function createTranscriber(options: {
  model: TranscriptionModel;
  modelVersion: string;
  timeoutMs?: number;
}): Transcriber {
  return {
    async transcribe(audio, { language }) {
      const result = await sdkTranscribe({
        model: options.model,
        audio,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? 8 * 60_000),
      });
      // No documented gateway language-hint option; preserve the detected language when present.
      const transcription: Transcription = {
        text: result.text,
        segments: result.segments.map(({ startSecond, endSecond, text }) => ({
          start: startSecond,
          end: endSecond,
          text,
        })),
        language: result.language?.trim() || language,
        durationSeconds: Number.isFinite(result.durationInSeconds)
          ? Math.max(0, result.durationInSeconds!)
          : 0,
        modelVersion: options.modelVersion,
      };
      return { ...transcription, segments: toTranscriptSegments(transcription) };
    },
  };
}

export type CompatibleTranscriberOptions = {
  baseURL: string;
  apiKey: string;
  modelId: string;
  maxBytes: number;
  /** Place names only; never include information about an interview participant. */
  vocabularyHint?: string;
  durationSeconds?: number;
  timeoutMs?: number;
  fetch?: NonNullable<Parameters<typeof createOpenAI>[0]>["fetch"];
};

export function supportsTimestamps(modelId: string): boolean {
  return !modelId.startsWith("gpt-");
}

function providerFailure(error: unknown, options: CompatibleTranscriberOptions): string {
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const outer = record(error);
  // The SDK wraps exhausted retries; the last attempt carries the HTTP status and reason.
  const details = outer.lastError ? record(outer.lastError) : outer;
  const provider = record(record(details.data).error);
  const redact = (value: string) => {
    let safe = options.apiKey ? value.replaceAll(options.apiKey, "[redacted]") : value;
    safe = safe.replaceAll(options.baseURL, "[redacted]");
    try {
      safe = safe.replaceAll(new URL(options.baseURL).host, "[redacted]");
    } catch {
      // Invalid endpoint configuration may itself be the failure.
    }
    return safe
      .replace(/sk-[\w-]+/g, "[redacted]")
      .replace(/(?:https?:\/\/|data:|blob:)[^\s<>"']+/gi, "[redacted]")
      .replace(/[\r\n\x00-\x1f\x7f]+/g, " ")
      .trim();
  };
  const name =
    typeof outer.name === "string" && outer.name.trim()
      ? redact(outer.name).slice(0, 80)
      : error === null
        ? "null"
        : typeof error;
  const fields = [name];
  if (typeof details.statusCode === "number" && Number.isInteger(details.statusCode)) {
    fields.push(`HTTP ${details.statusCode}`);
  }
  for (const field of [provider.type, provider.code, details.type, details.code]) {
    if (
      (typeof field === "string" && /^[\w.-]+$/.test(field)) ||
      (typeof field === "number" && Number.isFinite(field))
    ) {
      const safe = redact(String(field)).slice(0, 80);
      if (!fields.includes(safe)) fields.push(safe);
    }
  }
  const message = typeof provider.message === "string" ? provider.message : details.message;
  // Never stringify errors, request bodies or responses: they can carry the uploaded recording.
  // Unstructured messages mentioning recording content are withheld rather than echoed to the UI.
  const reason =
    typeof message === "string" && message.trim()
      ? /\btranscript\b|\b(?:audio|transcription text)\s*[:=]/i.test(message)
        ? "provider message withheld because it contains recording content"
        : redact(message).slice(0, 200)
      : "no provider message available";
  return `Transcription provider failed (${fields.join(", ")}): ${reason || "no provider message available"}. Use the typed-transcript fallback or change TRANSCRIBE_MODEL.`;
}

export function createCompatibleTranscriber(
  options: CompatibleTranscriberOptions,
  modelFactory: (options: CompatibleTranscriberOptions) => TranscriptionModel = (config) =>
    createOpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      fetch: config.fetch,
    }).transcription(config.modelId),
): Transcriber {
  return {
    async transcribe(audio, { language }) {
      if (audio.byteLength > options.maxBytes) {
        throw new Error(
          `Audio exceeds TRANSCRIBE_MAX_BYTES (${options.maxBytes} bytes); compress or split the recording.`,
        );
      }
      let result;
      try {
        const prompt = options.vocabularyHint?.trim().slice(0, 200);
        result = await sdkTranscribe({
          model: modelFactory(options),
          audio,
          providerOptions: {
            openai: {
              language,
              // The provider defaults omitted granularities to ["segment"], even for GPT models.
              timestampGranularities: supportsTimestamps(options.modelId) ? ["segment"] : [],
              ...(prompt ? { prompt } : {}),
            } satisfies OpenAITranscriptionModelOptions,
          },
          telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(options.timeoutMs ?? 8 * 60_000),
        });
      } catch (error) {
        throw new Error(providerFailure(error, options));
      }
      const segments = result.segments.map(({ startSecond, endSecond, text }) => ({
        start: startSecond,
        end: endSecond,
        text,
      }));
      const lastEnd = segments.at(-1)?.end;
      const durationSeconds = Number.isFinite(result.durationInSeconds)
        ? Math.max(0, result.durationInSeconds!)
        : Number.isFinite(lastEnd)
          ? Math.max(0, lastEnd!)
          : supportsTimestamps(options.modelId) && Number.isFinite(options.durationSeconds)
            ? Math.max(0, options.durationSeconds!)
            : 0;
      const transcription: Transcription = {
        text: result.text,
        segments,
        language: result.language?.trim() || language,
        durationSeconds,
        modelVersion: `openai-compatible:${options.modelId}`,
      };
      // Endpoints without timestamps fall back to one segment spanning the known audio duration.
      return { ...transcription, segments: toTranscriptSegments(transcription) };
    },
  };
}
