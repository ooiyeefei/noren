"use client";

import { useRef, useState } from "react";
import { ErrorMessage } from "@/components/layout/error-message";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { photoMessages } from "@/lib/i18n/messages/photos";
import { photoUrl } from "@/lib/photos/settings";
import { cn } from "@/lib/utils";

export type StoryPhotoLike = {
  _id: string;
  key: string;
  width: number;
  height: number;
  waiting: boolean;
  canRemove: boolean;
};

const LINK = "inline-flex min-h-11 items-center underline";

/**
 * The photos on a story card. Every tile is the same shape, so the page doesn't shift as they load
 * on a phone, and a press opens the whole picture.
 */
export function StoryPhotos({
  locale,
  photos,
  baseUrl,
  authorName,
  remove,
}: {
  locale: Locale;
  photos: readonly StoryPhotoLike[];
  baseUrl: string;
  authorName: string;
  remove?: (photoId: string) => Promise<unknown>;
}) {
  const m = messagesFor(photoMessages, locale);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function confirmRemove(photoId: string, send: (photoId: string) => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await send(photoId);
      setConfirming(null);
      setRemoved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div lang={locale} className="space-y-2">
      <ul className={cn("grid gap-2", photos.length > 1 && "grid-cols-2")}>
        {photos.map((photo, index) => {
          const number = index + 1;
          const url = photoUrl(baseUrl, photo.key);
          return (
            <li key={photo._id} className="min-w-0 space-y-1">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={format(m.open, { number })}
                className="block"
              >
                {/* The CDN serves one fixed JPEG, so no resizing service applies. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={
                    authorName
                      ? format(m.alt, { number, name: authorName })
                      : format(m.altNoName, { number })
                  }
                  width={photo.width}
                  height={photo.height}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] h-auto w-full rounded-[10px] bg-kamenozoki object-cover"
                />
              </a>
              {photo.waiting && <p className="text-[15px] text-muted-foreground">{m.waiting}</p>}
              {photo.canRemove &&
                remove &&
                (confirming === photo._id ? (
                  <span className="flex flex-wrap items-center gap-x-3 text-[15px]">
                    <span className="text-kon">{m.removeQuestion}</span>
                    <button
                      type="button"
                      disabled={pending}
                      className={`${LINK} font-bold text-beni disabled:opacity-50`}
                      onClick={() => void confirmRemove(photo._id, remove)}
                    >
                      {m.removeYes}
                    </button>
                    <button
                      type="button"
                      className={`${LINK} text-ai`}
                      onClick={() => setConfirming(null)}
                    >
                      {m.keep}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`${LINK} text-[15px] text-ai`}
                    onClick={() => {
                      setConfirming(photo._id);
                      setRemoved(false);
                      setError(null);
                    }}
                  >
                    {m.remove}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
      <div role="status" aria-live="polite" className="text-[15px] empty:hidden">
        {removed ? m.removed : null}
      </div>
      {error !== null && <ErrorMessage error={error} locale={locale} />}
    </div>
  );
}
