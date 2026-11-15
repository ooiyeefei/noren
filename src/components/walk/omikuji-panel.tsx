"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { UnconfirmedBadge } from "@/components/badges";
import { neighbourhoodName } from "@/components/explore/mission-bar";
import { ErrorMessage } from "@/components/layout/error-message";
import { labelForCategory } from "@/components/public/category";
import { placeHeading, type PublicRegionProps } from "@/components/public/mapping";
import { readLocation } from "@/lib/collection/location";
import {
  browserStorage,
  clearKept,
  keepSlip,
  loadKept,
  doorsOf,
  isTied,
  markOpened,
  openDoor,
  sameSlip,
  saveKept,
  type KeptSlip,
} from "@/lib/slip/kept";
import { dayToTime } from "@/lib/collection/reach";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { walkMessages, type WalkMessageTable } from "@/lib/i18n/messages/walk";
import { THREAD_STOPS } from "@/lib/slip/thread";
import { SLIP_HERE_METRES } from "@/lib/walk/constants";
import { legFrom, nearestNeighbourhood, slipFor, type NeighbourhoodLike } from "@/lib/walk/omikuji";
import type { Fix, Pin, Slip, TodaysSlips, WalkData } from "@/lib/walk/types";
import { COMPASS_WORD } from "./compass-word";
import { SealedQuestion, questionText, type DoorProps } from "./slip-seal";
import { ThreadDoors } from "./thread-doors";
import { ThreadTiedMark } from "./thread-knot";

