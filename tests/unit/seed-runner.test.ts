import { describe, expect, it, vi } from "vitest";
import {
  createCliRunner,
  parseSeedFlags,
  type ConvexRunner,
  type ExecFileLike,
} from "../../scripts/lib/convex-run";
import { parseDemoData } from "../../scripts/lib/demo-plan";
import { runDemo } from "../../scripts/seed-demo";
import { ROLES } from "../../src/lib/domain/constants";
const issuer = "https://clerk.test.invalid";
const data = parseDemoData({
  regionId: "nagasaki",
  issuerNote: "Fixture",
  accounts: {
    user: "mock-user",
    creator: "mock-creator",
    business_owner: "mock-owner",
    steward: "mock-steward",
  },
  place: {
    names: [{ lang: "en", script: "latin", value: "Demo Cafe (mock)", isPrimary: true }],
    pin: { lat: 32.75, lng: 129.88 },
  },
  interview: { language: "ja", segments: [{ start: 0, end: 1, text: "架空の店です。" }] },
  claims: [{ kind: "fact", quote: "架空の店です。", textOriginal: "架空の店です。" }],
  sources: [{ url: "https://example.com/mock", title: "Mock", authorAgreed: true }],
});
function fakeRunner() {
  return vi.fn<ConvexRunner>(async (fn, args, options) => {
    if (fn === "seed:personIdFor") {
      const role = ROLES.find(
        (r) => data.accounts[r] === (args as { clerkUserId: string }).clerkUserId,
      )!;
      return { personId: `${role}-person`, role, isMock: true };
    }
    if (fn === "people:current")
      return {
        role: ROLES.find((r) => data.accounts[r] === options?.identity?.subject),
        isMock: true,
      };
    if (fn === "places:listMine") return [];
    if (fn === "places:create") return { placeId: "place-id", slug: "mock" };
    if (fn === "sources:add") return { sourceId: "source-id" };
    return `${fn}-id`;
  });
}
describe("seed runner", () => {
  it("arguments are passed as an argv array with --identity and --prod", async () => {
    const exec = vi.fn<ExecFileLike>((_file, _argv, _opts, cb) => cb(null, '{"ok":true}', ""));
    const args = { text: "literal $(no-shell) `not-a-command`" };
    const identity = { subject: "mock-creator", issuer };
    expect(
      await createCliRunner({ prod: true, cwd: "/fixture", exec })("places:create", args, {
        identity,
      }),
    ).toEqual({ ok: true });
    expect(exec.mock.calls[0]!.slice(0, 3)).toEqual([
      "npx",
      [
        "convex",
        "run",
        "places:create",
        JSON.stringify(args),
        "--identity",
        JSON.stringify(identity),
        "--prod",
      ],
      { cwd: "/fixture", maxBuffer: 8 * 1024 * 1024 },
    ]);
  });
  it("non-JSON stdout becomes an Error with a short excerpt", async () => {
    const exec: ExecFileLike = (_f, _a, _o, cb) => cb(null, "x".repeat(500) + "PRIVATE_TAIL", "");
    await expect(
      createCliRunner({ prod: false, cwd: "/fixture", exec })("x:y", {}),
    ).rejects.toThrow('"' + "x".repeat(200) + '"');
    await expect(
      createCliRunner({ prod: false, cwd: "/fixture", exec })("x:y", {}),
    ).rejects.not.toThrow(/PRIVATE_TAIL/);
  });
  it("empty stdout from a mutation that returns null resolves to null", async () => {
    for (const stdout of ["", "\n", "  \n"]) {
      const exec: ExecFileLike = (_f, _a, _o, cb) => cb(null, stdout, "");
      await expect(
        createCliRunner({ prod: true, cwd: "/fixture", exec })("places:attachOwner", {}),
      ).resolves.toBeNull();
    }
  });
  it("a non-zero exit rejects with stderr", async () => {
    const exec: ExecFileLike = (_f, _a, _o, cb) => cb(new Error("exit 1"), "", "CLI failure");
    await expect(
      createCliRunner({ prod: false, cwd: "/fixture", exec })("x:y", {}),
    ).rejects.toThrow("CLI failure");
  });
  it("--dry-run runs nothing", async () => {
    const runner = fakeRunner();
    const print = vi.fn();
    const flags = parseSeedFlags(["--data", "fixture.json", "--prod", "--dry-run"]);
    await runDemo(data, flags, runner, print);
    await runDemo(data, { ...flags, markAccounts: true }, runner, print);
    expect(runner).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalled();
    expect(flags).toEqual({ data: "fixture.json", prod: true, dryRun: true });
  });
  it("uses all four exact identities and resolves object results before writes", async () => {
    const runner = fakeRunner();
    await runDemo(data, { issuer, prod: false, dryRun: false }, runner, () => {});
    const currentCalls = runner.mock.calls.filter((c) => c[0] === "people:current");
    expect(currentCalls.map((c) => c[2]?.identity)).toEqual(
      ROLES.map((r) => ({ subject: data.accounts[r], issuer })),
    );
    expect(runner.mock.calls.find((c) => c[0] === "places:attachOwner")?.[1]).toEqual({
      placeId: "place-id",
      personId: "business_owner-person",
    });
    expect(runner.mock.calls.find((c) => c[0] === "sources:recordDemoConsent")?.[1]).toEqual({
      sourceId: "source-id",
    });
  });
  it("stops before any write on unmarked accounts, issuer mismatch or duplicate name", async () => {
    for (const failure of ["seed:personIdFor", "people:current", "places:listMine"]) {
      const good = fakeRunner();
      const runner = vi.fn<ConvexRunner>(async (fn, args, options) =>
        fn === failure
          ? failure === "places:listMine"
            ? [{ names: data.place.names }]
            : null
          : good(fn, args, options),
      );
      await expect(
        runDemo(data, { issuer, prod: false, dryRun: false }, runner, () => {}),
      ).rejects.toThrow(
        failure === "seed:personIdFor"
          ? /markMockPerson/
          : failure === "people:current"
            ? /issuer mismatch/
            : /same primary name/,
      );
      expect(runner.mock.calls.some((c) => c[0] === "places:create")).toBe(false);
    }
  });
  it("mark-accounts calls only the four admin mutations", async () => {
    const runner = fakeRunner();
    await runDemo(data, { prod: false, dryRun: false, markAccounts: true }, runner, () => {});
    expect(runner.mock.calls.map((c) => [c[0], c[2]])).toEqual(
      ROLES.map(() => ["seed:markMockPerson", undefined]),
    );
  });
  it("validates flags and preserves the issuer exactly", () => {
    expect(parseSeedFlags(["--issuer", issuer + "/"]).issuer).toBe(issuer + "/");
    for (const argv of [["--issuer", "http://example.com"], ["--data"], ["--unknown"]])
      expect(() => parseSeedFlags(argv)).toThrow();
  });
});
