import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway, wrapLanguageModel, type LanguageModel } from "ai";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createClaimExtractor, createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig, reportMode, toolStep, type AiModelConfig } from "../src/lib/ai/config";
import { createFollowUpAgent } from "../src/lib/ai/follow-ups";
import { runPlanner } from "../src/lib/planner/agent";
import { resolveReply } from "../src/lib/planner/resolve";
import { createMeta } from "../src/lib/ai/meta";
import { createModal } from "../src/lib/ai/modal";
import { createTranslationChecker, describeCheckError } from "../src/lib/ai/translation-check";
import { createTranslator } from "../src/lib/ai/translator";
import { createNoteDrafter } from "../src/lib/link-read/draft";
import { activeRegionConfig } from "../src/lib/region/registry";
import { createStoryChecker } from "../src/lib/story-agent/check";
import { createStoryWriter, verifyStory } from "../src/lib/story-agent/story";
import { fakePlannerData, NOW, ORIGIN } from "../tests/fixtures/planner";
import { createMentionChecker } from "../src/lib/story-finder/check";

/**
 * One tiny built-in fixture through one AI step and one model, to see that the step works with it
 * before the setting is switched. Everything sent is fictional text written in this file.
 */
export const SMOKE_CAPABILITIES = [
  "check_story",
  "check_translation",
  "translate",
  "check_mention",
  "write_story",
  "extract",
  "followup",
  "plan",
] as const;
type SmokeCapability = (typeof SMOKE_CAPABILITIES)[number];

const USAGE = `Usage: npx tsx scripts/ai-smoke.mts --capability <name> --model <setting> [--dry-run]

  --capability <name>   ${SMOKE_CAPABILITIES.join(" | ")}
  --model <setting>     What AI_MODEL_<CAPABILITY> would hold: claude-haiku-5-5, claude-sonnet-5-5,
                        meta:<model>, modal:<model> or <vendor>/<model> (gateway)
  --dry-run             Print the request the first call would send and send nothing; needs no key
  --help                Print usage

The key comes from the environment only, as in production: ANTHROPIC_API_KEY for a claude-* model,
META_API_KEY for meta:, MODAL_PROXY_TOKEN and MODAL_BASE_URL for modal:, AI_GATEWAY_API_KEY for a
gateway model. It is never printed. A run sends a handful of short requests with made-up text to
the provider the setting names, and is billed by that provider.
The result is PASS or FAIL, then the latency and the tokens used. A check that is given a sentence it
should fail, or one it should pass, FAILs when its verdict differs from the fixture's.`;

class SmokeInputError extends Error {}
/** Thrown by the dry run's fetch after it has printed the request, so nothing is sent. */
class DryRunStop extends Error {
  override name = "DryRunStop";
}

type Outcome = { ok: boolean; detail: string };
type SmokeCase = {
  name: string;
  run(model: LanguageModel, config: AiModelConfig): Promise<Outcome>;
};

// Fictional shop; the Japanese words are what a reviewer "wrote".
const PLACE = {
  names: [
    { lang: "en", value: "Test Kissa" },
    { lang: "ja", value: "テスト喫茶" },
  ],
  category: "cafe",
};
const POSTS = [
  {
    id: "smoke-1",
    platform: "google_reviews",
    text: "二階の窓から港を出る船が見えます。店主の祖父が屋台から始めた店だそうです。",
  },
  {
    id: "smoke-2",
    platform: "web",
    title: "架空の町の喫茶店めぐり",
    text: "テスト喫茶のおじいさんは、携帯の充電を快くさせてくれました。",
  },
];
const ORIGINAL = "この店は祖母が昭和の終わりに始めました。お支払いは現金だけです。";
const FAITHFUL = "My grandmother started this shop at the end of the Showa era. We only take cash.";
const UNFAITHFUL =
  "My grandmother started this shop, the best coffee shop in Nagasaki, at the end of the Showa era.";
const TRANSCRIPT = "うちの店は祖母が昭和の終わりに始めました。お支払いは現金だけです。";

type Verdict = { holds: boolean; added: string[] };

function verdictCase(
  name: string,
  expected: boolean,
  check: (model: LanguageModel, config: AiModelConfig) => Promise<Verdict>,
): SmokeCase {
  return {
    name,
    async run(model, config) {
      const verdict = await check(model, config);
      return {
        ok: verdict.holds === expected,
        detail: `${verdict.holds ? "passed" : "failed"} (expected ${expected ? "pass" : "fail"})${
          verdict.added.length ? `, found ${JSON.stringify(verdict.added)}` : ""
        }`,
      };
    },
  };
}

