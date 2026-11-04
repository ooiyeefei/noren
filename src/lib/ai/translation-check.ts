import {
  APICallError,
  generateText,
  jsonSchema,
  tool,
  type JSONSchema7,
  type LanguageModel,
} from "ai";

/**
 * The translation check: a second model compares a machine translation with the person's own
 * words and lists the claims the translation adds and the claims it leaves out. It runs through
 * one forced tool call, never a JSON response format, because the SGLang server behind our Modal
 * endpoint can loop on whitespace when asked for a json_schema response.
 */
export const CHECK_TOOL = "report_check";
export const CHECK_MAX_TOKENS = 1000;
export const CHECK_TIMEOUT_MS = 60_000;
const LIST_ITEMS = 5;
const ITEM_LENGTH = 200;

export type CheckReport = { faithful: boolean; added: string[]; missing: string[] };
export type CheckInput = {
  original: string;
  originalLang: string;
  translation: string;
  translationLang: string;
};
export interface TranslationChecker {
  check(input: CheckInput): Promise<CheckReport>;
}

const claimList: JSONSchema7 = {
  type: "array",
  maxItems: LIST_ITEMS,
  items: { type: "string", maxLength: ITEM_LENGTH },
};
export const CHECK_REPORT_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["faithful", "added", "missing"],
  properties: { faithful: { type: "boolean" }, added: claimList, missing: claimList },
};

/** The model answered, but not with a usable report. Not worth a retry: it would generate again. */
export class CheckOutputError extends Error {
  override name = "CheckOutputError";
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function checkPrompt(input: CheckInput): { system: string; prompt: string } {
  const lines = [
    "Reasoning strength: low",
    `You check a translation against the owner's original words. List each claim the translation adds that the original does not say, and each claim the original makes that the translation leaves out, once each. Japanese often leaves out subjects and pronouns, so supplying words like "my", "we" or "I" is not an addition. Do not judge style.`,
  ];
  if (input.translationLang === "ja" && input.originalLang !== "ja")
    lines.push(`Leaving such words out of the Japanese translation is not an omission either.`);
  return {
    system: lines.join("\n"),
    prompt: `Original (${languageName(input.originalLang)}):\n${input.original}\n\nTranslation (${languageName(input.translationLang)}):\n${input.translation}`,
  };
}

function cut(text: string): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, ITEM_LENGTH).join("");
}

/**
 * Reads the report_check arguments. A translation passes only when the checker says it is
 * faithful and lists nothing: a claim it lists is worth a person's look even if it said "faithful".
 */
export function parseCheckReport(input: unknown): CheckReport {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new CheckOutputError("the check's report is not JSON");
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new CheckOutputError("the check's report is not an object");
  const report = value as Record<string, unknown>;
  if (typeof report.faithful !== "boolean")
    throw new CheckOutputError("the check's report has no faithful verdict");
  const list = (key: "added" | "missing") => {
    const raw = report[key] ?? [];
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string"))
      throw new CheckOutputError(`the check's ${key} list is not a list of claims`);
    return [...new Set((raw as string[]).map(cut).filter(Boolean))].slice(0, LIST_ITEMS);
  };
  const added = list("added");
  const missing = list("missing");
  return { faithful: report.faithful && !added.length && !missing.length, added, missing };
}

export function createTranslationChecker(options: {
  model: LanguageModel;
  timeoutMs?: number;
}): TranslationChecker {
  return {
    async check(input) {
      const { system, prompt } = checkPrompt(input);
      const result = await generateText({
        model: options.model,
        system,
        prompt,
        tools: {
          [CHECK_TOOL]: tool({
            description: "Report the translation check.",
            inputSchema: jsonSchema<Record<string, unknown>>(CHECK_REPORT_SCHEMA),
          }),
        },
        toolChoice: { type: "tool", toolName: CHECK_TOOL },
        maxOutputTokens: CHECK_MAX_TOKENS,
        // A retry here would wait inside the action; the caller schedules retries instead.
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? CHECK_TIMEOUT_MS),
      });
      const call = result.toolCalls.find(({ toolName }) => toolName === CHECK_TOOL);
      if (!call) throw new CheckOutputError("the check returned no report");
      if (call.invalid) throw new CheckOutputError("the check's report did not match its schema");
      return parseCheckReport(call.input);
    },
  };
}

/**
 * "retry" for what clears up on its own: the endpoint waking from zero (503 "no upstreams
 * available"), a gateway error, a network failure or a timeout. Everything else, including every
 * 4xx and every answer that was not a usable report, is "fail": a retry would not change it.
 */
export function classifyCheckError(error: unknown): "retry" | "fail" {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === undefined) return "retry";
    return status === 502 || status === 503 || status === 504 ? "retry" : "fail";
  }
  if (error instanceof Error && ["AbortError", "TimeoutError", "TypeError"].includes(error.name))
    return "retry";
  return "fail";
}

/**
 * Name, HTTP status and a short message; never the request body, which holds the person's words.
 * The caller removes keys from it.
 */
export function describeCheckError(error: unknown): string {
  if (!(error instanceof Error)) return `NonError: ${String(error) || "unknown thrown value"}`;
  const status =
    APICallError.isInstance(error) && error.statusCode ? ` HTTP ${error.statusCode}` : "";
  const message = error.message.replace(/[\r\n\x00-\x1f\x7f]+/g, " ").trim() || "no message";
  return `${error.name || "Error"}${status}: ${message.slice(0, 200)}`;
}
