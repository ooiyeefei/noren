"use client";

import { useEffect, useState } from "react";
import { checkDate } from "@/components/place/check-state";
import { dayToTime } from "@/lib/collection/reach";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { KanSeal } from "./noren";

const SECONDARY =
  "inline-flex min-h-11 w-full items-center justify-center rounded-[10px] border border-kon px-5 py-2 font-bold text-kon";

/**
 * The finished picture and a way to share it. The image is fetched ahead of the press, because a
 * phone browser allows the share sheet only straight from a tap. It carries no progress numbers
 * (FR-108), and a browser that can't share files gets the plain picture instead.
 */
export function Finished({
  locale,
  name,
  fileName,
  wholeArtUrl,
  finishedOn,
}: {
  locale: Locale;
  name: string;
  fileName: string;
  wholeArtUrl: string;
  finishedOn: string | null;
}) {
  const m = messagesFor(collectionMessages, locale);
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    let current = true;
    fetch(wholeArtUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`picture answered ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (current) setFile(new File([blob], fileName, { type: blob.type || "image/png" }));
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`collection: the picture was not ready to share (${detail})`);
      });
    return () => {
      current = false;
    };
  }, [wholeArtUrl, fileName]);
  const canShare =
    file !== null && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] });
  return (
    <section data-finished="" className="space-y-3">
      <h2 className="text-[22px] font-bold">{format(m.finishedTitle, { name })}</h2>
      {finishedOn && (
        <p className="flex items-center gap-2 text-[15px]">
          <KanSeal />
          <time dateTime={finishedOn}>
            {format(m.finishedOn, { date: checkDate(dayToTime(finishedOn), locale) })}
          </time>
        </p>
      )}
      <p className="text-[17px]">{m.finishedBody}</p>
      {canShare ? (
        <button
          type="button"
          data-share-whole=""
          className={SECONDARY}
          onClick={() => {
            navigator.share({ files: [file], title: name }).catch((error: unknown) => {
              if (error instanceof Error && error.name === "AbortError") return;
              window.open(wholeArtUrl, "_blank", "noopener");
            });
          }}
        >
          {m.shareWhole}
        </button>
      ) : (
        <a className={SECONDARY} href={wholeArtUrl} target="_blank" rel="noopener">
          {m.openWhole}
        </a>
      )}
    </section>
  );
}
