import { errorText } from "@/components/layout/error-text";
import { messagesFor, type Locale } from "@/lib/i18n";
import { takedownMessages } from "@/lib/i18n/messages/takedown";

export const statuses = ["received", "hidden", "decided", "appealed", "closed"] as const;
export type TakedownStatus = (typeof statuses)[number];
export type FormDraft = {
  pageUrl: string;
  details: string;
  privacyOrMinor: boolean;
  contact: string;
  website: string;
};
export type SubmitResult = {
  code: string;
  hidden: boolean;
  matchedPlace: boolean;
  receivedAt: number;
};
export type StatusResult = {
  status: TakedownStatus;
  receivedAt: number;
  acknowledgedAt?: number;
  decidedAt?: number;
  outcome?: string;
  appealed: boolean;
};
export const characterCount = (text: string) => text.length;
export function validateText(text: string, locale: Locale): string | null {
  const length = characterCount(text.trim());
  return length < 10 || length > 2000 ? messagesFor(takedownMessages, locale).length : null;
}
export function cleanPageParameter(value: string | null): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 2000);
}
export const pageFromQuery = (query: { get: (key: string) => string | null }) =>
  cleanPageParameter(query.get("page"));
export function removalHref(locale: Locale, slug: string) {
  return `/${locale}/takedown?page=${encodeURIComponent(`/${locale}/places/${encodeURIComponent(slug)}`)}`;
}
export function submitArguments(draft: FormDraft, locale: Locale) {
  return {
    pageUrl: draft.pageUrl.trim(),
    details: draft.details.trim(),
    privacyOrMinor: draft.privacyOrMinor,
    ...(draft.contact.trim() ? { contact: draft.contact.trim() } : {}),
    locale,
    website: draft.website,
  };
}
export function validateForm(draft: FormDraft, locale: Locale): string | null {
  return !draft.pageUrl.trim()
    ? messagesFor(takedownMessages, locale).pageRequired
    : validateText(draft.details, locale);
}
export function takedownError(error: unknown, locale: Locale) {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    error.data.code === "rate_limited"
  )
    return messagesFor(takedownMessages, locale).tryLater;
  return errorText(error, locale);
}
export function displayDate(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(value);
}
