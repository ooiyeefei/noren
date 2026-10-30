import { ConvexError } from "convex/values";

/**
 * The HTTP status each error code stands for (contracts/http-api.md). The page layer turns the
 * code in a ConvexError's data into the status, so Convex functions never deal in status numbers.
 * A rule violation (convex/lib/rules) is a state conflict.
 */
export const ERROR_STATUS = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  rule_violation: 409,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type AppErrorData = { code: Exclude<ErrorCode, "rule_violation">; message: string };

export function appError(code: AppErrorData["code"], message: string): ConvexError<AppErrorData> {
  return new ConvexError({ code, message });
}
