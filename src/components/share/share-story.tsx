"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ErrorMessage } from "@/components/layout/error-message";
import { messagesFor, type Locale } from "@/lib/i18n";
import { shareMessages } from "@/lib/i18n/messages/share";
import { CARD_SIZES, cardPath, type CardSize } from "@/lib/share/card";
import { buildCaption } from "@/lib/share/caption";
import { copyCaption, downloadPicture, sharePicture, type PictureDeps } from "@/lib/share/picture";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-5 py-2 font-bold disabled:opacity-50";

type Status = "idle" | "preparing" | "shared" | "downloaded" | "copied" | "copyFailed" | "failed";

/**
 * "Share as a picture" for a member's own story: a preview of the picture in the size they pick,
 * then the phone's share sheet (so Instagram is among the choices) or a download, and a caption to
 * copy. With a tick on file, "Take back" lets the writer withdraw it.
 */
export function ShareStory({
  locale,
  storyId,
  caption,
  consented = false,
  onWithdraw,
  deps,
  defaultOpen = false,
}: {
  locale: Locale;
  storyId: string;
  caption: string;
  /** Noren may feature the story on its own accounts. */
  consented?: boolean;
  onWithdraw?: () => Promise<unknown>;
  deps?: PictureDeps;
  defaultOpen?: boolean;
}) {
  const m = messagesFor(shareMessages, locale);
  const [open, setOpen] = useState(defaultOpen);
  const [size, setSize] = useState<CardSize>("story");
  const [status, setStatus] = useState<Status>("idle");
  const [withdrawn, setWithdrawn] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function run(next: Status, work: () => Promise<Status | void>) {
    if (busy.current) return;
    busy.current = true;
    setStatus("preparing");
    setError(null);
    try {
      setStatus((await work()) ?? next);
    } catch (caught) {
      console.warn(
        `share picture failed (${caught instanceof Error ? caught.name : typeof caught})`,
      );
      setStatus("failed");
    } finally {
      busy.current = false;
    }
  }
  async function withdraw(send: () => Promise<unknown>) {
    try {
      await send();
      setWithdrawn(true);
    } catch (caught) {
      setError(caught);
    }
  }
  const message: Partial<Record<Status, string>> = {
    preparing: m.preparing,
    shared: m.shared,
    downloaded: m.downloaded,
    copied: m.captionCopied,
    copyFailed: m.captionFailed,
    failed: m.failed,
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          className="inline-flex min-h-11 items-center font-bold text-ai underline"
          onClick={() => setOpen(!open)}
        >
          {m.button}
        </button>
        {consented && onWithdraw && !withdrawn && (
          <span className="flex flex-wrap items-center gap-x-3 text-[15px]">
            <span>{m.consentOn}</span>
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-ai underline"
              onClick={() => void withdraw(onWithdraw)}
            >
              {m.withdraw}
            </button>
          </span>
        )}
      </div>
      {withdrawn && (
        <p role="status" className="text-[15px]">
          {m.withdrawn}
        </p>
      )}
      {open && (
        <section aria-label={m.title} className="space-y-4 rounded-[14px] border border-line p-4">
          <h4 className="font-bold">{m.title}</h4>
          <p className="max-w-prose text-[15px]">{m.hint}</p>
          <fieldset className="flex flex-wrap gap-x-5">
            <legend className="sr-only">{m.sizeLabel}</legend>
            {(["story", "feed"] as const).map((choice) => (
              <label key={choice} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`share-size-${storyId}`}
                  checked={size === choice}
                  onChange={() => setSize(choice)}
                  className="size-5"
                />
                {choice === "story" ? m.sizeStory : m.sizeFeed}
              </label>
            ))}
          </fieldset>
          {/* The picture is drawn on the server; this is that picture, not a lookalike. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardPath(storyId, size)}
            alt={m.previewAlt}
            width={CARD_SIZES[size].width / 4}
            height={CARD_SIZES[size].height / 4}
            className="h-auto max-h-[480px] w-auto max-w-full rounded-[10px] border border-line"
          />
          <label className="block space-y-1">
            <span className="font-bold">{m.captionLabel}</span>
            <textarea
              readOnly
              value={caption}
              rows={6}
              className="block w-full rounded-[10px] border border-input p-3 text-[16px]"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={cn(BUTTON, "bg-kon text-white")}
              disabled={status === "preparing"}
              onClick={() =>
                void run("shared", () =>
                  sharePicture({ storyId, size, caption }, deps).then((outcome) =>
                    outcome === "cancelled" ? "idle" : outcome,
                  ),
                )
              }
            >
              {m.share}
            </button>
            <button
              type="button"
              className={cn(BUTTON, "border border-kon text-kon")}
              disabled={status === "preparing"}
              onClick={() =>
                void run("downloaded", async () => {
                  await downloadPicture({ storyId, size }, deps);
                })
              }
            >
              {m.download}
            </button>
            <button
              type="button"
              className={cn(BUTTON, "border border-kon text-kon")}
              onClick={() =>
                void run("copied", async () =>
                  (await copyCaption(caption, deps?.nav)) ? "copied" : "copyFailed",
                )
              }
            >
              {m.copyCaption}
            </button>
            <button
              type="button"
              className={cn(BUTTON, "border border-input text-kon")}
              onClick={() => setOpen(false)}
            >
              {m.close}
            </button>
          </div>
          <div role="status" aria-live="polite" className="text-[15px]">
            {message[status] ?? null}
          </div>
        </section>
      )}
      {error !== null && <ErrorMessage error={error} locale={locale} />}
    </div>
  );
}

/**
 * The button wired to Convex, for a story the signed-in member wrote. It shows nothing while the
 * story has no picture to make (it was removed, or its place isn't public).
 */
export function ShareStoryConnected({
  locale,
  storyId,
  defaultOpen,
}: {
  locale: Locale;
  storyId: string;
  defaultOpen?: boolean;
}) {
  const id = storyId as Id<"story">;
  const card = useQuery(api.storyShare.card, { storyId: id });
  const consented = useQuery(api.storyShare.consentOf, { storyId: id });
  const withdraw = useMutation(api.storyShare.withdraw);
  if (!card) return null;
  const caption = buildCaption({
    body: card.body,
    place: card.placeJapanese ? `${card.placeEnglish} ${card.placeJapanese}` : card.placeEnglish,
    slug: card.placeSlug,
    locale,
  });
  return (
    <ShareStory
      locale={locale}
      storyId={storyId}
      caption={caption}
      consented={consented === true}
      onWithdraw={() => withdraw({ storyId: id })}
      defaultOpen={defaultOpen}
    />
  );
}