const storyCheck =
  (en: string, ja: string, words: string[]) =>
  async (model: LanguageModel, config: AiModelConfig): Promise<Verdict> => {
    const report = await createStoryChecker({ model, reportMode: reportMode(config) }).check({
      en,
      ja,
      words,
    });
    return { holds: report.supported, added: report.added };
  };

const translationCheck =
  (translation: string) =>
  async (model: LanguageModel, config: AiModelConfig): Promise<Verdict> => {
    const report = await createTranslationChecker({ model, reportMode: reportMode(config) }).check({
      original: ORIGINAL,
      originalLang: "ja",
      translation,
      translationLang: "en",
    });
    return { holds: report.faithful, added: [...report.added, ...report.missing] };
  };

const CASES: Record<SmokeCapability, (modelSetting: string) => SmokeCase[]> = {
  check_story: () => [
    verdictCase(
      "a sentence the cited words support",
      true,
      storyCheck(
        "From an upstairs window you can watch ships leave the harbour, one reviewer says.",
        "二階の窓から港を出る船が見えると、あるレビューは言います。",
        ["二階の窓から港を出る船が見えます"],
      ),
    ),
    verdictCase(
      "a sentence with an invented year",
      false,
      storyCheck(
        "The owner's grandfather started it as a street stall in 1952, a reviewer says.",
        "オーナーの祖父が1952年に屋台として始めたと、あるレビューは言います。",
        ["店主の祖父が屋台から始めた店だそうです"],
      ),
    ),
  ],
  check_translation: () => [
    verdictCase("a faithful translation", true, translationCheck(FAITHFUL)),
    verdictCase(
      "a translation that adds a claim and drops one",
      false,
      translationCheck(UNFAITHFUL),
    ),
  ],
  translate: (modelSetting) => [
    {
      name: "one statement, Japanese to English",
      async run(model) {
        const result = await createTranslator({ model, modelVersion: modelSetting }).translate(
          [{ itemId: "smoke", text: ORIGINAL }],
          { from: "ja", to: "en", glossary: { テスト喫茶: "Test Kissa" }, inputKind: "claim" },
        );
        if (!result.ok) return { ok: false, detail: `refused: ${result.reason}` };
        const text = result.items[0]?.text.trim() ?? "";
        return {
          ok: result.items.length === 1 && text.length > 0,
          detail: `${result.items.length} item(s): ${JSON.stringify(text.slice(0, 160))}`,
        };
      },
    },
  ],
  check_mention: () => [
    {
      name: "a made-up review that tells a story about the owner",
      async run(model, config) {
        const reported = await createMentionChecker({
          model,
          ...toolStep(config, 8000),
        }).check({
          place: PLACE,
          post: { platform: "google_reviews", text: POSTS[1]!.text, title: POSTS[1]!.title },
        });
        return {
          ok: true,
          detail: `readable report: about=${reported.aboutThisPlace} kind=${reported.kind}`,
        };
      },
    },
  ],
  write_story: () => [
    {
      name: "a story from two made-up posts",
      async run(model, config) {
        const reported = await createStoryWriter({ model, ...toolStep(config, 16_000) }).write({
          place: PLACE,
          posts: POSTS,
        });
        const { sentences, problems } = verifyStory(POSTS, reported);
        return {
          ok: true,
          detail: `readable report: ${reported.sentences.length} sentence(s), ${sentences.length} kept by the citation check, ${problems.length} problem(s)`,
        };
      },
    },
    {
      name: "a member's line drafted from their own made-up post",
      async run(model) {
        const draft = await createNoteDrafter({ model }).draft({
          placeName: "Test Kissa",
          lang: "en",
          title: POSTS[1]!.title,
          text: POSTS[1]!.text,
        });
        return {
          ok: draft.note !== null,
          detail: draft.note
            ? JSON.stringify(draft.note.slice(0, 160))
            : `no draft: ${draft.failure}`,
        };
      },
    },
  ],
  extract: () => [
    {
      name: "two statements from a made-up transcript",
      async run(model) {
        const claims = await createClaimExtractor({ model }).extract(TRANSCRIPT, {
          regionConfig: activeRegionConfig(),
        });
        return { ok: true, detail: `${claims.length} claim(s) kept by the quote check` };
      },
    },
  ],
  plan: () => [
    {
      name: "a three-stop walk over made-up places, with every quote checked against the tools",
      async run(model, config) {
        const { data } = fakePlannerData();
        const region = activeRegionConfig();
        const request = {
          turns: [{ role: "user" as const, text: "Three stops near Shinchi. I like history." }],
          memory: { avoid: [], interests: [], done: [] },
          start: { kind: "neighbourhood" as const, id: "shinchi" },
          language: "en" as const,
        };
        const run = await runPlanner(
          request,
          {
            data,
            region,
            origin: ORIGIN,
            now: () => NOW,
            locale: "en",
            memory: request.memory,
            start: request.start,
          },
          {
            model,
            ...(toolStep(config, 8000).maxOutputTokens === undefined
              ? {}
              : { maxOutputTokens: 8000 }),
          },
        );
        if (run.modelFailed) return { ok: false, detail: "the model call failed" };
        const reply = resolveReply({ submit: run.submit, ledger: run.ledger, request, region });
        const stops = reply.walk?.stops ?? [];
        const quotes = stops.reduce((sum, stop) => sum + stop.quotes.length, 0);
        return {
          ok: run.submit !== null && reply.state === "ai" && stops.length > 0,
          detail: `${run.submit === null ? "no usable submit_plan" : `state ${reply.state}`}, ${stops.length} stop(s), ${quotes} quote(s) shown, ${reply.leftOut} left out, intro ${reply.intro === null ? "dropped" : "kept"}`,
        };
      },
    },
  ],
  followup: () => [
    {
      name: "questions for a made-up transcript",
      async run(model) {
        const questions = await createFollowUpAgent({ model }).suggest({
          transcript: TRANSCRIPT,
          language: "ja",
          readerLanguage: "en",
          recorded: [],
          region: activeRegionConfig(),
        });
        return { ok: true, detail: `${questions.length} question(s) kept` };
      },
    },
  ],
};

