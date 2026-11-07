"use client";

import { useMemo, useState } from "react";
import { platformName } from "@/components/embeds/platform-name";
import { StoryPhotos } from "@/components/place/story-photos";
import { placeHeading, type NameLike } from "@/components/public/mapping";
import { StampInk, stampName, type StampRegion } from "@/components/stamps/stamp";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { trailMessages } from "@/lib/i18n/messages/trail";
import { formatDay, groupTrips, orderTrail, tripLabels } from "@/lib/trail/trips";
import { cn } from "@/lib/utils";
import { TrailMap, type TrailLine, type TrailSeal } from "./trail-map";

type When = { at: number; day: string; timed: boolean };
export type TrailMomentLike = When &
  (
    | {
        kind: "story";
        body: string;
        lang: string;
        photos: readonly { key: string; width: number; height: number; waiting: boolean }[];
      }
    | {
        kind: "post";
        url: string;
        platform: string;
        title: string | null;
        note: string | null;
        noteLang: string | null;
      }
    | { kind: "check_in"; setNames: Readonly<Record<string, string>>; panel: number }
    | { kind: "still_here" }
  );
export type TrailPlaceLike = {
  placeId: string;
  slug: string;
  names: readonly NameLike[];
  pin: { lat: number; lng: number };
  areaNames: Readonly<Record<string, string>> | null;
  stampedAt: number;
  stampDay: string;
  stampTime: number | null;
  moments: readonly TrailMomentLike[];
};
export type TrailRegion = StampRegion & {
  /** The region's own name, used for a trip that spans several neighbourhoods. */
  names: Readonly<Record<string, string>>;
  styleUrl: string;
  attribution: readonly string[];
  center: { lat: number; lng: number; zoom: number };
  /** Set while the region has photos on. */
  photoBaseUrl?: string;
};

const CHIP = "inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-medium";

/**
 * A person's footprints: their stamped places on a map, joined in the order they went, grouped into
 * trips. It shows no counts, no distances and no "N places" (principle I, FR-109); the person alone
 * sees it.
 */
