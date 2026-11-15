import { errorText } from "@/components/layout/error-text";
import { messagesFor, type Locale } from "@/lib/i18n";
import { reportMessages } from "@/lib/i18n/messages/report";
import { samePagePath } from "../../../convex/lib/pagePath";

export type ReportDraft = { details: string; contact: string; website: string };
export const emptyDraft: ReportDraft = { details: "", contact: "", website: "" };
export type ReportResult = { receivedAt: number };

export const characterCount = (text: string) => text.length;
/** The `from` query parameter, reduced to a same-site path the same way the server does. */
export const pageFromQuery = (query: { get: (key: string) => string | null }) =>
  samePagePath(query.get("from"));
export function deviceString(width: number, height: number, userAgent: string) {
  return `${width}×${height} · ${userAgent}`.slice(0, 300);
}
export function validateDetails(text: string, locale: Locale): string | null {
  const length = characterCount(text.trim());
  return length < 10 || length > 2000 ? messagesFor(reportMessages, locale).length : null;
}
export function submitArguments(
  draft: ReportDraft,
  pagePath: string,
  device: string,
  locale: Locale,
) {
  return {
    details: draft.details.trim(),
    pagePath,
    device,
    ...(draft.contact.trim() ? { contact: draft.contact.trim().slice(0, 200) } : {}),
    locale,
    website: draft.website,
  };
}
export function reportError(error: unknown, locale: Locale) {
  const m = messagesFor(reportMessages, locale);
  const data =
    typeof error === "object" && error !== null && "data" in error ? error.data : undefined;
  const code =
    typeof data === "object" && data !== null && "code" in data ? data.code : undefined;
  if (code === "rate_limited") return m.tryLater;
  if (code === "invalid_input") return m.invalid;
  return errorText(error, locale);
}
