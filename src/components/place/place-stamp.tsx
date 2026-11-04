"use client";

import { useEffect, useRef } from "react";
import { StampInk, StampSeal, stampName, type StampRegion } from "@/components/stamps/stamp";
import type { NameLike } from "@/components/public/mapping";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { stampMessages } from "@/lib/i18n/messages/stamps";
import { checkDate } from "./check-state";

/**
 * The place's stamp beside what earned it. `pressed` plays the press once, right after the person
 * earned it; a stamp they already held simply sits there.
 */
export function PlaceStamp({
  locale,
  region,
  slug,
  names,
  stampedAt,
  pressed = false,
}: {
  locale: Locale;
  region: StampRegion;
  slug: string;
  names: readonly NameLike[];
  stampedAt: number;
  pressed?: boolean;
}) {
  const m = messagesFor(stampMessages, locale);
  // The press is the reward, so bring it into view when the button that earned it left it below.
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pressed) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [pressed]);
  return (
    <div
      ref={panel}
      data-stamp-inline=""
      className="flex items-center gap-4 rounded-[10px] bg-kamenozoki/50 p-4"
    >
      <style>{`
        @keyframes stamp-press {
          0% { transform: scale(1.7) rotate(calc(var(--stamp-tilt) - 7deg)); opacity: 0; }
          55% { transform: scale(0.94) rotate(var(--stamp-tilt)); opacity: 1; }
          100% { transform: scale(1) rotate(var(--stamp-tilt)); opacity: 1; }
        }
        @media (prefers-reduced-motion: no-preference) {
          [data-stamp-pressed] [data-stamp-seal] { animation: stamp-press 380ms cubic-bezier(0.3, 0, 0.2, 1) both; }
        }
      `}</style>
      <StampInk />
      <span data-stamp-pressed={pressed ? "" : undefined} className="shrink-0">
        <StampSeal name={stampName(names, locale, region)} seed={slug} size="small" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-bold">{m.inBook}</p>
        <time
          dateTime={new Date(stampedAt).toISOString()}
          className="block text-[13px] text-muted-foreground"
        >
          {checkDate(stampedAt, locale)}
        </time>
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={localePath(locale, "/stamps")}
        >
          {m.openBook}
        </a>
      </div>
    </div>
  );
}
