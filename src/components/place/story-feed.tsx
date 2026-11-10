"use client";

import { useRef, useState } from "react";
import { DemoBadge } from "@/components/badges/demo-badge";
import { EmbedView } from "@/components/embeds/embed-view";
import { ErrorMessage } from "@/components/layout/error-message";
import { ConnectorChoiceConnected } from "@/components/share/connector-choice";
import { ShareStoryConnected } from "@/components/share/share-story";
import type { StoryFeedEntry } from "@/components/public/mapping";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { StoryPhotos } from "./story-photos";

type Removable = { kind: StoryFeedEntry["kind"]; id: string };

export type StoryFeedActions = {
  remove(entry: Removable): Promise<unknown>;
  removePhoto?(photoId: string): Promise<unknown>;
};

const LINK = "inline-flex min-h-11 items-center underline";

function dated(locale: Locale, when: number) {
  return (
    <time dateTime={new Date(when).toISOString()}>
      {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(when)}
    </time>
  );
}

/** FR-033: what people who have been here shared, each with the name of the member who shared it. */
export function StoryFeed({
  locale,
  entries,
  scriptOrigins,
  frameOrigins,
  actions,
  photoBaseUrl,
  canShareKit = false,
  connectorOffered = false,
}: {
  locale: Locale;
  entries: readonly StoryFeedEntry[];
  scriptOrigins: readonly string[];
  frameOrigins: readonly string[];
  actions?: StoryFeedActions;
  /**
   * The viewer runs this place or is a steward, so each written story may have an Instagram kit for
   * them. The server decides: it gives one only where the writer allowed it. A member's own stories
   * always ask. Posts, found ones among them, never do.
   */
  canShareKit?: boolean;
  /**
   * The region has the connector on, so a member's own written stories show the choice of letting an
   * AI assistant read them. Off, nothing is shown. The server answers only for the story's writer.
   */
  connectorOffered?: boolean;
  /** Where photos are served from; unset while photos are off. */
  photoBaseUrl?: string;
}) {
  const ui = messagesFor(placePageMessages, locale);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function remove(entry: Removable, send: StoryFeedActions) {
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
  const removeControl = (entry: Removable, canRemove: boolean) => {
    if (!canRemove || !actions) return null;
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
              <article className="space-y-3 rounded-lg border p-4">
                {entry.authorName && (
                  <p className="font-bold">{format(ui.writtenBy, { name: entry.authorName })}</p>
                )}
                <ol className="space-y-3 divide-y divide-line">
                  {entry.moments.map((moment) => (
                    <li key={moment._id} className="space-y-2 pt-3 first:pt-0">
                      <p className="flex flex-wrap items-center gap-x-3 text-[15px] text-muted-foreground">
                        {dated(locale, moment.addedAt)}
                        {moment.isMock && <DemoBadge locale={locale} />}
                        {removeControl({ kind: "written", id: moment._id }, moment.canRemove)}
                      </p>
                      <p
                        lang={moment.lang}
                        className="text-[18px] leading-[1.8] whitespace-pre-wrap"
                      >
                        {moment.body}
                      </p>
                      {photoBaseUrl && !!moment.photos?.length && (
                        <StoryPhotos
                          locale={locale}
                          photos={moment.photos}
                          baseUrl={photoBaseUrl}
                          authorName={moment.authorName}
                          remove={actions?.removePhoto}
                        />
                      )}
                      {actions && connectorOffered && moment.addedByMe && (
                        <ConnectorChoiceConnected locale={locale} storyId={moment._id} />
                      )}
                      {actions && (moment.addedByMe || canShareKit) && (
                        <ShareStoryConnected locale={locale} storyId={moment._id} />
                      )}
                    </li>
                  ))}
                </ol>
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
                    {/* The link form asks for no posted date, so this is the date a reader gets. */}
                    {entry.sharedBy &&
                      entry.source.postedAt === undefined &&
                      entry.addedAt > 0 &&
                      dated(locale, entry.addedAt)}
                    {removeControl(entry, entry.canRemove)}
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
