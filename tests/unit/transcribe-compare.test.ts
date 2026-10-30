import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { characterErrorRate, runComparison } from "../../scripts/transcribe-compare.mjs";

const files = vi.hoisted(() => ({ stat: vi.fn(), readFile: vi.fn() }));
vi.mock("node:fs/promises", () => files);

describe("characterErrorRate", () => {
  it.each([
    ["同じ文", "同じ文", 0],
    ["あいうえおかきくけこ", "あいうえおかきくけさ", 0.1],
    ["長崎の町", "", 1],
    [" 長崎、へ。\n行く！ ", "長崎へ行く", 0],
    ["長崎へ行く", "長崎に行く", 0.2],
    ["あ😀い", "あ😃い", 1 / 3],
    ["𠮷野家", "吉野家", 1 / 3],
    ["😀", "😀😀", 1],
    ["abc", "ac", 1 / 3],
    ["a", "aaa", 2],
    ["", "", 0],
    ["。 ", "あ", Infinity],
  ])("CER(%j, %j) = %s", (reference, hypothesis, expected) => {
    expect(characterErrorRate(reference, hypothesis)).toBe(expected);
  });
});

describe("transcribe comparison CLI", () => {
  const env = { TRANSCRIBE_API_KEY: "sk-test-1234567890" };
  let request: ReturnType<typeof vi.fn<typeof fetch>>;
  let print: ReturnType<typeof vi.fn<(line: string) => void>>;
  beforeEach(() => {
    files.stat.mockReset().mockResolvedValue({ size: 1, isFile: () => true });
    files.readFile.mockReset().mockResolvedValue(new Uint8Array([1]));
    print = vi.fn();
    // All calls exercise the real SDK and adapter; the transport never uses the network.
    request = vi.fn<typeof fetch>(async () =>
      Response.json({ text: "架空のテスト", duration: 2.5 }),
    );
    vi.stubGlobal("fetch", request);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("help has no key, file access, or HTTP requirement", async () => {
    expect(await runComparison(["--help"], {}, print)).toBe(0);
    expect(print).toHaveBeenCalledWith(expect.stringContaining("Usage: npx tsx"));
    expect(print).toHaveBeenCalledWith(expect.stringContaining("--reference-file"));
    expect(files.stat).not.toHaveBeenCalled();
    expect(files.readFile).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it("compares both default models through the real adapter and reports CER and upload host", async () => {
    expect(
      await runComparison(["--file", "mock.wav", "--reference", "架空のテスト"], env, print),
    ).toBe(0);
    expect(request).toHaveBeenCalledTimes(2);
    const formats = request.mock.calls.map(([, init]) => {
      if (!(init?.body instanceof FormData)) throw new Error("expected multipart body");
      expect(init.body.get("language")).toBe("ja");
      return [init.body.get("model"), init.body.get("response_format")];
    });
    expect(formats).toEqual([
      ["whisper-1", "verbose_json"],
      ["gpt-4o-transcribe", "json"],
    ]);
    const lines = print.mock.calls.map(([line]) => line);
    expect(lines[0]).toBe("Sending audio to api.openai.com for transcription (2 models).");
    for (const model of ["whisper-1", "gpt-4o-transcribe"]) {
      expect(lines).toContainEqual(
        expect.stringMatching(
          new RegExp(`^${model}\\t\\d+ ms\\tsegments=1\\tduration=2.5 s\\tCER=0\\t`),
        ),
      );
    }
    expect(lines.at(-1)).toBe("audio sent to api.openai.com for transcription");
    expect(lines.join("\n")).not.toContain(env.TRANSCRIBE_API_KEY);
  });
  it("supports a reference file, custom models, endpoint, language and vocabulary", async () => {
    files.readFile.mockImplementation(async (_path, encoding) =>
      encoding === "utf8" ? "架空のテスト" : new Uint8Array([1]),
    );
    const args = [
      "--file",
      "mock.mp3",
      "--reference-file",
      "mock.txt",
      "--models",
      " whisper-large-v3 ",
      "--base-url",
      "http://localhost:8080/v1/",
      "--language",
      "en",
      "--vocab",
      "架空テスト店",
    ];
    expect(await runComparison(args, env, print)).toBe(0);
    expect(files.readFile).toHaveBeenCalledWith("mock.txt", "utf8");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0]).toBe("http://localhost:8080/v1/audio/transcriptions");
    const form = request.mock.calls[0]![1]?.body;
    if (!(form instanceof FormData)) throw new Error("expected multipart body");
    expect(form.get("language")).toBe("en");
    expect(form.get("prompt")).toBe("架空テスト店");
    expect(print).toHaveBeenLastCalledWith("audio sent to localhost:8080 for transcription");
  });
  it("uses OPENAI_API_KEY only when TRANSCRIBE_API_KEY is unset", async () => {
    const fallback = { OPENAI_API_KEY: "sk-fallback-test" };
    await runComparison(["--file", "mock.wav", "--models", "whisper-1"], fallback, print);
    expect(new Headers(request.mock.calls[0]![1]?.headers).get("authorization")).toBe(
      `Bearer ${fallback.OPENAI_API_KEY}`,
    );
    request.mockClear();
    await runComparison(
      ["--file", "mock.wav", "--models", "whisper-1"],
      { ...env, ...fallback },
      print,
    );
    expect(new Headers(request.mock.calls[0]![1]?.headers).get("authorization")).toBe(
      `Bearer ${env.TRANSCRIBE_API_KEY}`,
    );
    await expect(
      runComparison(["--file", "mock.wav"], { ...fallback, TRANSCRIBE_API_KEY: "" }, print),
    ).rejects.toThrow("Set TRANSCRIBE_API_KEY");
    expect(JSON.stringify(print.mock.calls)).not.toMatch(/sk-test-1234567890|sk-fallback-test/);
  });
  it("refuses an oversized recording before reading it or making an HTTP request", async () => {
    files.stat.mockResolvedValue({ size: 24_000_001, isFile: () => true });
    await expect(runComparison(["--file", "big.wav"], env, print)).rejects.toThrow(
      "24000000-byte upload limit",
    );
    expect(files.readFile).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
  });
  it("also checks actual byte length if the file grows after stat", async () => {
    files.readFile.mockResolvedValue(new Uint8Array(24_000_001));
    await expect(runComparison(["--file", "big.wav"], env, print)).rejects.toThrow(
      "24000000-byte upload limit",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("accepts the size boundary and prints no CER when no reference is provided", async () => {
    files.stat.mockResolvedValue({ size: 24_000_000, isFile: () => true });
    expect(await runComparison(["--file", "mock.wav", "--models", "whisper-1"], env, print)).toBe(
      0,
    );
    expect(JSON.stringify(print.mock.calls)).not.toContain("CER=");
  });
  it("continues after one model fails, with a safe provider reason and nonzero exit status", async () => {
    request.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            type: "invalid_request_error",
            message: `format unsupported ${env.TRANSCRIBE_API_KEY}`,
          },
        },
        { status: 400 },
      ),
    );
    expect(await runComparison(["--file", "mock.wav"], env, print)).toBe(1);
    const output = print.mock.calls.map(([line]) => line).join("\n");
    expect(output).toContain("HTTP 400");
    expect(output).toContain("format unsupported [redacted]");
    expect(output).toMatch(/gpt-4o-transcribe\t\d+ ms\tsegments=1/);
    expect(output).not.toContain(env.TRANSCRIBE_API_KEY);
    expect(print).toHaveBeenLastCalledWith("audio sent to api.openai.com for transcription");
  });
  it("limits displayed text to 300 Unicode code points on one line and redacts keys", async () => {
    request.mockImplementation(async () =>
      Response.json({ text: `${env.TRANSCRIBE_API_KEY}\n${"😀".repeat(310)}` }),
    );
    await runComparison(["--file", "mock.wav", "--models", "whisper-1"], env, print);
    const result = print.mock.calls[1]![0];
    const text: string = JSON.parse(result.split("\t").at(-1)!);
    expect([...text]).toHaveLength(300);
    expect(text).toMatch(/^\[redacted\]\n😀/);
    expect(result).not.toContain("\n");
    expect(result).not.toContain(env.TRANSCRIBE_API_KEY);
  });
  it.each([
    [[], "--file"],
    [["--file", "x", "--api-key", "sk-test-private"], "only from the environment"],
    [["--file", "x", "--models", "whisper-1,"], "comma-separated"],
    [["--file", "x", "--reference", "a", "--reference-file", "b"], "either"],
    [
      ["--file", "x", "--base-url", "https://user:password@example.invalid/v1"],
      "without credentials",
    ],
    [["--file", "x", "--language", ""], "language code"],
  ])("invalid arguments fail before upload: %j", async (args, reason) => {
    await expect(runComparison(args, env, print)).rejects.toThrow(reason);
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses a missing key before reading audio", async () => {
    await expect(runComparison(["--file", "mock.wav"], {}, print)).rejects.toThrow(
      "Set TRANSCRIBE_API_KEY",
    );
    expect(files.stat).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
