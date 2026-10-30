import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { appError, ERROR_STATUS, type ErrorCode } from "../../convex/lib/errors";
import { violation } from "../../convex/lib/rules/shared";
import { errorResponse, jsonError, parseJson, parseQuery } from "../../src/lib/http/handler";

afterEach(() => vi.restoreAllMocks());

describe("HTTP errors", () => {
  it.each([...Object.entries(ERROR_STATUS), ["internal", 500]])("maps %s to %s", (code, status) => {
    expect(jsonError(code as ErrorCode | "internal", "message").status).toBe(status);
  });
  it("returns the error body with no-store and preserves extra headers", async () => {
    const response = jsonError("forbidden", "No", {
      headers: { "Retry-After": "1", "Cache-Control": "public" },
    });
    expect(await response.json()).toEqual({ error: { code: "forbidden", message: "No" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it("replaces a blank message with the code", async () => {
    expect(await jsonError("conflict", "  \n").json()).toEqual({
      error: { code: "conflict", message: "conflict" },
    });
  });
  it("keeps a ConvexError's code", async () => {
    const response = errorResponse(appError("forbidden", "No"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "forbidden", message: "No" } });
  });
  it("keeps the rule of a rule violation", async () => {
    const response = errorResponse(violation("x_rule", "Conflict"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "rule_violation", message: "Conflict", rule: "x_rule" },
    });
  });
  it("turns a ZodError into 400 with prettified issues", async () => {
    const result = z.string().safeParse(1);
    if (result.success) throw new Error("Expected invalid input");
    const response = errorResponse(result.error);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({
      code: "invalid_input",
      message: z.prettifyError(result.error),
    });
  });
  it("500 body is generic and carries a request id matching the detailed log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new TypeError("broken"));
    expect(response.status).toBe(500);
    const body = await response.json();
    const requestId = response.headers.get("X-Request-Id");
    expect(requestId).toMatch(/^[a-f0-9]{8}$/);
    expect(body).toEqual({
      error: { code: "internal", message: "internal error", requestId },
    });
    expect(JSON.stringify(body)).not.toContain("broken");
    expect(JSON.stringify(body)).not.toContain("TypeError");
    expect(log).toHaveBeenCalledWith(`[${requestId}] TypeError: broken`);
  });
  it.each([
    "thrown",
    undefined,
    "",
    "   ",
    Object.assign(new Error("broken"), { name: "" }),
    Object.assign(new Error(""), { name: "  " }),
  ])("handles nonstandard throws: %s", async (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(error);
    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("internal error");
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[[a-f0-9]{8}\] \S.*$/));
  });
  it("assigns different request ids to separate failures", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(errorResponse(new Error()).headers.get("X-Request-Id")).not.toBe(
      errorResponse(new Error()).headers.get("X-Request-Id"),
    );
  });
  it.each(["unknown", "toString"])("rejects unknown Convex code %s", async (code) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new ConvexError({ code, message: "Unknown" }));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal");
  });
});

it("parseQuery validates and keeps the last repeated value", () => {
  const schema = z.object({ q: z.string().min(1) });
  expect(parseQuery(schema, "https://example.test/?q=first&q=last")).toEqual({
    ok: true,
    data: { q: "last" },
  });
  const result = parseQuery(schema, new URL("https://example.test/"));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.response.status).toBe(400);
});

it("parseJson rejects wrong content type, malformed, oversized and invalid input", async () => {
  const schema = z.object({ q: z.string() });
  for (const [body, contentType, maxBytes] of [
    ['{"q":"ok"}', "text/plain", 100],
    ["{", "application/json", 100],
    ['{"q":"é"}', "application/json", 9],
    ['{"q":1}', "application/json", 100],
    [JSON.stringify({ q: "x".repeat(65536) }), "application/json", undefined],
  ] as const) {
    const result = await parseJson(
      schema,
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      }),
      { maxBytes },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  }
  expect(
    await parseJson(
      schema,
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: '{"q":"ok"}',
      }),
      { maxBytes: 10 },
    ),
  ).toEqual({ ok: true, data: { q: "ok" } });
});
