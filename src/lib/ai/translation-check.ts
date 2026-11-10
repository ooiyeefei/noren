import {
  APICallError,
  generateText,
  jsonSchema,
  NoObjectGeneratedError,
  Output,
  tool,
  type JSONSchema7,
  type LanguageModel,
} from "ai";
import type { ReportMode } from "./config";

/**
 * The translation check: a second model compares a machine translation with the person's own
 * words and lists the claims the translation adds and the claims it leaves out. Except for Claude
 * (see generateReport), it runs through one forced tool call, never a JSON response format, because
 * the SGLang server behind our Modal endpoint can loop on whitespace when asked for a json_schema
 * response.
 */
export const CHECK_TOOL = "report_check";
/**
 * The model reasons before it answers, and its reasoning counts against this limit. At 1,000 a hard
 * pair of texts ran out before the report (finish_reason "length"), so the translations most worth a
 * look went unchecked. Those took 890 to 1,450 tokens; at about 140 a second, 3,000 fits the timeout.
 */
export const CHECK_MAX_TOKENS = 3000;
/**
 * Claude thinks before it answers whatever the call, Claude Sonnet 5.5 cannot be told not to, and the
 * thinking counts against max_tokens even when it is not returned. This leaves room for it at the
 * default effort. A check that still runs out stops as unreadable and fails; it never passes.
 */
export const CHECK_MAX_TOKENS_NATIVE = 16_000;
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

/**
 * Asks a Claude model for a report as native structured output (Output.object, sent as
 * output_config.format) instead of a forced tool call, and returns the parsed JSON for the caller to
 * read with its own parse function. A check fails closed: a refusal, a stop at max_tokens or at
 * anything but a finished answer, text that is not JSON and an answer that does not fit the schema
 * all throw CheckOutputError, so none of them can count as a pass. The schema's limits (list
 * lengths, claim lengths) are for the model's guidance: Anthropic drops them from the schema it
 * enforces, and the caller's parse function applies them.
 */
export async function generateReport(options: {
  model: LanguageModel;
  system: string;
  prompt: string;
  schema: JSONSchema7;
  /** What was asked for, in the words of an error message: "the check", "the story check". */
  label: string;
  timeoutMs?: number;
}): Promise<unknown> {
  let result;
  try {
    result = await generateText({
      model: options.model,
      system: options.system,
      prompt: options.prompt,
      output: Output.object({ schema: jsonSchema<Record<string, unknown>>(options.schema) }),
      maxOutputTokens: CHECK_MAX_TOKENS_NATIVE,
      // A retry here would wait inside the action; the caller schedules retries instead.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error))
      throw new CheckOutputError(
        `${options.label} returned a report that could not be read (finish reason ${error.finishReason})`,
      );
    throw error;
  }
  // Only "stop" is a finished answer. "content-filter" is a refusal, "length" ran out of tokens.
  if (result.finishReason !== "stop")
    throw new CheckOutputError(
      `${options.label} did not finish its report (finish reason ${result.finishReason})`,
    );
  return result.output;
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
  /** How the report is asked for (see reportMode); a forced tool call unless set. */
  reportMode?: ReportMode;
}): TranslationChecker {
  return {
    async check(input) {
      const { system, prompt } = checkPrompt(input);
      if (options.reportMode === "native")
        return parseCheckReport(
          await generateReport({
            model: options.model,
            system,
            prompt,
            schema: CHECK_REPORT_SCHEMA,
            label: "the check",
            timeoutMs: options.timeoutMs,
          }),
        );
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
 * available"), a gateway error, Anthropic's 529 "overloaded", a network failure or a timeout.
 * Everything else, including every 4xx and every answer that was not a usable report, is "fail": a
 * retry would not change it.
 */
export function classifyCheckError(error: unknown): "retry" | "fail" {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === undefined) return "retry";
    return status === 502 || status === 503 || status === 504 || status === 529 ? "retry" : "fail";
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
