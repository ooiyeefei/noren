"use client";

import { useRef, useState } from "react";
import { ErrorMessage } from "@/components/layout/error-message";
import { messagesFor, localePath, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { answersParam } from "@/lib/slip/question";
import type { PlaceRefLike } from "@/components/public/mapping";
import { PlaceLink, withPlace, type NameRegion } from "./place-link";

/** A question carried to this place from another one, as the page gets it. */
export type CarriedRow = {
  storyId: string;
  text: string;
  /** The question's own language; it is shown as written and never translated. */
  lang: string;
  askedBy: string;
  from: PlaceRefLike;
  addedAt: number;
  /** The viewer may take the question off: its writer, either place's editor or a steward. */
  canRemove?: boolean;
};

const LINK = "inline-flex min-h-11 items-center underline";
const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 text-[17px] font-bold text-white sm:w-auto";

/**
 * Questions people carried here from other places ("three doors"), above the stories. Each is shown
 * as written, with the name of who asked and where it came from, and a link to write the answer:
 * the same link a question in the omikuji uses.
 */
export function CarriedHere({
  locale,
  region,
  slug,
  rows,
  onClear,
}: {
  locale: Locale;
  region: NameRegion;
  /** This place's address segment. */
  slug: string;
  rows: readonly CarriedRow[];
  /** Takes a question off (the story stays); offered on the rows the viewer may remove. */
  onClear?(storyId: string): Promise<unknown>;
}) {
  const ui = messagesFor(placePageMessages, locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function clear(storyId: string) {
    if (busy.current || !onClear) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await onClear(storyId);
    } catch (caught) {
      setError(caught ?? new Error("clearing the question failed"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (rows.length === 0) return null;
  const path = localePath(locale, `/places/${encodeURIComponent(slug)}`);
  return (
    <section data-carried-here="" className="space-y-4">
      <ul className="space-y-4">
        {rows.map((row) => (
          <li
            key={row.storyId}
            data-carried-question=""
            className="space-y-2 rounded-lg border border-kon/30 p-4"
          >
            <p className="font-bold">
              {withPlace(
                row.askedBy ? ui.carriedHere : ui.carriedHereAnon,
                { name: row.askedBy },
                <PlaceLink locale={locale} region={region} place={row.from} />,
              )}
            </p>
            <p lang={row.lang} className="text-[18px] leading-relaxed [overflow-wrap:anywhere]">
              {row.text}
            </p>
            <a
              data-carried-write=""
              className={BUTTON}
              href={`${path}?tab=stories&write=1&answers=${answersParam({ kind: "story", storyId: row.storyId })}`}
            >
              {ui.writeAnswer}
            </a>
            {row.canRemove && onClear && (
              <div>
                <button
                  type="button"
                  data-carried-clear=""
                  disabled={pending}
                  className={`${LINK} text-ai disabled:opacity-50`}
                  onClick={() => void clear(row.storyId)}
                >
                  {ui.clearQuestion}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error !== null && <ErrorMessage error={error} locale={locale} />}
    </section>
  );
}
