"use client";

import { useEffect, useRef, useState } from "react";
import { messagesFor, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";

export function PlaceActions({
  locale,
  title,
  pin,
}: {
  locale: Locale;
  title: string;
  pin: { lat: number; lng: number } | null;
}) {
  const m = messagesFor(placePageMessages, locale);
  const [status, setStatus] = useState<"copied" | "failed" | null>(null);
  const [failedUrl, setFailedUrl] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function share() {
    const url = window.location.href;
    if (timer.current) clearTimeout(timer.current);
    setStatus(null);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
        timer.current = setTimeout(() => setStatus(null), 3000);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setFailedUrl(url);
      setStatus("failed");
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {pin && (
          <a
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-kon px-5 font-bold text-white"
            href={`https://www.google.com/maps/dir/?api=1&destination=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.directions}
          </a>
        )}
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-input px-5 font-bold text-kon"
          onClick={share}
        >
          {m.share}
        </button>
      </div>
      <div role="status" aria-live="polite" className="text-[15px]">
        {status === "copied" && m.copied}
        {status === "failed" && (
          <>
            <p>{m.copyFailed}</p>
            <p className="select-all break-all">{failedUrl}</p>
          </>
        )}
      </div>
    </div>
  );
}
