import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createCompatibleTranscriber } from "../src/lib/ai/transcriber";

const MAX_AUDIO_BYTES = 24_000_000;
class ComparisonInputError extends Error {}
const USAGE = `Usage: npx tsx scripts/transcribe-compare.mts --file <audio path> [options]

  --models <comma list>       Default: whisper-1,gpt-4o-transcribe
  --language <code>          Default: ja
  --reference <text>         Expected text for character error rate (CER)
  --reference-file <path>    Read expected text from a UTF-8 file
  --base-url <url>           Default: https://api.openai.com/v1
  --vocab <place names>      Optional vocabulary hint (capped at 200 characters)
  --help                    Print usage without reading files or sending audio

Set TRANSCRIBE_API_KEY, or OPENAI_API_KEY when TRANSCRIBE_API_KEY is unset.
Keys are accepted only from the environment. Upload cap: 24,000,000 bytes per model.
Running this command sends the audio to the selected host for each model.
CER removes Unicode whitespace and punctuation; an empty reference yields 0 for
an empty hypothesis and Infinity otherwise.`;

export function characterErrorRate(reference: string, hypothesis: string): number {
  const normalize = (text: string) => [...text.trim().replace(/[\p{White_Space}\p{P}]/gu, "")];
  const expected = normalize(reference);
  const actual = normalize(hypothesis);
  if (!expected.length) return actual.length ? Infinity : 0;
  let previous = Array.from({ length: expected.length + 1 }, (_, index) => index);
  for (let row = 0; row < actual.length; row++) {
    const current = [row + 1];
    for (let column = 0; column < expected.length; column++) {
      current.push(
        Math.min(
          current[column]! + 1,
          previous[column + 1]! + 1,
          previous[column]! + (actual[row] === expected[column] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[expected.length]! / expected.length;
}

export async function runComparison(
  args: string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  print: (line: string) => void = console.log,
): Promise<number> {
  const { values } = (() => {
    try {
      return parseArgs({
        args,
        options: {
          file: { type: "string" },
          models: { type: "string", default: "whisper-1,gpt-4o-transcribe" },
          language: { type: "string", default: "ja" },
          reference: { type: "string" },
          "reference-file": { type: "string" },
          "base-url": { type: "string", default: "https://api.openai.com/v1" },
          vocab: { type: "string" },
          help: { type: "boolean" },
        },
        strict: true,
        allowPositionals: false,
      });
    } catch {
      throw new ComparisonInputError(
        "Invalid arguments; use --help. API keys are accepted only from the environment.",
      );
    }
  })();
  if (values.help) {
    print(USAGE);
    return 0;
  }
  if (!values.file?.trim())
    throw new ComparisonInputError("--file <audio path> is required; use --help.");
  if (values.reference !== undefined && values["reference-file"] !== undefined) {
    throw new ComparisonInputError("Choose either --reference or --reference-file.");
  }
  const models = values.models.split(",").map((model) => model.trim());
  if (models.some((model) => !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model))) {
    throw new ComparisonInputError("--models must be a comma-separated list of model ids.");
  }
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(values.language)) {
    throw new ComparisonInputError("--language must be a language code, such as ja.");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(values["base-url"]);
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error("invalid endpoint");
    }
  } catch {
    throw new ComparisonInputError(
      "--base-url must be an HTTP(S) URL without credentials, query or fragment.",
    );
  }
  const apiKey = (env.TRANSCRIBE_API_KEY ?? env.OPENAI_API_KEY)?.trim();
  if (!apiKey || /[\r\n\x00-\x1f\x7f]/.test(apiKey)) {
    throw new ComparisonInputError(
      "Set TRANSCRIBE_API_KEY (or OPENAI_API_KEY) to a valid key in the environment.",
    );
  }
  // Use the application's conservative upload cap before reading a potentially large recording.
  const info = await stat(values.file);
  if (!info.isFile()) throw new ComparisonInputError("--file must point to an audio file.");
  if (info.size > MAX_AUDIO_BYTES) {
    throw new ComparisonInputError(
      `Audio exceeds the ${MAX_AUDIO_BYTES}-byte upload limit for each selected model; compress or split the recording.`,
    );
  }
  const audio = new Uint8Array(await readFile(values.file));
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new ComparisonInputError(
      `Audio exceeds the ${MAX_AUDIO_BYTES}-byte upload limit; compress or split it.`,
    );
  }
  const reference = values["reference-file"]
    ? await readFile(values["reference-file"], "utf8")
    : values.reference;
  const safe = (text: string) =>
    text.replaceAll(apiKey, "[redacted]").replace(/sk-[\w-]+/g, "[redacted]");
  const host = safe(endpoint.host);
  print(`Sending audio to ${host} for transcription (${models.length} models).`);
  let failed = false;
  for (const modelId of models) {
    const started = performance.now();
    try {
      const result = await createCompatibleTranscriber({
        baseURL: endpoint.href.replace(/\/+$/, ""),
        apiKey,
        modelId,
        maxBytes: MAX_AUDIO_BYTES,
        vocabularyHint: values.vocab,
      }).transcribe(audio, { language: values.language });
      const latency = Math.round(performance.now() - started);
      const cer =
        reference === undefined ? "" : `\tCER=${characterErrorRate(reference, result.text)}`;
      const text = [...safe(result.text)].slice(0, 300).join("");
      print(
        `${safe(modelId)}\t${latency} ms\tsegments=${result.segments.length}\tduration=${result.durationSeconds} s${cer}\t${JSON.stringify(text)}`,
      );
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : "non-Error provider failure";
      print(
        `${safe(modelId)}\t${Math.round(performance.now() - started)} ms\tERROR: ${safe(message).replace(/[\r\n]/g, " ")}`,
      );
    }
  }
  print(`audio sent to ${host} for transcription`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runComparison(process.argv.slice(2));
  } catch (error) {
    // Never echo parser or filesystem errors: they may contain supplied arguments or private paths.
    console.error(
      error instanceof ComparisonInputError
        ? error.message
        : "Comparison could not read the audio/reference files. Check --help and the file paths.",
    );
    process.exitCode = 1;
  }
}
