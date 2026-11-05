"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { PublicRegionProps } from "@/components/public/mapping";
import { messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { BookView } from "./book-view";

export function BookContainer({
  locale,
  region,
  panelsPerSet,
}: {
  locale: Locale;
  region: PublicRegionProps;
  panelsPerSet: number;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const book = useQuery(api.collection.book, { regionId: region.regionId });
  // FR-116: the set under way, otherwise the first still unfinished, points to the next panel.
  const unfinished = book?.sets.filter((set) => set.dyedCount < set.panelCount) ?? [];
  const going = unfinished.find((set) => set.dyedCount > 0) ?? unfinished[0];
  const next = useQuery(
    api.collection.set,
    going ? { regionId: region.regionId, neighbourhoodId: going.neighbourhoodId } : "skip",
  );
  if (book === undefined) return <p role="status">{messagesFor(publicMessages, locale).loading}</p>;
  return (
    <BookView
      locale={locale}
      region={region}
      sets={book.sets}
      next={next}
      badges={book.badges}
      panelsPerSet={panelsPerSet}
      signedIn={isLoading ? undefined : isAuthenticated}
    />
  );
}
