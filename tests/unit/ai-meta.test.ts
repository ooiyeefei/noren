import { describe, expect, it, vi } from "vitest";
import { encodeWav } from "../../src/lib/audio/wav";
import { createClaimExtractor } from "../../src/lib/ai/claim-extractor";
import { createMeta, createMetaTranscriber } from "../../src/lib/ai/meta";
import { loadRegions } from "../../src/lib/region";

const region = loadRegions().get("nagasaki")!;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const seconds = (n: number, rate = 16000) => encodeWav(new Float32Array(n * rate).fill(0.1), rate);

function transcriber(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  });
  const transcribe = createMetaTranscriber({
    apiKey: "mock-meta-key",
    modelId: "muse-voice-transcribe-1.0",
    vocabularyHint: "モック喫茶、 モック通り",
    retryDelayMs: 0,
    fetch: fetch as typeof globalThis.fetch,
  });
  return { transcribe, calls, fetch };
}

describe("Meta language model", () => {
  it("asks Chat Completions for strict JSON with the bearer key and parses the claims", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init! });
      const claims = [
        {
          kind: "story",
          cautionType: null,
          textOriginal: "mock",
          quote: "mock",
          spanStart: 0,
          spanEnd: 4,
        },
      ];
      return json({
        id: "mock",
        object: "chat.completion",
        created: 0,
        model: "muse-spark-1.3",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify({ claims }) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    });
    const model = createMeta({ apiKey: "mock-meta-key", fetch: fetch as typeof globalThis.fetch })(
      "muse-spark-1.3",
    );
    const claims = await createClaimExtractor({ model }).extract("mock transcript", {
      regionConfig: region,
    });
    expect(claims).toEqual([
      { kind: "story", textOriginal: "mock", quote: "mock", spanStart: 0, spanEnd: 4 },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://api.meta.ai/v1/chat/completions");
    expect(new Headers(requests[0]!.init.headers).get("authorization")).toBe(
      "Bearer mock-meta-key",
    );
    const body = JSON.parse(String(requests[0]!.init.body));
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
  });
});

describe("Meta transcriber", () => {
  it("posts WAV with the request settings and maps turns to seconds without speakers", async () => {
    const { transcribe, calls } = transcriber(
      json({
        sessionId: "mock",
        transcript: "祖母が始めた店です。 どうぞ",
        audioDurationMs: 3000,
        turns: [
          {
            turnId: 0,
            startMs: 1000,
            endMs: 2500,
            transcript: " 祖母が始めた店です。 ",
            speaker: "A",
          },
          { turnId: 1, startMs: 2500, endMs: 3000, transcript: "どうぞ", speaker: "B" },
          { turnId: 2, startMs: 3000, endMs: 3000, transcript: " " },
        ],
      }),
    );
    const result = await transcribe.transcribe(seconds(3), { language: "ja" });
    expect(result).toEqual({
      text: "祖母が始めた店です。 どうぞ",
      segments: [
        { start: 1, end: 2.5, text: "祖母が始めた店です。" },
        { start: 2.5, end: 3, text: "どうぞ" },
      ],
      language: "ja",
      durationSeconds: 3,
      modelVersion: "meta:muse-voice-transcribe-1.0",
    });
    expect(calls[0]!.url).toBe("https://api.meta.ai/v1/asr/transcribe");
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("authorization")).toBe("Bearer mock-meta-key");
    expect(headers.get("accept")).toBe("application/json");
    const form = calls[0]!.init.body as FormData;
    expect(JSON.parse(await (form.get("request") as Blob).text())).toEqual({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      mode: "DIARIZATION",
      languageBias: ["Japanese"],
      keywords: ["モック喫茶", "モック通り"],
    });
    const audio = form.get("audio") as File;
    expect(audio.name).toBe("audio.wav");
    expect(audio.type).toBe("audio/wav");
    expect(audio.size).toBe(44 + 3 * 16000 * 2);
  });
  it("splits a long recording into parts and offsets the later part's times", async () => {
    const { transcribe, calls } = transcriber(
      json({ transcript: "前半", turns: [{ startMs: 1000, endMs: 2000, transcript: "前半" }] }),
      json({ transcript: "後半", turns: [{ startMs: 500, endMs: 1500, transcript: "後半" }] }),
    );
    const result = await transcribe.transcribe(seconds(570), { language: "ja" });
    expect(calls).toHaveLength(2);
    expect((calls[1]!.init.body as FormData).get("audio")).toHaveProperty("size", 44 + 30 * 32000);
    expect(result.segments).toEqual([
      { start: 1, end: 2, text: "前半" },
      { start: 540.5, end: 541.5, text: "後半" },
    ]);
    expect(result.text).toBe("前半\n後半");
    expect(result.durationSeconds).toBe(570);
  });
  it("uses the whole transcript as one segment when a part has no turns", async () => {
    const { transcribe } = transcriber(json({ transcript: " モック ", turns: [] }));
    expect((await transcribe.transcribe(seconds(2), { language: "en" })).segments).toEqual([
      { start: 0, end: 2, text: "モック" },
    ]);
  });
  it("retries once after a rate limit", async () => {
    const { transcribe, calls } = transcriber(
      json({ error: { message: "slow down", type: "rate_limit_error" } }, 429),
      json({ transcript: "モック", turns: [] }),
    );
    expect((await transcribe.transcribe(seconds(1), { language: "ja" })).text).toBe("モック");
    expect(calls).toHaveLength(2);
  });
  it("reports status, type and a redacted message, never the key or recording text", async () => {
    const failed = async (response: Response) => {
      const { transcribe } = transcriber(response, response.clone());
      return transcribe.transcribe(seconds(1), { language: "ja" }).then(
        () => "",
        (error: Error) => error.message,
      );
    };
    const message = await failed(
      json(
        {
          error: {
            message: "bad audio for mock-meta-key, see https://mock.example/x",
            type: "invalid_request_error",
            code: "bad_audio",
          },
        },
        400,
      ),
    );
    expect(message).toContain("HTTP 400, invalid_request_error, bad_audio");
    expect(message).toContain("bad audio for [redacted], see [redacted]");
    expect(message).not.toContain("mock-meta-key");
    expect(await failed(json({ message: "transcript: 祖母が" }, 500))).toContain(
      "provider message withheld",
    );
    expect(await failed(new Response("audio 祖母が", { status: 500 }))).toContain(
      "HTTP 500): no provider message available",
    );
  });
  it("refuses audio that is not 16 or 24 kHz mono 16-bit WAV before any request", async () => {
    const { transcribe, fetch } = transcriber();
    for (const audio of [new Uint8Array([1, 2, 3]), encodeWav(new Float32Array(441), 44100)]) {
      await expect(transcribe.transcribe(audio, { language: "ja" })).rejects.toThrow(
        "16 kHz or 24 kHz mono 16-bit WAV",
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("an empty result is an error, not an empty transcript", async () => {
    const { transcribe } = transcriber(json({ transcript: "", turns: [] }));
    await expect(transcribe.transcribe(seconds(1), { language: "ja" })).rejects.toThrow(
      "contains no text",
    );
  });
});
