import { neighbourhoodName } from "@/components/explore/mission-bar";
import { placeHeading, type NameLike, type PublicRegionProps } from "@/components/public/mapping";
import { nextPanel } from "@/lib/collection/next-panel";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import type { NorenPanel } from "./noren";

export type SetPlaceLike = {
  placeId: string;
  slug: string;
  names: readonly NameLike[];
  pin: { lat: number; lng: number } | null;
  line: { en: string; ja: string; postsRead: number } | null;
};

export type SetLike = {
  neighbourhoodId: string;
  names: Readonly<Record<string, string>>;
  panelCount: number;
  center: { lat: number; lng: number };
  finished: boolean;
  finishedOn: string | null;
  wholeArtUrl: string | null;
  lastVisitedPlaceId: string | null;
  panels: readonly (NorenPanel & { places: readonly SetPlaceLike[] })[];
};

/** Where a person last was in this set, or null before they have been anywhere in it. */
export function lastVisitedPin(set: SetLike) {
  for (const panel of set.panels) {
    for (const place of panel.places) {
      if (place.placeId === set.lastVisitedPlaceId) return place.pin;
    }
  }
  return null;
}

/**
 * FR-116: the nearest panel still undyed, in a straight line from the place the person last checked
 * in at. It never reads their location: that happens on "I'm here" and at no other moment (FR-105).
 */
export function NextPanelCard({
  locale,
  region,
  set,
  from,
}: {
  locale: Locale;
  region: Pick<PublicRegionProps, "defaultLocale" | "nameFallback">;
  set: SetLike;
  /** Where to measure from. Without it, the last place checked in at or the neighbourhood's middle. */
  from?: { lat: number; lng: number };
}) {
  const m = messagesFor(collectionMessages, locale);
  const origin = from ?? lastVisitedPin(set);
  const next = nextPanel(set.panels, origin ?? set.center);
  if (next === null) return null;
  const metres = next.metres.toLocaleString(locale);
  const others =
    set.panels
      .find(({ index }) => index === next.panelIndex)
      ?.places.filter(({ placeId }) => placeId !== next.place.placeId) ?? [];
  const started = set.panels.some(({ dyed }) => dyed);
  const heading = placeHeading(next.place.names, locale, region).primary;
  const line = next.place.line;
  return (
    <div
      data-next-panel={next.place.slug}
      className="space-y-2 rounded-[10px] bg-kamenozoki/60 p-4"
    >
      <p className="font-bold">
        {origin ? format(m.nextAway, { metres }) : started ? m.nextPanelTitle : m.nextStart}
      </p>
      <p lang={heading.lang} className="text-[18px] font-bold [overflow-wrap:anywhere]">
        {heading.text}
      </p>
      {!origin && (
        <p className="text-[13px] text-muted-foreground">
          {format(m.nextFromCentre, { metres, name: neighbourhoodName(set.names, locale) })}
        </p>
      )}
      {line && (
        <div className="space-y-1">
          <p className="text-[16px]">{locale === "ja" ? line.ja : line.en}</p>
          <p className="text-[13px] text-muted-foreground">
            {format(m.aiLabel, { count: String(line.postsRead) })}
          </p>
        </div>
      )}
      <a
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 font-bold text-white"
        href={localePath(locale, `/places/${encodeURIComponent(next.place.slug)}`)}
      >
        {m.walkThere}
      </a>
      {others.length > 0 && (
        <div data-next-panel-others="">
          <p className="text-[15px]">{m.orPlace}</p>
          <ul>
            {others.map((place) => {
              const other = placeHeading(place.names, locale, region).primary;
              return (
                <li key={place.placeId}>
                  <a
                    lang={other.lang}
                    className="inline-flex min-h-11 items-center text-ai underline [overflow-wrap:anywhere]"
                    href={localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}
                  >
                    {other.text}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
