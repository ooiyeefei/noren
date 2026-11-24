"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useId, useState } from "react";
import { ErrorMessage } from "@/components/layout/error-message";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { buildTripShare } from "@/lib/trip/share";
import type { StoredParty, StoredTrip } from "@/lib/trip/storage";
import { api } from "../../../convex/_generated/api";
import { buttonClass, fieldClass, helpClass, quietButtonClass } from "./route-step";

// "Share with the party" (T119): a private link the rest of the party reads with no account. The
// plan is sent to Noren only when the organiser presses the button, and the link can be switched
// off at any time. What the link shows is decided by `buildTripShare`, not by this file.

/** The link is already gone from Noren's side (production hides the words, so the code is read). */
export function linkAlreadyGone(error: unknown): boolean {
  return error instanceof ConvexError && (error.data as { code?: string } | null)?.code === "not_found";
}

export type ShareMessage = "made" | "updated" | "off" | "copied" | "copyFailed" | "tooBig";

export type ShareViewProps = {
  locale: Locale;
  /** The full address of the link, when one is made. */
  url?: string;
  title: string;
  onTitle(title: string): void;
  busy: boolean;
  online: boolean;
  message?: ShareMessage;
  error?: unknown;
  onMake(): void;
  onUpdate(): void;
  onCopy(): void;
  onOff(): void;
};

export function ShareView(props: ShareViewProps): React.JSX.Element {
  const { locale } = props;
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  const blocked = props.busy || !props.online;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="max-w-3xl space-y-3 rounded-[10px] border border-line bg-white p-4"
    >
      <h2 id={`${id}-title`} className="font-sans text-[20px] font-bold">
        {m.shareHeading}
      </h2>
      <p className="max-w-prose">{m.shareIntro}</p>
      {props.url === undefined ? (
        <>
          <div className="space-y-1">
            <label htmlFor={`${id}-name`} className="block font-bold">
              {m.shareTitleLabel}
            </label>
            <input
              id={`${id}-name`}
              type="text"
              maxLength={80}
              value={props.title}
              onChange={(event) => props.onTitle(event.target.value)}
              className={fieldClass}
            />
            <p className={helpClass}>{m.shareTitleHelp}</p>
          </div>
          <button type="button" className={buttonClass} disabled={blocked} onClick={props.onMake}>
            {props.busy ? m.shareMaking : m.shareMake}
          </button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <label htmlFor={`${id}-link`} className="block font-bold">
              {m.shareLinkLabel}
            </label>
            <input
              id={`${id}-link`}
              type="text"
              readOnly
              value={props.url}
              onFocus={(event) => event.currentTarget.select()}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={buttonClass} onClick={props.onCopy}>
              {m.shareCopy}
            </button>
            <button type="button" className={quietButtonClass} disabled={blocked} onClick={props.onUpdate}>
              {props.busy ? m.shareMaking : m.shareUpdate}
            </button>
            <button type="button" className={quietButtonClass} disabled={blocked} onClick={props.onOff}>
              {m.shareOff}
            </button>
          </div>
          <p className={helpClass}>{m.shareUpdateHelp}</p>
        </>
      )}
      {!props.online && (
        <p role="status" className="font-bold">
          {m.shareOffline}
        </p>
      )}
      {props.message && (
        <p role="status" className="font-bold">
          {
            {
              made: m.shareMade,
              updated: m.shareUpdated,
              off: m.shareIsOff,
              copied: m.shareCopied,
              copyFailed: m.shareCopyFailed,
              tooBig: m.shareTooBig,
            }[props.message]
          }
        </p>
      )}
      {props.error !== undefined && props.error !== null && (
        <div className="space-y-1">
          <p role="alert" className="font-bold text-beni">
            {m.shareFailed}
          </p>
          <ErrorMessage error={props.error} locale={locale} />
        </div>
      )}
    </section>
  );
}

/** The share controls for a trip kept on this phone. The code is kept with the trip. */
export function ShareControls({
  locale,
  trip,
  party,
  online,
  defaultTitle,
  onCode,
}: {
  locale: Locale;
  trip: StoredTrip;
  party: StoredParty;
  online: boolean;
  defaultTitle: string;
  onCode(code: string | undefined): void;
}): React.JSX.Element {
  const create = useMutation(api.tripShare.create);
  const remove = useMutation(api.tripShare.remove);
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ShareMessage>();
  const [error, setError] = useState<unknown>();
  const url = trip.shareCode
    ? `${window.location.origin}${localePath(locale, `/trip/shared/${trip.shareCode}`)}`
    : undefined;

  async function send(done: ShareMessage) {
    if (!online) return;
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const args = buildTripShare(trip, party, title.trim() || defaultTitle);
      const { code } = await create(args);
      onCode(code);
      setMessage(done);
    } catch (caught) {
      // A plan too long to share is said plainly; a server refusal is read by the error message.
      if (caught instanceof Error && caught.message === "share_limit") setMessage("tooBig");
      else setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShareView
      locale={locale}
      url={url}
      title={title}
      onTitle={setTitle}
      busy={busy}
      online={online}
      message={message}
      error={error}
      onMake={() => void send("made")}
      onUpdate={() => void send("updated")}
      onCopy={() => {
        if (!url) return;
        setError(undefined);
        navigator.clipboard
          .writeText(url)
          .then(() => setMessage("copied"))
          .catch(() => setMessage("copyFailed"));
      }}
      onOff={() => {
        const code = trip.shareCode;
        if (!code || !online) return;
        setBusy(true);
        setMessage(undefined);
        setError(undefined);
        remove({ code })
          .then(() => {
            onCode(undefined);
            setMessage("off");
          })
          .catch((caught: unknown) => {
            if (linkAlreadyGone(caught)) {
              onCode(undefined);
              setMessage("off");
            } else setError(caught);
          })
          .finally(() => setBusy(false));
      }}
    />
  );
}
