"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { StewardFeedback, type ActionState } from "@/components/steward/steward-home-view";
import { useStewardAction } from "@/components/steward/steward-home-container";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { shareMessages } from "@/lib/i18n/messages/share";
import { cardPath, type CardSize } from "@/lib/share/card";
import { buildCaption } from "@/lib/share/caption";
import { copyCaption } from "@/lib/share/picture";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type ShareQueueRow = {
  storyId: string;
  body: string;
  /** The language the story was written in. */
  lang: string;
  authorName: string;
  placeEnglish: string;
  placeJapanese: string | null;
  /** The town in both languages, for the hashtags. */
  town: { en: string; ja: string };
  /** When a steward marked it posted, as a time in milliseconds. */
  postedAt: number | null;
};

export type ShareQueueProps = ActionState & {
  locale: Locale;
  rows: readonly ShareQueueRow[];
  onMarkPosted: (storyId: string) => void;
};

/** The caption a steward posts with: the same one the Instagram kit gives, crediting the writer. */
export function queueCaption(row: ShareQueueRow): string {
  return buildCaption({
    body: row.body,
    lang: row.lang,
    authorName: row.authorName,
    placeEnglish: row.placeEnglish,
    placeJapanese: row.placeJapanese,
    town: row.town,
  });
}

const button = "min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto";

function PictureLink({ row, size, label }: { row: ShareQueueRow; size: CardSize; label: string }) {
  return (
    <a
      className="inline-flex min-h-11 items-center text-ai underline"
      href={cardPath(row.storyId, size, { download: true })}
      download
    >
      {label}
    </a>
  );
}

/** Stories whose writers said Noren may share them on its own accounts. A person posts them by hand. */
export function ShareQueueView(props: ShareQueueProps) {
  const { locale, rows, pending, onMarkPosted } = props;
  const m = messagesFor(shareMessages, locale);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <section className="space-y-4" data-testid="share-queue">
      <h2 className="min-w-0 text-[22px] font-bold break-words">{m.queueTitle}</h2>
      <p className="max-w-prose">{m.queueIntro}</p>
      <StewardFeedback {...props} />
      {!rows.length && <p>{m.queueEmpty}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => {
          const caption = queueCaption(row);
          return (
            <article
              key={row.storyId}
              data-steward-card="share"
              className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
            >
              <p className="font-bold">
                {row.placeEnglish}
                {row.placeJapanese && <span className="ml-2 font-normal">{row.placeJapanese}</span>}
              </p>
              <p className="text-[15px] text-muted-foreground">
                {format(m.queueBy, { name: row.authorName })}
              </p>
              <p className="line-clamp-4 whitespace-pre-wrap">{row.body}</p>
              <div className="flex flex-wrap gap-x-5">
                <PictureLink row={row} size="story" label={m.queueStory} />
                <PictureLink row={row} size="feed" label={m.queueFeed} />
              </div>
              <label className="block space-y-1">
                <span className="font-bold">{m.captionLabel}</span>
                <textarea
                  readOnly
                  value={caption}
                  rows={6}
                  className="block w-full rounded-[10px] border border-input p-3 text-[16px]"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className={button}
                  onClick={() =>
                    void copyCaption(caption).then((ok) => setCopied(ok ? row.storyId : null))
                  }
                >
                  {m.copyCaption}
                </Button>
                {copied === row.storyId && <span role="status">{m.captionCopied}</span>}
                {row.postedAt === null ? (
                  <Button
                    className={button}
                    disabled={!!pending}
                    onClick={() => onMarkPosted(row.storyId)}
                  >
                    {m.markPosted}
                  </Button>
                ) : (
                  <span className="text-[15px]">
                    {format(m.queuePosted, {
                      date: new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }).format(row.postedAt),
                    })}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ShareQueueContainer({ locale, regionId }: { locale: Locale; regionId: string }) {
  const queue = useQuery(api.storyShare.queue, { regionId });
  const markPosted = useMutation(api.storyShare.markPosted);
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(shareMessages, locale);
  if (queue === undefined) return <p role="status">{m.queueLoading}</p>;
  return (
    <ShareQueueView
      locale={locale}
      {...state}
      rows={queue.map((entry) => ({
        storyId: entry.storyId,
        body: entry.body,
        lang: entry.lang,
        authorName: entry.authorName,
        placeEnglish: entry.placeEnglish,
        placeJapanese: entry.placeJapanese,
        town: entry.town,
        postedAt: entry.postedAt,
      }))}
      onMarkPosted={(storyId) =>
        void run(`share:${storyId}`, async () => {
          await markPosted({ storyId: storyId as Id<"story"> });
          return m.markedPosted;
        })
      }
    />
  );
}
