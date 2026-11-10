"use client";

import { useId, useState } from "react";
import { UnconfirmedBadge } from "@/components/badges";
import { neighbourhoodName } from "@/components/explore/mission-bar";
import { ErrorMessage } from "@/components/layout/error-message";
import { labelForCategory } from "@/components/public/category";
import { placeHeading, type PublicRegionProps } from "@/components/public/mapping";
import { readLocation } from "@/lib/collection/location";
import { dayToTime } from "@/lib/collection/reach";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { walkMessages, type WalkMessageTable } from "@/lib/i18n/messages/walk";
import type { Compass } from "@/lib/walk/direction";
import { SLIP_HERE_METRES } from "@/lib/walk/constants";
import { legFrom, nearestNeighbourhood, slipFor, type NeighbourhoodLike } from "@/lib/walk/omikuji";
import type { Fix, Pin, TodaysSlips, WalkData } from "@/lib/walk/types";

const HOUR_MS = 60 * 60 * 1000;
const COMPASS_WORD = {
  n: "compassN",
  ne: "compassNE",
  e: "compassE",
  se: "compassSE",
  s: "compassS",
  sw: "compassSW",
  w: "compassW",
  nw: "compassNW",
} as const satisfies Record<Compass, keyof WalkMessageTable>;
const NEAR = "near";
const ALL = "all";

const SELECT =
  "min-h-12 w-full rounded-[10px] border border-input bg-white px-3 text-[17px] text-kon";
const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 text-[17px] font-bold text-white disabled:opacity-50";
const LINK = "inline-flex min-h-11 items-center font-bold text-ai underline";

type Drawn = {
  /** The neighbourhood the slip is for; null for the whole region. */
  neighbourhoodId: string | null;
  /** Where the person was when they asked for "near me"; it stays on this phone. */
  origin: Pin | null;
};

/**
 * Today's omikuji. The server draws the day's slip for every neighbourhood and sends them all; this
 * panel picks one on the phone. "Near me" reads the location here, once if a walk is not already
 * watching it, and works out the nearest neighbourhood here: the request never carries it.
 */
export function OmikujiPanel({
  locale,
  region,
  regionName,
  neighbourhoods,
  planner,
  data,
  position,
}: {
  locale: Locale;
  region: PublicRegionProps;
  regionName: string;
  neighbourhoods: readonly NeighbourhoodLike[];
  planner: boolean;
  data: WalkData;
  /** The walk's latest reading, if a walk is on. */
  position: Fix | null;
}) {
  const m = messagesFor(walkMessages, locale);
  const write = messagesFor(addStoryMessages, locale).write;
  const selectId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [slips, setSlips] = useState<{ slips: TodaysSlips; fetchedAt: number } | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [step, setStep] = useState<"idle" | "locating" | "drawing" | "denied">("idle");
  const [error, setError] = useState<unknown>(null);
  // On a walk the nearest neighbourhood is the natural pick; otherwise the first one on the list.
  const where = choice ?? (position ? NEAR : (neighbourhoods[0]?.id ?? ALL));

  async function draw() {
    setError(null);
    let origin: Pin | null = position;
    let neighbourhoodId: string | null;
    if (where === NEAR) {
      if (origin === null) {
        setStep("locating");
        const read = await readLocation(
          typeof navigator === "undefined" ? undefined : navigator.geolocation,
        );
        if (read.kind !== "read") {
          setStep("denied");
          return;
        }
        origin = { lat: read.lat, lng: read.lng };
      }
      neighbourhoodId = nearestNeighbourhood(neighbourhoods, origin)?.id ?? null;
    } else {
      neighbourhoodId = where === ALL ? null : where;
    }
    setStep("drawing");
    try {
      let today = slips;
      if (today === null || Date.now() - today.fetchedAt > HOUR_MS) {
        today = { slips: await data.drawToday(), fetchedAt: Date.now() };
        setSlips(today);
      }
      setDrawn({ neighbourhoodId, origin });
      setStep("idle");
    } catch (caught) {
      setError(caught);
      setStep("idle");
    }
  }

  const slip = drawn && slips ? slipFor(slips.slips, drawn.neighbourhoodId) : undefined;
  const drawnNeighbourhood = drawn
    ? neighbourhoods.find(({ id }) => id === drawn.neighbourhoodId)
    : undefined;
  const whereName = drawnNeighbourhood
    ? neighbourhoodName(drawnNeighbourhood.names, locale)
    : format(m.allOf, { region: regionName });
  const busy = step === "locating" || step === "drawing";
  return (
    <section
      data-omikuji=""
      aria-labelledby="omikuji-title"
      className="space-y-4 rounded-[10px] border border-line p-4"
    >
      <h2 id="omikuji-title" className="font-sans text-[22px] font-bold">
        {m.omikujiTitle}
      </h2>
      <p>{m.omikujiLead}</p>
      <div className="space-y-2">
        <label htmlFor={selectId} className="block font-bold">
          {m.omikujiWhere}
        </label>
        <select
          id={selectId}
          className={SELECT}
          value={where}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value={NEAR}>{m.nearMe}</option>
          {neighbourhoods.map((neighbourhood) => (
            <option key={neighbourhood.id} value={neighbourhood.id}>
              {neighbourhoodName(neighbourhood.names, locale)}
            </option>
          ))}
          <option value={ALL}>{format(m.allOf, { region: regionName })}</option>
        </select>
      </div>
      <button
        type="button"
        data-draw-slip=""
        className={BUTTON}
        disabled={busy}
        onClick={() => void draw()}
      >
        {step === "drawing" ? m.drawing : m.drawSlip}
      </button>
      <div role="status" aria-live="polite" className="space-y-2">
        {step === "locating" && <p>{m.locating}</p>}
        {step === "denied" && <p>{m.locationDenied}</p>}
      </div>
      {error !== null && <ErrorMessage error={error} locale={locale} />}

      {drawn && slips && step !== "drawing" && (
        <div
          data-omikuji-slip={slip?.place.slug ?? "none"}
          className="space-y-3 border-t border-line pt-4"
        >
          {slip === undefined ? (
            <p>{format(m.slipNoPlace, { where: whereName })}</p>
          ) : (
            <SlipCard
              locale={locale}
              region={region}
              m={m}
              write={write}
              planner={planner}
              slip={slip}
              heading={format(m.slipFor, {
                where: whereName,
                day: new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(dayToTime(slips.slips.day)),
              })}
              from={position ?? drawn.origin}
              centre={drawnNeighbourhood}
            />
          )}
        </div>
      )}
    </section>
  );
}

