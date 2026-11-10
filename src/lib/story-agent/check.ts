import { generateText, jsonSchema, tool, type JSONSchema7, type LanguageModel } from "ai";
import type { ReportMode } from "../ai/config";
import {
  CheckOutputError,
  CHECK_MAX_TOKENS,
  CHECK_TIMEOUT_MS,
  generateReport,
} from "../ai/translation-check";

/**
 * The story agent's second reader: a different model compares one sentence with only the words it
 * cites, and lists what the sentence says that those words don't. Except for Claude (see
 * generateReport) it goes through one forced tool call for the same reason as the translation check:
 * the server behind our Modal endpoint can loop on a json_schema response.
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
      `You are the last check on one sentence from a story about a place. You get the sentence and the exact words people wrote, which are the only evidence. Report whether a reader of the sentence would come away believing something those words don't say.

Only these count:
1. Hearsay made fact: the words only report something as heard (そうです, らしい, と聞いた, "I heard"), and the sentence states it plainly, with nothing like "heard" or "is said to".
2. One person's experience made everyone's: "I waited an hour" becoming "the wait is an hour".
3. Something invented: a date, number, name, cause or place the words don't contain.
4. Something changed: the sentence says a different thing from the words.

These are always fine, so never list them:
- Saying who said it and how many: "a reviewer says", "one visitor", "two blogs agree", "according to a post". The words came from those people.
- Naming the place or saying what it is. All the words are about this place, even when they don't name it.
- Supplying a subject or object Japanese leaves out, such as the shop or the person.
- Tense, ordinary paraphrase and word choice, such as 大将 as owner or chef, or an era year as a Western year.
- Joining what the words say the way they plainly read, with "so" or "because".
- Leaving things out, and style.

Examples:
Words: プリンは箸で食べるデザートでした
"You eat the pudding here with chopsticks, one visitor says." supported: true, added: []
Words: 地図を見て来る外国人が多く、大将が英語のメニューを作っていました
"So many foreigners find it on the map that the owner made an English menu, a reviewer writes." supported: true, added: []
Words: 地元の画家が通った店だそうです
"A local painter used to come here." supported: false, added: ["stated as fact, but the words only report it as heard"]
Words: 一時間待ちました
"There is always a one hour wait." supported: false, added: ["one person's wait stated as always"]
Words: 大正14年創業
"The owner's grandfather founded it in 1925." supported: false, added: ["the owner's grandfather"]

Most sentences pass. If you aren't sure, it passes.`,
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
  /** How the report is asked for (see reportMode); a forced tool call unless set. */
  reportMode?: ReportMode;
}): StoryChecker {
  return {
    async check(input) {
      const { system, prompt } = storyCheckPrompt(input);
      if (options.reportMode === "native")
        return parseSentenceReport(
          await generateReport({
            model: options.model,
            system,
            prompt,
            schema: REPORT_SCHEMA,
            label: "the story check",
            timeoutMs: options.timeoutMs,
          }),
        );
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