const KEY_VARIABLES = [
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_API_KEY",
  "META_API_KEY",
  "MODAL_PROXY_TOKEN",
] as const;

/** A dry run needs no real key: the setting only has to resolve to a provider. */
function withPlaceholderKeys(env: Readonly<Record<string, string | undefined>>) {
  return {
    ...env,
    ...Object.fromEntries(KEY_VARIABLES.map((name) => [name, env[name]?.trim() || "dry-run"])),
    MODAL_BASE_URL: env.MODAL_BASE_URL?.trim() || "https://dry-run.invalid",
  };
}

const BODY_FIELDS = [
  "model",
  "max_tokens",
  "max_completion_tokens",
  "temperature",
  "top_p",
  "top_k",
  "thinking",
  "reasoning_effort",
  "tool_choice",
] as const;

/** The parts of a request that decide whether a provider accepts it; never the headers or the text. */
function describeRequest(url: URL, init: RequestInit | undefined): string {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  } catch {
    // Not JSON: describe the URL alone.
  }
  type Named = { name?: string; function?: { name?: string } };
  const tools = Array.isArray(body.tools)
    ? (body.tools as Named[]).map((tool) => tool.name ?? tool.function?.name)
    : undefined;
  const outputConfig = body.output_config as
    { effort?: string; format?: { type?: string } } | undefined;
  const responseFormat = body.response_format as { type?: string } | undefined;
  const summary = {
    ...Object.fromEntries(BODY_FIELDS.filter((field) => field in body).map((f) => [f, body[f]])),
    ...(tools ? { tools } : {}),
    ...(outputConfig
      ? { effort: outputConfig.effort, output_format: outputConfig.format?.type }
      : {}),
    ...(responseFormat ? { response_format: responseFormat.type } : {}),
  };
  return `${init?.method ?? "POST"} ${url.origin}${url.pathname} ${JSON.stringify(summary)}`;
}

export type SmokeDeps = { fetch?: typeof globalThis.fetch };

