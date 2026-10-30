import { ConvexError } from "convex/values";
import { z } from "zod";
import { ERROR_STATUS, type ErrorCode } from "../../../convex/lib/errors";

export type ErrorBody = {
  error: { code: ErrorCode | "internal"; message: string; rule?: string; requestId?: string };
};

export function jsonError(
  code: ErrorCode | "internal",
  message: string,
  extra?: { rule?: string; headers?: HeadersInit; requestId?: string },
): Response {
  const headers = new Headers(extra?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  const body: ErrorBody = {
    error: { code, message: message.trim() ? message : code },
  };
  if (extra?.rule !== undefined) body.error.rule = extra.rule;
  if (extra?.requestId !== undefined) body.error.requestId = extra.requestId;
  return Response.json(body, {
    status: code === "internal" ? 500 : ERROR_STATUS[code],
    headers,
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "object" && data !== null && "code" in data) {
      const code = data.code;
      if (typeof code === "string" && Object.hasOwn(ERROR_STATUS, code)) {
        return jsonError(
          code as ErrorCode,
          "message" in data && typeof data.message === "string" ? data.message : code,
          code === "rule_violation" && "rule" in data && typeof data.rule === "string"
            ? { rule: data.rule }
            : undefined,
        );
      }
    }
  }
  if (error instanceof z.ZodError) {
    return jsonError("invalid_input", z.prettifyError(error));
  }
  const message =
    error instanceof Error
      ? `${error.name.trim() || "Error"}: ${error.message.trim() || "unknown error"}`
      : error === undefined
        ? "unknown error"
        : String(error).trim() || "unknown error";
  const requestId = crypto.randomUUID().slice(0, 8);
  console.error(`[${requestId}] ${message}`);
  return jsonError("internal", "internal error", {
    requestId,
    headers: { "X-Request-Id": requestId },
  });
}

export function parseQuery<S extends z.ZodType>(schema: S, url: string | URL) {
  const result = schema.safeParse(Object.fromEntries(new URL(url).searchParams));
  return result.success
    ? { ok: true as const, data: result.data }
    : { ok: false as const, response: errorResponse(result.error) };
}

export async function parseJson<S extends z.ZodType>(
  schema: S,
  request: Request,
  options?: { maxBytes?: number },
) {
  const invalid = (message: string) => ({
    ok: false as const,
    response: jsonError("invalid_input", message),
  });
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return invalid("Content-Type must be application/json");
  }
  const maxBytes = options?.maxBytes ?? 64 * 1024;
  const reader = request.body?.getReader();
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          return invalid("JSON body is too large");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
  } catch {
    return invalid("Could not read JSON body");
  } finally {
    reader?.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid("Invalid JSON body");
  }
  const result = schema.safeParse(value);
  return result.success
    ? { ok: true as const, data: result.data }
    : { ok: false as const, response: errorResponse(result.error) };
}