export function SlipCard({
  locale,
  region,
  m,
  write,
  planner,
  slip,
  heading,
  from,
  centre,
}: {
  locale: Locale;
  region: PublicRegionProps;
  m: WalkMessageTable;
  write: string;
  planner: boolean;
  slip: NonNullable<ReturnType<typeof slipFor>>;
  heading: string;
  from: Pin | null;
  centre: NeighbourhoodLike | undefined;
}) {
  const { place } = slip;
  const name = placeHeading(place.names, locale, region);
  const category = place.category ? labelForCategory(region, place.category, locale) : undefined;
  const path = localePath(locale, `/places/${encodeURIComponent(place.slug)}`);
  const origin = from ?? centre?.center ?? null;
  const leg = origin ? legFrom(origin, place.pin) : null;
  const direction = leg ? m[COMPASS_WORD[leg.compass]] : "";
  const newTab = { target: "_blank", rel: "noopener" } as const;
  return (
    <>
      <p className="text-[15px] font-bold text-muted-foreground">{heading}</p>
      <h3
        lang={name.primary.lang}
        className="text-[24px] leading-snug font-bold [overflow-wrap:anywhere]"
      >
        {name.primary.text}
      </h3>
      {name.secondary && (
        <p lang={name.secondary.lang} className="text-[15px] text-muted-foreground">
          {name.secondary.text}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
        {category && <span>{category}</span>}
        {place.confirmedAt === undefined && <UnconfirmedBadge locale={locale} />}
      </p>
      {leg && (
        <p data-slip-leg="" className="font-bold">
          {leg.straightMetres <= SLIP_HERE_METRES
            ? from
              ? m.slipHere
              : format(m.slipAtCentre, {
                  name: centre ? neighbourhoodName(centre.names, locale) : "",
                })
            : format(from ? m.slipLeg : m.slipFromCentre, {
                metres: leg.metres.toLocaleString(locale),
                minutes: leg.minutes,
                direction,
                name: centre ? neighbourhoodName(centre.names, locale) : "",
              })}
        </p>
      )}
      {place.hasStory ? (
        <a className={LINK} href={`${path}?tab=stories`} {...newTab}>
          {m.readStories}
          <span className="sr-only"> ({m.newTab})</span>
        </a>
      ) : (
        <div className="space-y-2">
          <p className="font-bold">{format(m.firstStory, { name: name.primary.text })}</p>
          <a
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 text-[17px] font-bold text-white"
            href={`${path}?tab=stories&write=1`}
            {...newTab}
          >
            {write}
            <span className="sr-only"> ({m.newTab})</span>
          </a>
        </div>
      )}
      <p role="note" className="text-[15px] text-muted-foreground">
        {m.omikujiRandom}
      </p>
      {planner && (
        <a
          className={LINK}
          href={`${localePath(locale, "/plan")}?place=${encodeURIComponent(place.slug)}`}
        >
          {m.askAbout}
        </a>
      )}
    </>
  );
}