const HOUR_MS = 60 * 60 * 1000;
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
  accuracyAllowanceMetres,
}: {
  locale: Locale;
  region: PublicRegionProps;
  regionName: string;
  neighbourhoods: readonly NeighbourhoodLike[];
  planner: boolean;
  data: WalkData;
  /** The walk's latest reading, if a walk is on. */
  position: Fix | null;
  /** The collection's allowance for the phone's own error, for opening a slip's seal at the door. */
  accuracyAllowanceMetres: number;
}) {
  const m = messagesFor(walkMessages, locale);
  const write = messagesFor(addStoryMessages, locale).write;
  const selectId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [slips, setSlips] = useState<{ slips: TodaysSlips; fetchedAt: number } | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [step, setStep] = useState<"idle" | "locating" | "drawing" | "denied">("idle");
  const [error, setError] = useState<unknown>(null);
  // Kept slips live on this device only. The list is also held here, so the page works when storage
  // refuses; keptRef is the latest of it for handlers that run after a render.
  const [kept, setKept] = useState<KeptSlip[]>([]);
  const keptRef = useRef<KeptSlip[]>([]);
  const [viewing, setViewing] = useState<Pick<KeptSlip, "day" | "neighbourhoodId"> | null>(null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const stored = loadKept(browserStorage());
    keptRef.current = stored;
    // Storage can only be read in the browser, after the server's markup has been matched.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKept(stored);
  }, []);
  const update = useCallback((change: (list: KeptSlip[]) => KeptSlip[]) => {
    const next = change(keptRef.current);
    keptRef.current = next;
    setKept(next);
    saveKept(browserStorage(), next);
  }, []);
  const locate = useCallback(
    () => readLocation(typeof navigator === "undefined" ? undefined : navigator.geolocation),
    [],
  );
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
      setViewing(null);
      setCleared(false);
      const drawnSlip = slipFor(today.slips, neighbourhoodId);
      if (drawnSlip)
        update((list) =>
          keepSlip(list, { day: today.slips.day, neighbourhoodId, slip: drawnSlip }),
        );
      setStep("idle");
    } catch (caught) {
      setError(caught);
      setStep("idle");
    }
  }

  const slip = drawn && slips ? slipFor(slips.slips, drawn.neighbourhoodId) : undefined;
  const nameOfNeighbourhood = (id: string | null) => {
    const found = neighbourhoods.find((candidate) => candidate.id === id);
    return found ? neighbourhoodName(found.names, locale) : format(m.allOf, { region: regionName });
  };
  const dayText = (day: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
      dayToTime(day),
    );
  const keptEntry =
    viewing === null && drawn && slips
      ? kept.find((entry) =>
          sameSlip(entry, { day: slips.slips.day, neighbourhoodId: drawn.neighbourhoodId }),
        )
      : undefined;
  // The slip on show: the one just drawn, or a kept one the person chose to look at again.
  const current =
    viewing !== null
      ? kept.find((entry) => sameSlip(entry, viewing))
      : drawn && slips && slip
        ? {
            day: slips.slips.day,
            neighbourhoodId: drawn.neighbourhoodId,
            // Once a further door is open, the doors on show are the kept ones (the ones this
            // person opened), even if today's thread has changed since.
            slip:
              keptEntry && doorsOf(keptEntry) > 0
                ? { ...slip, thread: keptEntry.slip.thread! }
                : slip,
            opened: keptEntry?.opened ?? false,
            ...(keptEntry?.doors === undefined ? {} : { doors: keptEntry.doors }),
          }
        : undefined;
  const drawnNeighbourhood = current
    ? neighbourhoods.find(({ id }) => id === current.neighbourhoodId)
    : undefined;
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

      {viewing === null && drawn && slips && slip === undefined && step !== "drawing" && (
        <div data-omikuji-slip="none" className="space-y-3 border-t border-line pt-4">
          <p>{format(m.slipNoPlace, { where: nameOfNeighbourhood(drawn.neighbourhoodId) })}</p>
        </div>
      )}
      {current && step !== "drawing" && (
        <div
          data-omikuji-slip={current.slip.place.slug}
          className="space-y-3 border-t border-line pt-4"
        >
          <SlipCard
            key={`${current.day}|${current.neighbourhoodId ?? ""}`}
            locale={locale}
            region={region}
            m={m}
            write={write}
            planner={planner}
            slip={current.slip}
            heading={format(m.slipFor, {
              where: nameOfNeighbourhood(current.neighbourhoodId),
              day: dayText(current.day),
            })}
            from={position ?? (viewing === null ? (drawn?.origin ?? null) : null)}
            centre={drawnNeighbourhood}
            {...(slips?.slips.day === current.day ? {} : { dayText: dayText(current.day) })}
            door={{
              opened: current.opened,
              onOpen: () =>
                update((list) =>
                  markOpened(
                    keepSlip(list, {
                      day: current.day,
                      neighbourhoodId: current.neighbourhoodId,
                      slip: current.slip,
                    }),
                    current,
                  ),
                ),
              position,
              accuracyAllowanceMetres,
              locate,
            }}
            {...(region.thread
              ? {
                  thread: {
                    doors: doorsOf(current),
                    tiedOn: dayText(current.day),
                    onOpenDoor: (doorNumber: 1 | 2) =>
                      update((list) =>
                        openDoor(
                          keepSlip(list, {
                            day: current.day,
                            neighbourhoodId: current.neighbourhoodId,
                            slip: current.slip,
                          }),
                          current,
                          doorNumber,
                        ),
                      ),
                  },
                }
              : {})}
          />
        </div>
      )}
      {kept.length > 0 && (
        <div data-kept-slips="" className="space-y-3 border-t border-line pt-4">
          <h3 className="font-sans text-[20px] font-bold">{m.keptTitle}</h3>
          <p className="text-[15px] text-muted-foreground">{m.keptNote}</p>
          <ul className="space-y-3">
            {kept.map((entry) => {
              const name = placeHeading(entry.slip.place.names, locale, region).primary;
              const showing = current !== undefined && sameSlip(current, entry);
              return (
                <li
                  key={`${entry.day}|${entry.neighbourhoodId ?? ""}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span lang={name.lang} className="font-bold">
                      {name.text}
                    </span>
                    <span className="block text-[15px] text-muted-foreground">
                      {dayText(entry.day)}
                      {" · "}
                      {entry.opened ? m.keptOpened : m.keptStillSealed}
                    </span>
                    {region.thread && isTied(entry) && <ThreadTiedMark label={m.keptTied} />}
                  </span>
                  <button
                    type="button"
                    data-kept-show=""
                    aria-pressed={showing}
                    className="inline-flex min-h-11 items-center font-bold text-ai underline"
                    onClick={() => {
                      setViewing({ day: entry.day, neighbourhoodId: entry.neighbourhoodId });
                      setCleared(false);
                    }}
                  >
                    {showing ? m.keptShowing : m.keptShow}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            data-kept-clear=""
            className="inline-flex min-h-11 items-center font-bold text-beni underline"
            onClick={() => {
              clearKept(browserStorage());
              keptRef.current = [];
              setKept([]);
              setViewing(null);
              setDrawn(null);
              setCleared(true);
            }}
          >
            {m.keptClear}
          </button>
        </div>
      )}
      <div role="status" aria-live="polite" className="empty:hidden">
        {cleared ? m.keptCleared : null}
      </div>
    </section>
  );
}

/** A seal with nothing to wait for: shown open, and opening it again does nothing. */
const OPEN_DOOR: DoorProps = {
  opened: true,
  onOpen: () => undefined,
  position: null,
  accuracyAllowanceMetres: 0,
  locate: () => Promise.resolve({ kind: "unsupported" }),
};

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
  door,
  thread,
  dayText,
}: {
  locale: Locale;
  region: PublicRegionProps;
  m: WalkMessageTable;
  write: string;
  planner: boolean;
  slip: Slip;
  heading: string;
  from: Pin | null;
  centre: NeighbourhoodLike | undefined;
  /**
   * How the seal on the slip's question opens. Without it a question is shown open (a page that
   * does not keep slips).
   */
  door?: DoorProps;
  /**
   * "Three doors": how many of the slip's further doors are open, how to open the next, and the date
   * the thread is tied on. Without it (switch off, or a page that does not keep slips) a slip's
   * further doors are not shown.
   */
  thread?: { doors: number; onOpenDoor(door: 1 | 2): void; tiedOn: string };
  /** Set for a slip from an earlier day: its date, for the label. Unset is today's. */
  dayText?: string;
}) {
  const { place } = slip;
  const name = placeHeading(place.names, locale, region);
  const category = place.category ? labelForCategory(region, place.category, locale) : undefined;
  const path = localePath(locale, `/places/${encodeURIComponent(place.slug)}`);
  const origin = from ?? centre?.center ?? null;
  const leg = origin ? legFrom(origin, place.pin) : null;
  const direction = leg ? m[COMPASS_WORD[leg.compass]] : "";
  const newTab = { target: "_blank", rel: "noopener" } as const;
  const { question } = slip;
  const sealed = question !== undefined && questionText(question, locale) !== undefined;
  return (
    <>
      {question !== undefined && (
        <p
          data-slip-label=""
          className={`inline-block rounded-full border px-3 text-[15px] font-bold ${
            place.hasStory ? "border-line text-kon" : "border-kasutera bg-kasutera/30 text-kon"
          }`}
        >
          {place.hasStory
            ? dayText === undefined
              ? m.slipToday
              : format(m.slipOfDay, { day: dayText })
            : m.greatFortune}
        </p>
      )}
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
      {sealed && (
        <SealedQuestion
          locale={locale}
          m={m}
          question={question}
          placePath={path}
          pin={place.pin}
          door={door ?? { ...OPEN_DOOR, opened: true }}
          {...(question.kind === "story" && question.carriedFrom
            ? {
                carriedFromName: placeHeading(question.carriedFrom.names, locale, region).primary
                  .text,
              }
            : {})}
        />
      )}
      {place.hasStory ? (
        <a className={LINK} href={`${path}?tab=stories`} {...newTab}>
          {m.readStories}
          <span className="sr-only"> ({m.newTab})</span>
        </a>
      ) : sealed ? (
        <p data-great-fortune-line="" className="font-bold">
          {m.greatFortuneLine}
        </p>
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
      {sealed && thread && door?.opened === true && slip.thread?.length === THREAD_STOPS && (
        <ThreadDoors
          locale={locale}
          region={region}
          m={m}
          first={{ pin: place.pin, name: name.primary.text }}
          stops={slip.thread}
          doors={thread.doors}
          onOpenDoor={thread.onOpenDoor}
          from={from}
          tiedOn={thread.tiedOn}
          door={door}
        />
      )}
    </>
  );
}
