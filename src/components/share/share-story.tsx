"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { ErrorMessage } from "@/components/layout/error-message";
import { messagesFor, type Locale } from "@/lib/i18n";
import { shareMessages } from "@/lib/i18n/messages/share";
import { CARD_SIZES, cardPath, type CardSize } from "@/lib/share/card";
import { buildCaption } from "@/lib/share/caption";
import { copyCaption, downloadPicture, sharePicture, type PictureDeps } from "@/lib/share/picture";
import { canShareFiles } from "@/lib/share/share-file";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-5 py-2 font-bold disabled:opacity-50";

type Status = "idle" | "preparing" | "shared" | "downloaded" | "copied" | "copyFailed" | "failed";

/** Who is looking: the story's writer, the place's verified owner, or a steward. */
export type KitViewer = "writer" | "owner" | "steward";

const noChanges = () => () => {};

/**
 * The "Share on Instagram" kit on a story: a picture for a feed post (no photos, because a photo may
 * show faces), a caption to copy, and buttons to copy the caption and save the picture, with the
 * phone's share sheet where it takes a file. Noren sends nothing to Instagram; a person posts it.
 * The writer also sees whether Noren and the place may share the story, and can change that here.
 */
export function ShareStory({
  locale,
  storyId,
  caption,
  viewer = "writer",
  optedIn = false,
  canOptIn = false,
  onSetConsent,
  deps,
  defaultOpen = false,
}: {
  locale: Locale;
  storyId: string;
  caption: string;
  viewer?: KitViewer;
  /** The writer's tick is on. */
  optedIn?: boolean;
  /** The region offers the tick, so the writer may turn it on. */
  canOptIn?: boolean;
  /** Turns the writer's tick on or off; given to the writer only. */
  onSetConsent?: (on: boolean) => Promise<unknown>;
  deps?: PictureDeps;
  defaultOpen?: boolean;
}) {
  const m = messagesFor(shareMessages, locale);
  const [open, setOpen] = useState(defaultOpen);
  const [size, setSize] = useState<CardSize>("feed");
  const [status, setStatus] = useState<Status>("idle");
  const [consentChanged, setConsentChanged] = useState<boolean | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  // Only the browser knows whether its share sheet takes a file, so the server draws no button.
  const sheet = useSyncExternalStore(
    noChanges,
    () => canShareFiles(deps?.nav),
    () => false,
  );
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
  async function setConsent(on: boolean, send: (on: boolean) => Promise<unknown>) {
    if (changing) return;
    setChanging(true);
    setError(null);
    try {
      await send(on);
      setConsentChanged(on);
    } catch (caught) {
      setError(caught);
    } finally {
      setChanging(false);
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
        {viewer === "writer" && onSetConsent && (optedIn || canOptIn) && (
          <span className="flex flex-wrap items-center gap-x-3 text-[15px]">
            <span data-testid="share-consent-state">{optedIn ? m.consentOn : m.consentOff}</span>
            <button
              type="button"
              disabled={changing}
              className="inline-flex min-h-11 items-center text-ai underline disabled:opacity-50"
              onClick={() => void setConsent(!optedIn, onSetConsent)}
            >
              {optedIn ? m.consentStop : m.consentAllow}
            </button>
          </span>
        )}
      </div>
      <div role="status" aria-live="polite" className="text-[15px] empty:hidden">
        {consentChanged === null ? null : consentChanged ? m.consentAllowed : m.consentStopped}
      </div>
      {open && (
        <section aria-label={m.title} className="space-y-4 rounded-[14px] border border-line p-4">
          <h4 className="font-bold">{m.title}</h4>
          <p className="max-w-prose text-[15px]">
            {viewer === "writer" ? m.hintWriter : m.hintShared}
          </p>
          <fieldset className="flex flex-wrap gap-x-5">
            <legend className="sr-only">{m.sizeLabel}</legend>
            {(["feed", "story"] as const).map((choice) => (
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
            src={cardPath(storyId, size, { photo: false })}
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
              rows={10}
              className="block max-h-[28rem] w-full rounded-[10px] border border-input p-3 text-[16px] [field-sizing:content]"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={cn(BUTTON, "bg-kon text-white")}
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
              className={cn(BUTTON, "border border-kon text-kon")}
              disabled={status === "preparing"}
              onClick={() =>
                void run("downloaded", async () => {
                  await downloadPicture({ storyId, size, photo: false }, deps);
                })
              }
            >
              {m.download}
            </button>
            {sheet && (
              <button
                type="button"
                className={cn(BUTTON, "border border-kon text-kon")}
                disabled={status === "preparing"}
                onClick={() =>
                  void run("shared", () =>
                    sharePicture({ storyId, size, caption, photo: false }, deps).then((outcome) =>
                      outcome === "cancelled" ? "idle" : outcome,
                    ),
                  )
                }
              >
                {m.share}
              </button>
            )}
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
 * The kit wired to Convex. The server decides who gets one: the writer for their own story, and the
 * place's verified owner and stewards only while the writer's tick is on. For everyone else, and
 * for a story that has no picture to make, this shows nothing.
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
  const kit = useQuery(api.storyShare.kit, { storyId: id });
  const setShareConsent = useMutation(api.storyShare.setShareConsent);
  if (!kit) return null;
  const caption = buildCaption({
    body: kit.body,
    lang: kit.lang,
    authorName: kit.authorName,
    placeEnglish: kit.placeEnglish,
    placeJapanese: kit.placeJapanese,
    town: kit.town,
  });
  return (
    <ShareStory
      locale={locale}
      storyId={storyId}
      caption={caption}
      viewer={kit.viewer}
      optedIn={kit.optedIn}
      canOptIn={kit.canOptIn}
      onSetConsent={
        kit.viewer === "writer" ? (on) => setShareConsent({ storyId: id, on }) : undefined
      }
      defaultOpen={defaultOpen}
    />
  );
}
