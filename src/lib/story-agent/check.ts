import { generateText, jsonSchema, tool, type JSONSchema7, type LanguageModel } from "ai";
import { CheckOutputError, CHECK_MAX_TOKENS, CHECK_TIMEOUT_MS } from "../ai/translation-check";

/**
 * The story agent's second reader: a different model compares one sentence with only the words it
 * cites, and lists what the sentence says that those words don't. It goes through one forced tool
 * call for the same reason as the translation check: the server behind our Modal endpoint can loop on
 * a json_schema response.
 */
export const STORY_CHECK_TOOL = "report_support";
const LIST_ITEMS = 5;
const ITEM_LENGTH = 200;

export type SentenceReport = { supported: boolean; added: string[] };
export type SentenceInput = { en: string; ja: string; words: readonly string[] };
export interface StoryChecker {
  check(input: SentenceInput): Promise<SentenceReport>;
  /** Fails with an error classifyCheckError calls "retry" while the endpoint is asleep. */
  wake(): Promise<void>;
}

const REPORT_SCHEMA: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: ["supported", "added"],
  properties: {
    supported: { type: "boolean" },
    added: {
      type: "array",
      maxItems: LIST_ITEMS,
      items: { type: "string", maxLength: ITEM_LENGTH },
    },
  },
};

export function storyCheckPrompt(input: SentenceInput): { system: string; prompt: string } {
  return {
    system: [
      "Reasoning strength: low",
      `You check one sentence from a story about a place against the exact words people wrote, which are the only evidence. List each thing the sentence states that the words do not support, once each.
Look hardest for these: something the words only report as heard (そうです, らしい, と聞いた, "I heard") stated as plain fact; one person's experience stated as everyone's; a date, number, name, cause or place the words don't contain.
Saying who said it ("a reviewer says", "one visitor") is not an addition, and neither is supplying a subject Japanese leaves out. Leaving things out is fine: the sentence is a summary. Do not judge style.`,
    ].join("\n"),
    prompt: `Sentence (English):\n${input.en}\n\nSentence (Japanese):\n${input.ja}\n\nThe words it cites:\n${input.words.map((words) => `- ${words}`).join("\n")}`,
  };
}

/** A sentence passes only when the checker says so and lists nothing. */
export function parseSentenceReport(input: unknown): SentenceReport {
  const report = input as { supported?: unknown; added?: unknown } | null;
  if (typeof report !== "object" || report === null || typeof report.supported !== "boolean")
    throw new CheckOutputError("the story check's report has no verdict");
  const raw = report.added ?? [];
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string"))
    throw new CheckOutputError("the story check's list is not a list of claims");
  const added = [
    ...new Set(
      (raw as string[]).map((item) =>
        Array.from(item.replace(/\s+/g, " ").trim()).slice(0, ITEM_LENGTH).join(""),
      ),
    ),
  ]
    .filter(Boolean)
    .slice(0, LIST_ITEMS);
  return { supported: report.supported && added.length === 0, added };
}

export function createStoryChecker(options: {
  model: LanguageModel;
  timeoutMs?: number;
}): StoryChecker {
  return {
    async check(input) {
      const { system, prompt } = storyCheckPrompt(input);
      const result = await generateText({
        model: options.model,
        system,
        prompt,
        tools: {
          [STORY_CHECK_TOOL]: tool({
            description: "Report the sentence check.",
            inputSchema: jsonSchema<Record<string, unknown>>(REPORT_SCHEMA),
          }),
        },
        toolChoice: { type: "tool", toolName: STORY_CHECK_TOOL },
        maxOutputTokens: CHECK_MAX_TOKENS,
        // A retry here would wait inside the action; the caller schedules retries instead.
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? CHECK_TIMEOUT_MS),
      });
      const call = result.toolCalls.find(({ toolName }) => toolName === STORY_CHECK_TOOL);
      if (!call) throw new CheckOutputError("the story check returned no report");
      if (call.invalid)
        throw new CheckOutputError("the story check's report did not match its schema");
      return parseSentenceReport(call.input);
    },
    async wake() {
      await generateText({
        model: options.model,
        prompt: "Reply with OK.",
        maxOutputTokens: 16,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? CHECK_TIMEOUT_MS),
      });
    },
  };
}