export async function runSmoke(
  args: string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  print: (line: string) => void = console.log,
  deps: SmokeDeps = {},
): Promise<number> {
  const { values } = (() => {
    try {
      return parseArgs({
        args,
        options: {
          capability: { type: "string" },
          model: { type: "string" },
          "dry-run": { type: "boolean" },
          help: { type: "boolean" },
        },
        strict: true,
        allowPositionals: false,
      });
    } catch {
      throw new SmokeInputError(
        "Invalid arguments; use --help. Keys are read from the environment only.",
      );
    }
  })();
  if (values.help) {
    print(USAGE);
    return 0;
  }
  const capability = SMOKE_CAPABILITIES.find((name) => name === values.capability);
  if (!capability)
    throw new SmokeInputError(`--capability must be one of: ${SMOKE_CAPABILITIES.join(", ")}.`);
  const setting = values.model?.trim();
  if (!setting) throw new SmokeInputError("--model <setting> is required; use --help.");
  const dryRun = values["dry-run"] === true;

  const variable = `AI_MODEL_${capability.toUpperCase()}`;
  const config = aiConfig(capability, {
    ...(dryRun ? withPlaceholderKeys(env) : env),
    [variable]: setting,
  });
  if (!config.ok) throw new SmokeInputError(config.reason);

  // Nothing printed may carry a key, even one that came back inside a provider's error message.
  const secrets = KEY_VARIABLES.map((name) => env[name]?.trim()).filter(Boolean) as string[];
  const safe = (text: string) =>
    secrets.reduce((out, key) => out.replaceAll(key, "[redacted]"), text);
  const say = (line: string) => print(safe(line));

  // Some steps catch an error and report their own, so the dry run counts the requests it stopped.
  let stopped = 0;
  const send: typeof globalThis.fetch = dryRun
    ? async (input, init) => {
        if (stopped++ === 0) {
          const url = new URL(
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          );
          say(`request: ${describeRequest(url, init)}`);
        }
        throw new DryRunStop("dry run: nothing was sent");
      }
    : (deps.fetch ?? globalThis.fetch);
  const bare = createLanguageModel(config.config, {
    anthropic: (options) => createAnthropic({ ...options, fetch: send }),
    gateway: (options) => createGateway({ ...options, fetch: send }),
    meta: (options) => createMeta({ ...options, fetch: send }),
    modal: (options) => createModal({ ...options, fetch: send }),
  });
  if (typeof bare === "string") throw new SmokeInputError("the setting did not resolve to a model");
  const meter = { calls: 0, input: 0, output: 0, reasoning: 0 };
  const model = wrapLanguageModel({
    model: bare,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate();
        meter.calls += 1;
        meter.input += result.usage.inputTokens.total ?? 0;
        meter.output += result.usage.outputTokens.total ?? 0;
        meter.reasoning += result.usage.outputTokens.reasoning ?? 0;
        return result;
      },
    },
  });

  const cases = CASES[capability](setting);
  say(
    `${dryRun ? "Dry run of" : "Running"} ${capability} on ${config.config.provider}:${config.config.modelId}, ${cases.length} case(s).`,
  );
  let failures = 0;
  const started = performance.now();
  for (const [index, smokeCase] of cases.entries()) {
    const before = { ...meter };
    const stoppedBefore = stopped;
    const caseStarted = performance.now();
    const label = `[${index + 1}/${cases.length}] ${smokeCase.name}`;
    const took = () => `${Math.round(performance.now() - caseStarted)} ms`;
    let outcome: Outcome;
    try {
      outcome = await smokeCase.run(model, config.config);
    } catch (error) {
      // Name, status and a short message only: never the request body.
      outcome = { ok: false, detail: describeCheckError(error) };
    }
    if (dryRun && stopped > stoppedBefore) {
      say(`${label}: not sent`);
      continue;
    }
    if (!outcome.ok) failures += 1;
    say(
      `${label}: ${outcome.ok ? "ok" : "FAIL"} - ${outcome.detail} (${took()}, in=${meter.input - before.input} out=${meter.output - before.output})`,
    );
  }
  if (dryRun && stopped > 0 && failures === 0) {
    say(`DRY RUN ${capability} ${setting}: nothing was sent.`);
    return 0;
  }
  say(
    `${failures === 0 ? "PASS" : "FAIL"} ${capability} ${setting}: ${cases.length - failures}/${cases.length} case(s), ${Math.round(performance.now() - started)} ms, ${meter.calls} call(s), tokens in=${meter.input} out=${meter.output}${meter.reasoning ? ` (reasoning ${meter.reasoning})` : ""}`,
  );
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runSmoke(process.argv.slice(2));
  } catch (error) {
    // Never echo more than the message of an input error: the rest could carry arguments.
    console.error(
      error instanceof SmokeInputError ? error.message : "The smoke run could not start.",
    );
    process.exitCode = 1;
  }
}
