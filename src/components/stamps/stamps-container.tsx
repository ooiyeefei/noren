"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { TrailView, type TrailRegion } from "@/components/trail/trail-view";
import type { Locale } from "@/lib/i18n";
import { messagesFor } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { trailMessages } from "@/lib/i18n/messages/trail";
import { cn } from "@/lib/utils";
import { StampsView } from "./stamps-view";

type View = "book" | "map";

export function StampsContainer({ locale, region }: { locale: Locale; region: TrailRegion }) {
  const [view, setView] = useState<View>(useSearchParams().get("view") === "map" ? "map" : "book");
  const m = messagesFor(trailMessages, locale);
  // Each view asks only for what it shows, so the book never reads the trail.
  const stamps = useQuery(api.stampBook.mine, view === "book" ? {} : "skip");
  const trail = useQuery(api.trail.mine, view === "map" ? {} : "skip");
  const loading = view === "book" ? stamps === undefined : trail === undefined;

  function choose(next: View) {
    setView(next);
    // The address keeps the view, so a reload lands on the same one. The book is the plain address.
    const url = new URL(window.location.href);
    if (next === "map") url.searchParams.set("view", "map");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="space-y-6">
      <div
        role="group"
        aria-label={m.viewLabel}
        className="inline-flex overflow-hidden rounded-[10px] border border-line bg-white"
      >
        {(["book", "map"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => choose(option)}
            className={cn(
              "min-h-11 px-5 text-[15px] font-medium",
              view === option ? "bg-kon text-white" : "text-kon",
            )}
          >
            {option === "book" ? m.book : m.map}
          </button>
        ))}
      </div>
      {loading && <p role="status">{messagesFor(publicMessages, locale).loading}</p>}
      {view === "book" ? (
        <StampsView locale={locale} region={region} stamps={stamps} />
      ) : (
        <TrailView locale={locale} region={region} places={trail} />
      )}
    </div>
  );
}