export function TrailView({
  locale,
  region,
  places,
}: {
  locale: Locale;
  region: TrailRegion;
  /** Undefined while loading. */
  places?: readonly TrailPlaceLike[];
}) {
  const m = messagesFor(trailMessages, locale);
  const [tripId, setTripId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const trips = useMemo(() => groupTrips(orderTrail(places ?? [])), [places]);
  const labels = useMemo(() => tripLabels(trips, region.names, locale), [trips, region, locale]);
  const shown = useMemo(
    () => (trips.some(({ id }) => id === tripId) ? trips.filter(({ id }) => id === tripId) : trips),
    [trips, tripId],
  );
  const seals = useMemo<TrailSeal[]>(
    () =>
      shown.flatMap((trip) =>
        trip.places.map((place) => {
          const name = stampName(place.names, locale, region);
          return {
            id: place.placeId,
            lat: place.pin.lat,
            lng: place.pin.lng,
            label: placeHeading(place.names, locale, region).primary.text,
            glyph: Array.from(name.text)[0] ?? "",
            lang: name.lang,
          };
        }),
      ),
    [shown, locale, region],
  );
  const lines = useMemo<TrailLine[]>(
    () =>
      shown.map((trip) => ({
        id: trip.id,
        points: trip.places.map((place) => [place.pin.lng, place.pin.lat] as const),
      })),
    [shown],
  );
  const open = shown.flatMap((trip) => trip.places).find((place) => place.placeId === openId);

  if (places === undefined) return null;
  if (places.length === 0) {
    return (
      <div
        lang={locale}
        data-trail-empty=""
        className="space-y-3 rounded-[14px] border border-dashed border-line p-6 text-kon"
      >
        <p className="max-w-prose text-[17px]">{m.empty}</p>
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={localePath(locale, "/map")}
        >
          {m.goToMap}
        </a>
      </div>
    );
  }
  return (
    <div lang={locale} data-trail="" className="space-y-4 text-kon">
      <StampInk />
      <p className="max-w-prose text-[17px]">{m.intro}</p>
      {trips.length > 1 && (
        <div role="group" aria-label={m.tripsLabel} className="flex flex-wrap gap-2">
          {[
            { id: null, label: m.allTrips },
            ...trips.map((t, i) => ({ id: t.id, label: labels[i] ?? "" })),
          ].map((chip) => {
            const active =
              chip.id === null ? !trips.some(({ id }) => id === tripId) : chip.id === tripId;
            return (
              <button
                key={chip.id ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setTripId(chip.id);
                  setOpenId(null);
                }}
                className={cn(
                  CHIP,
                  active ? "border-kon bg-kon text-white" : "border-line bg-white text-kon",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative">
        <div className="h-[62svh] min-h-[380px] overflow-hidden rounded-[14px] border border-line lg:h-[calc(100svh-17rem)] lg:min-h-[520px]">
          <TrailMap
            locale={locale}
            label={m.mapLabel}
            styleUrl={region.styleUrl}
            attribution={region.attribution}
            center={region.center}
            seals={seals}
            lines={lines}
            selectedId={open?.placeId ?? null}
            onSelect={setOpenId}
          />
        </div>
        {open && (
          <TrailSheet
            key={open.placeId}
            locale={locale}
            region={region}
            place={open}
            onClose={() => setOpenId(null)}
          />
        )}
        {!open && <p className="mt-3 text-[15px] text-muted-foreground">{m.sheetHint}</p>}
      </div>
    </div>
  );
}

/** What the person did at one place: a bottom sheet on a phone and a side panel on a desktop. */
export function TrailSheet({
  locale,
  region,
  place,
  onClose,
}: {
  locale: Locale;
  region: TrailRegion;
  place: TrailPlaceLike;
  onClose(): void;
}) {
  const m = messagesFor(trailMessages, locale);
  const heading = placeHeading(place.names, locale, region);
  return (
    <section
      lang={locale}
      data-trail-sheet=""
      aria-label={format(m.sheetLabel, { name: heading.primary.text })}
      className="fixed inset-x-0 bottom-0 z-30 max-h-[50svh] space-y-4 overflow-y-auto rounded-t-[16px] border-t border-line bg-white p-4 shadow-[var(--shadow-float)] lg:absolute lg:top-3 lg:right-3 lg:bottom-auto lg:left-auto lg:z-20 lg:max-h-[calc(100%-1.5rem)] lg:w-80 lg:rounded-[14px] lg:border lg:shadow-[var(--shadow-float)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            lang={heading.primary.lang}
            className="font-sans text-[20px] font-bold [overflow-wrap:anywhere]"
          >
            {heading.primary.text}
          </h2>
          {heading.secondary && (
            <p lang={heading.secondary.lang} className="text-[15px] text-muted-foreground">
              {heading.secondary.text}
            </p>
          )}
          <p className="text-[15px] text-muted-foreground">
            {format(m.stampedOn, { date: formatDay(place.stampDay, locale) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 shrink-0 items-center px-2 text-ai underline"
        >
          {m.close}
        </button>
      </div>
      <ul className="space-y-4">
        {place.moments.map((moment, index) => (
          <li key={`${moment.kind}-${moment.at}-${index}`} className="space-y-2 text-[16px]">
            <p className="text-[15px] font-medium">
              {momentTitle(moment, locale)}
              <span className="font-normal text-muted-foreground">
                {" · "}
                <time dateTime={moment.day}>{formatDay(moment.day, locale)}</time>
              </span>
            </p>
            {moment.kind === "story" && (
              <>
                <p lang={moment.lang} className="whitespace-pre-line [overflow-wrap:anywhere]">
                  {moment.body}
                </p>
                {region.photoBaseUrl && moment.photos.length > 0 && (
                  <StoryPhotos
                    locale={locale}
                    baseUrl={region.photoBaseUrl}
                    authorName=""
                    photos={moment.photos.map((photo) => ({
                      ...photo,
                      _id: photo.key,
                      canRemove: false,
                    }))}
                  />
                )}
              </>
            )}
            {moment.kind === "post" && (
              <>
                {moment.note && (
                  <p lang={moment.noteLang ?? undefined} className="[overflow-wrap:anywhere]">
                    {moment.note}
                  </p>
                )}
                {moment.url.startsWith("https://") && (
                  <a
                    href={moment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center text-ai underline [overflow-wrap:anywhere]"
                  >
                    {moment.title ?? m.openPost}
                  </a>
                )}
                {platformName(moment.platform) && (
                  <p className="text-[13px] text-muted-foreground">
                    {platformName(moment.platform)}
                  </p>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <a
        className="inline-flex min-h-11 items-center text-ai underline"
        href={localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}
      >
        {m.openPlace}
      </a>
    </section>
  );
}

function momentTitle(moment: TrailMomentLike, locale: Locale): string {
  const m = messagesFor(trailMessages, locale);
  switch (moment.kind) {
    case "story":
      return m.wroteStory;
    case "post":
      return m.sharedPost;
    case "still_here":
      return m.stillHere;
    case "check_in":
      return format(m.checkedIn, {
        panel: moment.panel,
        set:
          moment.setNames[locale] ?? moment.setNames.en ?? Object.values(moment.setNames)[0] ?? "",
      });
  }
}
