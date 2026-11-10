import { describe, expect, it, vi } from "vitest";
import { runSmoke, SMOKE_CAPABILITIES } from "../../scripts/ai-smoke.mjs";

const KEY = "sk-ant-mock-smoke-secret";
const env = { ANTHROPIC_API_KEY: KEY };

function message(
  text: string,
  usage = { input_tokens: 100, output_tokens: 20 },
  stop = "end_turn",
) {
  return () =>
    Response.json({
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text }],
      stop_reason: stop,
      stop_sequence: null,
      usage,
    });
}

async function smoke(
  args: string[],
  responses: (() => Response)[] = [],
  environment: Record<string, string | undefined> = env,
) {
  const lines: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  const code = await runSmoke(args, environment, (line) => lines.push(line), { fetch });
  return { code, fetch, output: lines.join("\n") };
}

describe("ai-smoke", () => {
  it("prints usage without needing a key or sending anything", async () => {
    const { code, fetch, output } = await smoke(["--help"], [], {});
    expect(code).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    for (const capability of SMOKE_CAPABILITIES) expect(output).toContain(capability);
    expect(output).toContain("--dry-run");
  });

  it("refuses unknown arguments, a missing capability or model, and a missing key by name", async () => {
    await expect(smoke(["--key", KEY])).rejects.toThrow("Invalid arguments");
    await expect(smoke(["--capability", "bogus", "--model", "claude-haiku-5-5"])).rejects.toThrow(
      "--capability must be one of",
    );
    await expect(smoke(["--capability", "check_story"])).rejects.toThrow("--model");
    const missing = await smoke(
      ["--capability", "check_story", "--model", "claude-haiku-5-5"],
      [],
      {},
    ).catch((caught: unknown) => caught);
    expect(missing).toEqual(new Error("AI is not configured: ANTHROPIC_API_KEY is not set"));
  });

  it("a dry run needs no key, shows the request and sends nothing", async () => {
    const { code, fetch, output } = await smoke(
      ["--capability", "check_story", "--model", "claude-haiku-5-5", "--dry-run"],
      [],
      {},
    );
    expect(code).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(output).toContain("POST https://api.anthropic.com/v1/messages");
    expect(output).toContain('"output_format":"json_schema"');
    expect(output).not.toContain("tool_choice");
    expect(output).toContain("DRY RUN check_story claude-haiku-5-5: nothing was sent.");
  });

  it("a dry run of a step that catches its own errors still sends nothing", async () => {
    for (const capability of ["translate", "write_story", "extract", "followup", "plan"]) {
      const { code, fetch, output } = await smoke(
        ["--capability", capability, "--model", "claude-sonnet-5-5", "--dry-run"],
        [],
        {},
      );
      expect(code, capability).toBe(0);
      expect(fetch, capability).not.toHaveBeenCalled();
      expect(output, capability).toContain("nothing was sent");
    }
  });

  it("passes when the story check gives the verdicts the fixture expects, and sums tokens", async () => {
    const { code, fetch, output } = await smoke(
      ["--capability", "check_story", "--model", "claude-haiku-5-5"],
      [
        message(JSON.stringify({ supported: true, added: [] })),
        message(JSON.stringify({ supported: false, added: ["the year 1952"] })),
      ],
    );
    expect(code).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(output).toMatch(
      /PASS check_story claude-haiku-5-5: 2\/2 case\(s\), \d+ ms, 2 call\(s\), tokens in=200 out=40/,
    );
    expect(output).not.toContain(KEY);
  });

  it("passes when the translation check gives the expected verdicts", async () => {
    const { code, output } = await smoke(
      ["--capability", "check_translation", "--model", "claude-sonnet-5-5"],
      [
        message(JSON.stringify({ faithful: true, added: [], missing: [] })),
        message(
          JSON.stringify({ faithful: false, added: ["best coffee shop"], missing: ["cash only"] }),
        ),
      ],
    );
    expect(code).toBe(0);
    expect(output).toContain("PASS check_translation claude-sonnet-5-5");
  });

  it("fails when a verdict differs from the fixture's", async () => {
    const { code, output } = await smoke(
      ["--capability", "check_story", "--model", "claude-haiku-5-5"],
      [
        message(JSON.stringify({ supported: true, added: [] })),
        message(JSON.stringify({ supported: true, added: [] })),
      ],
    );
    expect(code).toBe(1);
    expect(output).toContain("passed (expected fail)");
    expect(output).toContain("FAIL check_story claude-haiku-5-5: 1/2 case(s)");
  });

  it("fails on a refusal, a cut-off answer and an unreadable answer, never passing them", async () => {
    for (const [answer, finish] of [
      [JSON.stringify({ supported: true, added: [] }), "refusal"],
      [JSON.stringify({ supported: true, added: [] }), "max_tokens"],
      ["The sentence is fine.", "end_turn"],
    ] as const) {
      const { code, output } = await smoke(
        ["--capability", "check_story", "--model", "claude-haiku-5-5"],
        [message(answer, undefined, finish), message(answer, undefined, finish)],
      );
      expect(code, finish).toBe(1);
      expect(output, finish).toContain("CheckOutputError");
      expect(output, finish).toMatch(/FAIL check_story/);
    }
  });

  it("fails on an HTTP error without printing the key, even if the provider echoes it", async () => {
    const { code, output } = await smoke(
      ["--capability", "check_story", "--model", "claude-haiku-5-5"],
      [
        () =>
          Response.json(
            { type: "error", error: { type: "authentication_error", message: `bad key ${KEY}` } },
            { status: 401 },
          ),
        () =>
          Response.json(
            { type: "error", error: { type: "authentication_error", message: `bad key ${KEY}` } },
            { status: 401 },
          ),
      ],
    );
    expect(code).toBe(1);
    expect(output).toContain("HTTP 401");
    expect(output).toContain("[redacted]");
    expect(output).not.toContain(KEY);
  });
});
