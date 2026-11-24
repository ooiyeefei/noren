"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { parseMapsUrl } from "@/lib/geo/maps-link";
import { matchPlaces } from "@/lib/planner/start";
import type { StoredTrip } from "@/lib/trip/storage";
import type { PartySnapshot, Plan, Stop } from "@/lib/trip/types";
import { DayView, type DayTraveller } from "./day-view";
import type { PointInfo } from "./drive-row";
import { buttonClass, fieldClass, helpClass, quietButtonClass, roadTowns } from "./route-step";
import { slugWords, type StopLookup } from "./stop-card";
import { RefusedNotice } from "./change-view";
import { UnmetBanner } from "./unmet-banner";
import type { TripPageRegion } from "./use-trips";

export type StoredPlan = NonNullable<StoredTrip["plan"]>;

/** A place on Noren's map that can be added to a day. */
export type PlaceChoice = {
  placeId: string;
  slug: string;
  name: string;
  searchable: string[];
  pin: { lat: number; lng: number };
};

export type NewPin = {
  label: string;
  day: number;
  at?: string;
  minutes: number;
  pin: { lat: number; lng: number };
  placeId?: string;
};

export type PlanViewProps = {
  locale: Locale;
  region: TripPageRegion;
  tripId: string;
  /** Where the trip starts, so a day with no drive can name the town it stays in. */
  start: string;
  plan: StoredPlan;
  /** False when nothing about the party was described: the plan then says it knows nothing. */
  partyDescribed: boolean;
  guessed: PartySnapshot["guessed"];
  labels: Readonly<Record<string, string>>;
  travellers: readonly DayTraveller[];
  pinLabels: Readonly<Record<string, string>>;
  pins: readonly { id: string; label: string; day: number }[];
  lookupFor(stop: Stop): StopLookup;
  toolsFor?(stop: Stop): React.ReactNode;
  busy: boolean;
  offline: boolean;
  problem?: "failed" | "offline";
  /** A change Noren refused: why, and the choices it left. The plan shown is as it was. */
  refused?: Plan["unmet"];
  onDismissRefused?(): void;
  finished?: boolean;
  onFinish?(): void;
  /** The "Share with the party" controls, which talk to the server and so live in a container. */
  shareSlot?: React.ReactNode;
  /** The places on Noren's map, once they have been read; undefined while they are being read. */
  places?: readonly PlaceChoice[];
  onWantPlaces?(): void;
  locate?(): Promise<{ lat: number; lng: number } | null>;
  onRedraw(slot: string): void;
  onSkip(slot: string): void;
  onDone(slot: string): void;
  onTurn(who: string, day: number): void;
  onAddDay?(): void;
  onAddPin(pin: NewPin): void;
  onReplan?(): void;
};

