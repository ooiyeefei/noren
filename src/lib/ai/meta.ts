import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { readWav, splitWav } from "../audio/wav";
import type { Transcriber, Transcription } from "../ports/index";
import { toTranscriptSegments } from "./transcriber";

export const META_BASE_URL = "https://api.meta.ai/v1";

/** Meta Model API through its OpenAI-compatible Chat Completions endpoint (strict JSON schema). */
export function createMeta(options: { apiKey: string; fetch?: typeof fetch }) {
  const provider = createOpenAI({
    name: "meta",
    baseURL: META_BASE_URL,
    apiKey: options.apiKey,
    fetch: options.fetch,
  });
  return (modelId: string): LanguageModel => provider.chat(modelId);
}

export type MetaTranscriberOptions = {
  apiKey: string;
  modelId: string;
  /** Place names joined by 、; never include information about an interview participant. */
  vocabularyHint?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  fetch?: typeof fetch;
};

type TranscribeResponse = {
  transcript?: unknown;
  turns?: { startMs?: unknown; endMs?: unknown; transcript?: unknown }[];
};

// A request takes at most 10 minutes of audio and 32 MB; 9 minutes of 24 kHz audio is 26 MB.
const PART_SECONDS = 9 * 60;

function languageName(code: string): string | undefined {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return name && name !== code ? name : undefined;
  } catch {
    return undefined;
  }
}

async function failure(response: Response, apiKey: string): Promise<string> {
  let detail: Record<string, unknown> = {};
  try {
    const body = (await response.json()) as Record<string, unknown>;
    detail = (body.error && typeof body.error === "object" ? body.error : body) as Record<
      string,
      unknown
    >;
  } catch {
    // A body that is not JSON is never echoed: it could carry the recording.
  }
  const fields = [`HTTP ${response.status}`];
  for (const field of [detail.type, detail.code])
    if (typeof field === "string" && /^[\w.-]{1,80}$/.test(field)) fields.push(field);
  const message =
    typeof detail.message === "string" && detail.message.trim()
      ? /\btranscript\b|\b(?:audio|transcription text)\s*[:=]/i.test(detail.message)
        ? "provider message withheld because it contains recording content"
        : detail.message
            .replaceAll(apiKey, "[redacted]")
            .replace(/(?:https?:\/\/|data:|blob:)[^\s<>"']+/gi, "[redacted]")
            .replace(/[\r\n\x00-\x1f\x7f]+/g, " ")
            .trim()
            .slice(0, 200)
      : "no provider message available";
  return `Transcription service failed (${fields.join(", ")}): ${message}. Use the typed-transcript fallback or change TRANSCRIBE_MODEL.`;
}

export function createMetaTranscriber(options: MetaTranscriberOptions): Transcriber {
  const send = options.fetch ?? fetch;
  return {
    async transcribe(audio, { language }) {
      const wav = readWav(audio);
      if (
        !wav ||
        wav.format !== 1 ||
        wav.channels !== 1 ||
        wav.bitsPerSample !== 16 ||
        (wav.sampleRate !== 16000 && wav.sampleRate !== 24000)
      )
        throw new Error(
          "This transcription service needs a 16 kHz or 24 kHz mono 16-bit WAV recording. Record again in Noren, or use the typed-transcript fallback.",
        );
      const name = languageName(language);
      const keywords = (options.vocabularyHint ?? "")
        .split("、")
        .map((word) => word.trim())
        .filter(Boolean)
        .slice(0, 24);
      const request = JSON.stringify({
        model: options.modelId,
        audioEncoding: "WAV",
        // Turns split where the speaker changes; the labels are dropped because people, not the
        // model, say who spoke.
        mode: "DIARIZATION",
        ...(name ? { languageBias: [name] } : {}),
        ...(keywords.length ? { keywords } : {}),
      });
      const segments: Transcription["segments"] = [];
      const texts: string[] = [];
      let offsetMs = 0;
      for (const part of splitWav(wav, PART_SECONDS)) {
        const partMs = ((part.length - 44) / 2 / wav.sampleRate) * 1000;
        const post = () => {
          const form = new FormData();
          form.append("request", new Blob([request], { type: "application/json" }));
          form.append("audio", new Blob([part], { type: "audio/wav" }), "audio.wav");
          return send(`${META_BASE_URL}/asr/transcribe`, {
            method: "POST",
            headers: { Authorization: `Bearer ${options.apiKey}`, Accept: "application/json" },
            body: form,
            signal: AbortSignal.timeout(options.timeoutMs ?? 8 * 60_000),
          });
        };
        let response = await post();
        if (response.status === 429 || response.status >= 500) {
          // Rate limits and server budget failures are worth one retry.
          await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 2000));
          response = await post();
        }
        if (!response.ok) throw new Error(await failure(response, options.apiKey));
        const body = (await response.json()) as TranscribeResponse;
        const turns = Array.isArray(body.turns) ? body.turns : [];
        for (const turn of turns) {
          const text = typeof turn.transcript === "string" ? turn.transcript.trim() : "";
          const start = Number(turn.startMs);
          const end = Number(turn.endMs);
          if (!text || !Number.isFinite(start)) continue;
          segments.push({
            start: (offsetMs + start) / 1000,
            end: (offsetMs + (Number.isFinite(end) ? Math.max(start, end) : start)) / 1000,
            text,
          });
        }
        const whole = typeof body.transcript === "string" ? body.transcript.trim() : "";
        if (!turns.length && whole)
          segments.push({ start: offsetMs / 1000, end: (offsetMs + partMs) / 1000, text: whole });
        if (whole) texts.push(whole);
        offsetMs += partMs;
      }
      const transcription: Transcription = {
        text: texts.join("\n"),
        segments,
        language,
        durationSeconds: offsetMs / 1000,
        modelVersion: `meta:${options.modelId}`,
      };
      return { ...transcription, segments: toTranscriptSegments(transcription) };
    },
  };
}
