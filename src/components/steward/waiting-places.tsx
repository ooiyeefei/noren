"use client";

import { checkDate } from "@/components/place/check-state";
import { Button } from "@/components/ui/button";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";

export type WaitingRow = {
  id: string;
  slug: string;
  name: string;
  category?: string;
  addedBy: string;
  sharedAt: number;
};

/** FR-129: places new members added, which stay off the public map until a steward decides. */
export function WaitingPlaces({
  locale,
  rows,
  pending,
  onPublish,
  onDecline,
}: {
  locale: Locale;
  rows: readonly WaitingRow[];
  pending?: string;
  onPublish: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const m = messagesFor(stewardMessages, locale);
  const button = "min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto";
  return (
    <section data-waiting-places="" className="space-y-4">
      <h2 className="min-w-0 text-[22px] font-bold break-words">{m.waitingTitle}</h2>
      <p className="max-w-prose">{rows.length ? m.waitingIntro : m.waitingEmpty}</p>
      {rows.map((row) => (
        <article
          key={row.id}
          data-steward-card="waiting"
          className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
        >
          <h3 className="text-[18px] font-bold">
            <a
              className="text-ai underline"
              href={localePath(locale, `/places/${encodeURIComponent(row.slug)}`)}
            >
              {row.name}
            </a>
          </h3>
          {row.category && <p>{row.category}</p>}
          <p className="text-[15px] text-muted-foreground">
            {format(m.waitingAddedBy, {
              name: row.addedBy || "—",
              date: checkDate(row.sharedAt, locale),
            })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button className={button} disabled={!!pending} onClick={() => onPublish(row.id)}>
              {m.waitingPublish}
            </Button>
            <Button
              variant="outline"
              className={button}
              disabled={!!pending}
              onClick={() => onDecline(row.id)}
            >
              {m.waitingDecline}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
