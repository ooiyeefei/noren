"use client";

import { useRef, useState } from "react";
import { DemoBadge } from "@/components/badges/demo-badge";
import { EmbedView } from "@/components/embeds/embed-view";
import { ErrorMessage } from "@/components/layout/error-message";
import type { StoryFeedEntry } from "@/components/public/mapping";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";

export type StoryFeedActions = {
  remove(entry: Pick<StoryFeedEntry, "kind" | "id">): Promise<unknown>;
};

const LINK = "inline-flex min-h-11 items-center underline";

/** FR-033: what people who have been here shared, each with the name of the member who shared it. */
export function StoryFeed({
  locale,
  entries,
  scriptOrigins,
  frameOrigins,
  actions,
}: {
  locale: Locale;
  entries: readonly StoryFeedEntry[];
  scriptOrigins: readonly string[];
  frameOrigins: readonly string[];
  actions?: StoryFeedActions;
}) {
  const ui = messagesFor(placePageMessages, locale);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function remove(entry: StoryFeedEntry, send: StoryFeedActions) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await send.remove({ kind: entry.kind, id: entry.id });
      setConfirming(null);
      setRemoved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const removeControl = (entry: StoryFeedEntry) => {
    if (!entry.canRemove || !actions) return null;
    if (confirming !== entry.id)
      return (
        <button
          type="button"
          className={`${LINK} text-ai`}
          onClick={() => {
            setConfirming(entry.id);
            setRemoved(false);
            setError(null);
          }}
        >
          {ui.remove}
        </button>
      );
    return (
      <span className="flex flex-wrap items-center gap-x-3">
        <span className="text-kon">{ui.removeQuestion}</span>
        <button
          type="button"
          disabled={pending}
          className={`${LINK} font-bold text-beni disabled:opacity-50`}
          onClick={() => void remove(entry, actions)}
        >
          {ui.removeYes}
        </button>
        <button type="button" className={`${LINK} text-ai`} onClick={() => setConfirming(null)}>
          {ui.keep}
        </button>
      </span>
    );
  };
  return (
    <>
      <ol className="space-y-6">
        {entries.map((entry) => (
          <li key={`${entry.kind}:${entry.id}`}>
            {entry.kind === "written" ? (
              <article lang={entry.story.lang} className="space-y-3 rounded-lg border p-4">
                <p className="text-[18px] leading-[1.8] whitespace-pre-wrap">{entry.story.body}</p>
                <footer
                  lang={locale}
                  className="flex flex-wrap items-center gap-x-3 text-[15px] text-muted-foreground"
                >
                  {entry.story.authorName && (
                    <span>{format(ui.writtenBy, { name: entry.story.authorName })}</span>
                  )}
                  <time dateTime={new Date(entry.addedAt).toISOString()}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(entry.addedAt)}
                  </time>
                  {entry.story.isMock && <DemoBadge locale={locale} />}
                  {removeControl(entry)}
                </footer>
              </article>
            ) : (
              <EmbedView
                locale={locale}
                source={entry.source}
                outboundHref={entry.outboundHref}
                scriptOrigins={scriptOrigins}
                frameOrigins={frameOrigins}
              >
                {(entry.sharedBy || (entry.canRemove && actions)) && (
                  <footer className="flex flex-wrap items-center gap-x-3 border-t pt-3 text-[15px] text-muted-foreground">
                    {entry.sharedBy && <span>{format(ui.sharedBy, { name: entry.sharedBy })}</span>}
                    {removeControl(entry)}
                  </footer>
                )}
              </EmbedView>
            )}
          </li>
        ))}
      </ol>
      <div role="status" aria-live="polite">
        {removed ? ui.removed : null}
      </div>
      {error !== null && <ErrorMessage error={error} locale={locale} />}
    </>
  );
}
