"use client";

import { useRef, useState } from "react";
import { UnreviewedBadge } from "@/components/badges";
import { ErrorMessage } from "@/components/layout/error-message";
import { removalHref } from "@/components/takedown/takedown-logic";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { factMessages } from "@/lib/i18n/messages/facts";

/** One item of the region's fixed list (`factVocabulary`), as the page needs it. */
export type FactVocabularyItem = {
  key: string;
  labels: Readonly<Record<string, string>>;
  labelsReviewedBy: string | null;
};

type FactCommon = {
  _id: string;
  key: string;
  value: "yes" | "no";
  /** The local day it was reported, `YYYY-MM-DD`. */
  day: string;
  isOld: boolean;
};
/** What `api.facts.forPlace` returns. */
export type FactLike =
  | (FactCommon & { basis: "member"; reporterName: string; addedByMe: boolean })
  | (FactCommon & {
      basis: "post";
      quote: string;
      source: { url: string; platform: string; authorHandle?: string; authorUrl?: string };
    });

/** The day as a date in the reader's language. The day is a plain calendar date, so no time zone moves it. */
export function factDate(day: string, locale: Locale): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time)) return day;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(time);
}

export const labelFor = (item: FactVocabularyItem, locale: Locale) =>
  item.labels[locale] ?? item.labels.en ?? item.key;

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 py-2 font-bold disabled:opacity-50";

function HideFact({
  locale,
  factId,
  hide,
}: {
  locale: Locale;
  factId: string;
  hide(factId: string, reason: string): Promise<unknown>;
}) {
  const m = messagesFor(factMessages, locale);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  if (done) return <p role="status">{m.hidden}</p>;
  if (!open)
    return (
      <button
        type="button"
        className={`${BUTTON} border border-input text-kon`}
        onClick={() => setOpen(true)}
      >
        {m.hide}
      </button>
    );
  const text = reason.trim();
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current || text.length === 0 || text.length > 2000) return;
        busy.current = true;
        setPending(true);
        setError(null);
        try {
          await hide(factId, text);
          setDone(true);
        } catch (caught) {
          setError(caught);
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <label className="block space-y-1">
        <span className="font-bold">{m.hideReason}</span>
        <textarea
          value={reason}
          maxLength={2000}
          rows={2}
          onChange={(event) => setReason(event.target.value)}
          className="block w-full rounded-[10px] border border-input p-3 text-[16px]"
        />
      </label>
      {error !== null && <ErrorMessage error={error} locale={locale} />}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending || text.length === 0}
          className={`${BUTTON} bg-kon text-white`}
        >
          {pending ? m.hiding : m.hideConfirm}
        </button>
        <button
          type="button"
          disabled={pending}
          className={`${BUTTON} border border-input text-kon`}
          onClick={() => setOpen(false)}
        >
          {m.cancel}
        </button>
      </div>
    </form>
  );
}

/**
 * FR-344 to FR-347: each practical fact with who reported it and the day, or a visitor's own words
 * with a link to their post. Facts sit under the region's list in its own order, never by how many
 * agree. Records that differ stand side by side with their dates and nothing is chosen between them.
 * There is no count, no tick that reads as a verdict, and no colour that reads as good or bad.
 */
export function FactList({
  locale,
  vocabulary,
  facts,
  maxAgeDays,
  placeSlug,
  hide,
}: {
  locale: Locale;
  vocabulary: readonly FactVocabularyItem[];
  facts: readonly FactLike[];
  maxAgeDays?: number;
  /** Where "report a problem" goes: the takedown form for this place. */
  placeSlug: string;
  /** Set only for a steward. */
  hide?: (factId: string, reason: string) => Promise<unknown>;
}) {
  const m = messagesFor(factMessages, locale);
  const groups = vocabulary
    .map((item) => ({
      item,
      // Newest day first; the sort is stable, so equal days keep the server's order.
      rows: facts.filter((fact) => fact.key === item.key).sort((a, b) => b.day.localeCompare(a.day)),
    }))
    .filter(({ rows }) => rows.length > 0);
  if (groups.length === 0) return <p className="text-[17px]">{m.empty}</p>;
  return (
    <ul className="space-y-4">
      {groups.map(({ item, rows }) => (
        <li key={item.key} data-fact-key={item.key} className="space-y-2">
          <p className="font-bold">
            {labelFor(item, locale)}{" "}
            {item.labelsReviewedBy === null && <UnreviewedBadge locale={locale} />}
          </p>
          {new Set(rows.map((row) => row.value)).size > 1 && (
            <p className="text-[15px]">{m.differ}</p>
          )}
          <ul className="space-y-2 border-l-2 border-line pl-3">
            {rows.map((fact) => (
              <li key={fact._id} data-fact="" className="space-y-1">
                <p className="font-bold">{fact.value === "yes" ? m.yes : m.no}</p>
                <p className="text-[15px]">
                  {fact.basis === "member"
                    ? format(m.reportedBy, {
                        name: fact.reporterName,
                        date: factDate(fact.day, locale),
                      })
                    : format(m.visitorWords, { date: factDate(fact.day, locale) })}
                </p>
                {fact.basis === "post" && (
                  <blockquote className="border-l-2 border-line pl-3 whitespace-pre-wrap">
                    {fact.quote}
                    <footer className="text-[15px]">
                      <a
                        className="inline-flex min-h-11 items-center text-ai underline"
                        href={fact.source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {m.viewPost}
                      </a>
                    </footer>
                  </blockquote>
                )}
                {fact.isOld && (
                  <p data-old="" className="text-[15px] italic">
                    {maxAgeDays === undefined
                      ? m.oldGeneric
                      : format(m.old, { days: String(maxAgeDays) })}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4">
                  <a
                    className="inline-flex min-h-11 items-center text-[15px] text-ai underline"
                    href={removalHref(locale, placeSlug, fact._id)}
                  >
                    {m.problem}
                  </a>
                  {hide && <HideFact locale={locale} factId={fact._id} hide={hide} />}
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
