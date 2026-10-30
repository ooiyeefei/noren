import { format, messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { ERROR_STATUS } from "../../../convex/lib/errors";

function nonblank(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function errorText(error: unknown, locale: Locale): string {
  const m = messagesFor(shellMessages, locale);
  const record = typeof error === "object" && error !== null ? error : {};
  const data: unknown = "data" in record ? record.data : undefined;
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string" &&
    Object.hasOwn(ERROR_STATUS, data.code)
  ) {
    const code = data.code as keyof typeof ERROR_STATUS;
    const message = "message" in data ? nonblank(data.message) : undefined;
    const rule = "rule" in data ? nonblank(data.rule) : undefined;
    const text =
      code === "rule_violation" ? format(m[code], { rule: rule ?? "rule_violation" }) : m[code];
    return text + (message ? ` (${message})` : "");
  }
  const name = ("name" in record ? nonblank(record.name) : undefined) ?? "Error";
  const message =
    (typeof error === "string"
      ? nonblank(error)
      : "message" in record
        ? nonblank(record.message)
        : undefined) ?? m.somethingWentWrong;
  return `${m.somethingWentWrong} (${name}: ${message})`;
}