/** A spot typed as two numbers, or pasted as the long address of a Google Maps page. */
export function parseSpot(text: string): { lat: number; lng: number } | null {
  const trimmed = text.trim();
  const pair = trimmed.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  const found = pair
    ? { lat: Number(pair[1]), lng: Number(pair[2]) }
    : /^https:\/\//.test(trimmed)
      ? parseMapsUrl(trimmed)
      : {};
  const { lat, lng } = found;
  return lat !== undefined &&
    lng !== undefined &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

function DayAndTime({
  idBase,
  days,
  locale,
  day,
  at,
  minutes,
  onDay,
  onAt,
  onMinutes,
  withTime = true,
}: {
  idBase: string;
  days: number;
  locale: Locale;
  day: number;
  at: string;
  minutes: number;
  onDay(day: number): void;
  onAt(at: string): void;
  onMinutes(minutes: number): void;
  withTime?: boolean;
}) {
  const m = messagesFor(tripMessages, locale);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1">
        <label htmlFor={`${idBase}-day`} className="block font-bold">
          {m.pinDay}
        </label>
        <select
          id={`${idBase}-day`}
          value={day}
          onChange={(event) => onDay(Number(event.target.value))}
          className={fieldClass}
        >
          {Array.from({ length: days }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {format(m.planDay, { n })}
            </option>
          ))}
        </select>
      </div>
      {withTime && (
        <div className="space-y-1">
          <label htmlFor={`${idBase}-at`} className="block font-bold">
            {m.pinAt}
          </label>
          <input
            id={`${idBase}-at`}
            type="time"
            value={at}
            onChange={(event) => onAt(event.target.value)}
            className={fieldClass}
          />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={`${idBase}-minutes`} className="block font-bold">
          {m.pinMinutes}
        </label>
        <select
          id={`${idBase}-minutes`}
          value={minutes}
          onChange={(event) => onMinutes(Number(event.target.value))}
          className={fieldClass}
        >
          {[15, 30, 45, 60, 90, 120, 180].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AddFromMap(props: PlanViewProps & { days: number }) {
  const { locale } = props;
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  const [query, setQuery] = useState("");
  const [day, setDay] = useState(1);
  const [at, setAt] = useState("");
  const [minutes, setMinutes] = useState(60);
  const matches = props.places ? matchPlaces(props.places, query) : [];
  return (
    <details
      className="max-w-3xl rounded-[10px] border border-line bg-white p-4"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) props.onWantPlaces?.();
      }}
    >
      <summary className="min-h-11 cursor-pointer py-2 font-bold">{m.addFromMap}</summary>
      <div className="space-y-4 pt-2">
        <p className={helpClass}>{m.addFromMapHelp}</p>
        <DayAndTime
          idBase={id}
          days={props.days}
          locale={locale}
          day={day}
          at={at}
          minutes={minutes}
          onDay={setDay}
          onAt={setAt}
          onMinutes={setMinutes}
        />
        <div className="space-y-1">
          <label htmlFor={`${id}-q`} className="block font-bold">
            {m.placeSearchLabel}
          </label>
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            className={fieldClass}
          />
        </div>
        {props.places === undefined && (
          <p role="status" className={helpClass}>
            {m.placeAddLoading}
          </p>
        )}
        {props.places && query.trim() !== "" && matches.length === 0 && (
          <p role="status">{m.placeNoMatch}</p>
        )}
        <ul className="space-y-2">
          {matches.map((match) => {
            const place = props.places?.find((p) => p.slug === match.slug);
            if (!place) return null;
            return (
              <li key={place.placeId}>
                <button
                  type="button"
                  className={quietButtonClass}
                  disabled={props.busy || props.offline}
                  onClick={() =>
                    props.onAddPin({
                      label: place.name,
                      day,
                      ...(at && { at }),
                      minutes,
                      pin: place.pin,
                      placeId: place.placeId,
                    })
                  }
                >
                  {format(m.placeAdd, { name: place.name })}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

function PinSpot(props: PlanViewProps & { days: number }) {
  const { locale } = props;
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  const [label, setLabel] = useState("");
  const [spot, setSpot] = useState("");
  const [day, setDay] = useState(1);
  const [at, setAt] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [problem, setProblem] = useState<"spot" | "here" | null>(null);
  return (
    <details className="max-w-3xl rounded-[10px] border border-line bg-white p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-bold">{m.pinHeading}</summary>
      <form
        className="space-y-4 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          const pin = parseSpot(spot);
          if (!pin || label.trim() === "") {
            setProblem("spot");
            return;
          }
          setProblem(null);
          props.onAddPin({ label: label.trim(), day, ...(at && { at }), minutes, pin });
          setLabel("");
          setSpot("");
        }}
      >
        <p className={helpClass}>{m.pinHelp}</p>
        <div className="space-y-1">
          <label htmlFor={`${id}-label`} className="block font-bold">
            {m.pinLabel}
          </label>
          <input
            id={`${id}-label`}
            type="text"
            maxLength={80}
            autoComplete="off"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={fieldClass}
          />
        </div>
        <DayAndTime
          idBase={id}
          days={props.days}
          locale={locale}
          day={day}
          at={at}
          minutes={minutes}
          onDay={setDay}
          onAt={setAt}
          onMinutes={setMinutes}
        />
        <div className="space-y-1">
          <label htmlFor={`${id}-spot`} className="block font-bold">
            {m.pinSpot}
          </label>
          <p id={`${id}-spot-help`} className={helpClass}>
            {m.pinSpotHelp}
          </p>
          <input
            id={`${id}-spot`}
            type="text"
            inputMode="text"
            autoComplete="off"
            value={spot}
            aria-describedby={`${id}-spot-help`}
            onChange={(event) => setSpot(event.target.value)}
            className={fieldClass}
          />
          {props.locate && (
            <button
              type="button"
              className={quietButtonClass}
              onClick={() => {
                void props.locate?.().then((here) => {
                  if (here) {
                    setSpot(`${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}`);
                    setProblem(null);
                  } else setProblem("here");
                });
              }}
            >
              {m.pinHere}
            </button>
          )}
        </div>
        {problem && (
          <p role="alert" className="font-bold text-beni">
            {problem === "here" ? m.pinHereFailed : m.pinBadSpot}
          </p>
        )}
        <button type="submit" className={buttonClass} disabled={props.busy || props.offline}>
          {m.pinSave}
        </button>
      </form>
    </details>
  );
}

/** Where a day's stops are: the town its last drive ends in, or the town it began the day in. */
function townOfDay(plan: StoredPlan, index: number, start: string): string {
  const day = plan.days[index];
  const drives = day?.items.filter((item) => item.kind === "drive") ?? [];
  const last = drives.at(-1);
  if (last && last.kind === "drive") return last.to;
  for (let i = index - 1; i >= 0; i--) {
    const night = plan.days[i]?.night;
    if (night) return night;
  }
  return start;
}

/**
 * The plan, day by day. A plain component: the container reads the device and the server and hands
 * everything in. Nothing here is a count, a score or a ranking of travellers, turns or places.
 */
export function PlanView(props: PlanViewProps): React.JSX.Element {
  const { locale, plan, region } = props;
  const m = messagesFor(tripMessages, locale);
  const towns = new Map(roadTowns(region, locale).map((t) => [t.id, t.name]));
  const pointInfo = (id: string): PointInfo => {
    const point = region.roads?.points.find((p) => p.id === id);
    const named = point?.names?.[locale];
    return { name: towns.get(id) ?? named ?? slugWords(id), pin: point?.pin };
  };
  const guessList = props.guessed.map(
    (g) =>
      ({
        stretch: m.guessStretch,
        dayDrive: m.guessDayDrive,
        meals: m.guessMeals,
        fullness: m.guessFullness,
      })[g],
  );
  const stops = plan.days.flatMap((d) => d.items.filter((i): i is Stop => i.kind === "stop"));
  const checks = stops.flatMap((s) => s.checks);
  const mostlyUnchecked =
    checks.length > 0 && checks.filter((c) => c.verdict === "met").length * 10 < checks.length;
  const noStoryTowns = [
    ...new Set(
      plan.days.flatMap((d, i) =>
        d.notes.includes("no_stories_in_town")
          ? [pointInfo(townOfDay(plan, i, props.start)).name]
          : [],
      ),
    ),
  ];
  const days = Math.max(1, plan.days.length);
  const joiner = locale === "ja" ? "、" : ", ";
  const done = new Set(plan.done);
  const editHref = localePath(locale, `/trip/${encodeURIComponent(props.tripId)}/party`);
  const changeHref = localePath(locale, `/trip/${encodeURIComponent(props.tripId)}/change`);
  return (
    <div className="space-y-8" lang={locale}>
      {props.offline && (
        <p role="status" className="max-w-3xl rounded-[10px] bg-kamenozoki p-3 font-bold">
          {m.planOffline}
        </p>
      )}
      {props.busy && (
        <p role="status" className="font-bold">
          {m.planChanging}
        </p>
      )}
      {props.problem && (
        <p role="alert" className="max-w-3xl font-bold text-beni">
          {props.problem === "offline" ? m.planOfflineChange : m.planChangeFailed}
        </p>
      )}
      {props.refused && props.refused.length > 0 && (
        <RefusedNotice locale={locale} unmet={props.refused} onDismiss={props.onDismissRefused} />
      )}
      {props.finished && (
        <p role="status" className="max-w-3xl rounded-[10px] bg-kamenozoki p-3 font-bold">
          {m.planFinished}
        </p>
      )}
      <p className="max-w-prose text-[15px] text-muted-foreground">
        {m.changeSendConsent} {m.partyConsent}
      </p>
      <UnmetBanner
        locale={locale}
        tripId={props.tripId}
        unmet={plan.unmet}
        onAddDay={props.onAddDay}
        busy={props.busy || props.offline}
      />
      <div className="max-w-3xl space-y-2" data-plan-notes="">
        {!props.partyDescribed && <p>{m.planKnowsNothing}</p>}
        {guessList.length > 0 && (
          <p>
            {format(m.planGuesses, { list: guessList.join(joiner) })}{" "}
            <Link className="inline-flex min-h-11 items-center text-ai underline" href={editHref}>
              {m.planGuessesChange}
            </Link>
          </p>
        )}
        {mostlyUnchecked && <p>{m.planMostlyUnchecked}</p>}
        {noStoryTowns.length > 0 && (
          <p>{format(m.planNoStoriesTown, { towns: noStoryTowns.join(joiner) })}</p>
        )}
        <p className="text-[15px] text-muted-foreground">{m.planTimesNote}</p>
      </div>
      {plan.days.map((day) => (
        <DayView
          key={day.index}
          locale={locale}
          day={day}
          point={pointInfo}
          labels={props.labels}
          travellers={props.travellers}
          pinLabels={props.pinLabels}
          lookupFor={props.lookupFor}
          toolsFor={props.toolsFor}
          done={done}
          busy={props.busy}
          canChange={!props.offline}
          onRedraw={props.onRedraw}
          onSkip={props.onSkip}
          onDone={props.onDone}
          onTurn={props.onTurn}
        />
      ))}
      <div className="space-y-4">
        <AddFromMap {...props} days={days} />
        <PinSpot {...props} days={days} />
        {props.pins.length > 0 && (
          <section aria-labelledby="plan-pins" className="max-w-3xl space-y-1">
            <h2 id="plan-pins" className="font-bold">
              {m.pinListHeading}
            </h2>
            <ul className="text-[15px]">
              {props.pins.map((pin) => (
                <li key={pin.id}>{format(m.pinListLine, { label: pin.label, day: pin.day })}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {props.shareSlot}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4">
        <Link className="inline-flex min-h-11 items-center text-ai underline" href={changeHref}>
          {m.planChangeLink}
        </Link>
        <Link className="inline-flex min-h-11 items-center text-ai underline" href={editHref}>
          {m.planEditLink}
        </Link>
        {props.onFinish && !props.finished && (
          <button type="button" className={quietButtonClass} onClick={props.onFinish}>
            {m.planFinish}
          </button>
        )}
        {props.onReplan && (
          <button
            type="button"
            className={quietButtonClass}
            disabled={props.busy || props.offline}
            onClick={props.onReplan}
          >
            {m.planAgain}
          </button>
        )}
      </div>
    </div>
  );
}
