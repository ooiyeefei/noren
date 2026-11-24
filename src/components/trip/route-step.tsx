"use client";

import { useState } from "react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { StoredTrip } from "@/lib/trip/storage";
import { withDays, type TripPageRegion } from "./use-trips";

// Shared looks, the same as the planner and memory pages use.
export const fieldClass =
  "min-h-11 w-full rounded-[10px] border border-input bg-background px-3 text-base";
export const buttonClass =
  "min-h-11 rounded-[10px] bg-kon px-4 font-bold text-white focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2";
export const quietButtonClass =
  "min-h-11 rounded-[10px] border border-kon px-4 text-kon hover:bg-kamenozoki focus-visible:ring-2 focus-visible:ring-ai";
export const helpClass = "text-[14px] text-muted-foreground";

export type RoadTown = { id: string; name: string; /** A town the region file names, not only a road point. */ town: boolean };

/**
 * The towns a route can use: each town the region file puts on a road, by name, once for each road
 * point. A town whose id is the point's id wins the name ("George Town" for the point george-town,
 * not "Penang Island"). A road point no town stands on is offered by its own id in plain words
 * ("kuala-lumpur" as "Kuala Lumpur"), unless it is a rest area or lay-by, which nobody starts or
 * sleeps at. The region file should name such towns itself. There is no free-text place here.
 */
export function roadTowns(region: TripPageRegion, locale: Locale): RoadTown[] {
  const points = new Set(region.roads?.points.map((p) => p.id));
  const byPoint = new Map<string, { id: string; name: string; exact: boolean; town: boolean }>();
  for (const town of region.towns ?? []) {
    if (!town.onRoad || !points.has(town.onRoad)) continue;
    const name = town.names[locale] ?? Object.values(town.names)[0] ?? town.id;
    const exact = town.id === town.onRoad;
    const seen = byPoint.get(town.onRoad);
    if (!seen || (exact && !seen.exact))
      byPoint.set(town.onRoad, { id: town.onRoad, name, exact, town: true });
  }
  for (const point of region.roads?.points ?? []) {
    const id = point.id;
    if (byPoint.has(id) || /rest-area|layby/.test(id)) continue;
    // The region file gives each road point a name in each language; until it does, the id in words.
    const named = (point as { names?: Record<string, string> }).names?.[locale];
    const name =
      named ??
      id
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    byPoint.set(id, { id, name, exact: false, town: false });
  }
  // The road runs south to north in the file, so its order is the order a driver meets them.
  const order = region.roads?.points.map((p) => p.id) ?? [];
  return [...byPoint.values()]
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map(({ id, name, town }) => ({ id, name, town }));
}

function TownSelect({
  id,
  label,
  value,
  towns,
  none,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  towns: RoadTown[];
  none: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        <option value="">{none}</option>
        {towns.map((town) => (
          <option key={town.id} value={town.id}>
            {town.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RouteStep({
  locale,
  region,
  trip,
  onChange,
}: {
  locale: Locale;
  region: TripPageRegion;
  trip: StoredTrip;
  onChange(patch: Partial<StoredTrip>): void;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const towns = roadTowns(region, locale);
  // A trip sleeps in a town, and starts and ends in a town or one of the region's endpoints. A
  // junction or a rest area is not somewhere a party stays, so it is not offered; one already
  // saved on the trip stays visible.
  const endpoints = new Set(region.roads?.endpoints);
  const placesFor = (current: string) => towns.filter((t) => t.town || t.id === current);
  const endsFor = (current: string) =>
    towns.filter((t) => t.town || endpoints.has(t.id) || t.id === current);
  const [own, setOwn] = useState(trip.nights !== undefined);
  // Picks wait here until every night has a town, because the store keeps whole lists only.
  const [picks, setPicks] = useState<string[]>(trip.nights ?? []);
  const nightCount = trip.days - 1;
  // Towns to pass through are the region's towns, in the order the organiser builds. A junction or a
  // rest area is not somewhere a party stays, so it is offered as a start or an end and never here.
  const viaList = trip.via ?? [];
  const setViaList = (next: string[]) => onChange({ via: next.length > 0 ? next : undefined });
  const viaChoices = towns.filter(
    (t) => t.town && t.id !== trip.start && t.id !== trip.end && !viaList.includes(t.id),
  );
  const viaName = (id: string) => towns.find((t) => t.id === id)?.name ?? id;
  const [viaPick, setViaPick] = useState("");
  // A town that becomes the start or the end is no longer one to pass through.
  const withoutVia = (town: string): Partial<StoredTrip> => {
    if (!viaList.includes(town)) return {};
    const rest = viaList.filter((t) => t !== town);
    return { via: rest.length > 0 ? rest : undefined };
  };
  const moveVia = (index: number, by: -1 | 1) => {
    const next = [...viaList];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    setViaList(next);
  };
  const setNight = (index: number, value: string) => {
    const next = Array.from({ length: nightCount }, (_, i) =>
      i === index ? value : (picks[i] ?? ""),
    );
    setPicks(next);
    if (next.every((town) => town !== "")) onChange({ nights: next });
    else if (trip.nights) onChange({ nights: undefined });
  };
  if (towns.length === 0) return <p role="status">{m.noRoads}</p>;
  return (
    <div className="space-y-6">
      <h2 className="font-sans text-[22px] font-bold">{m.routeIntro}</h2>
      <TownSelect
        id="trip-start"
        label={m.startLabel}
        value={trip.start}
        towns={endsFor(trip.start)}
        none={m.townNone}
        onChange={(start) => onChange({ start, ...withoutVia(start) })}
      />
      <TownSelect
        id="trip-end"
        label={m.endLabel}
        value={trip.end}
        towns={endsFor(trip.end)}
        none={m.townNone}
        onChange={(end) => onChange({ end, ...withoutVia(end) })}
      />
      <fieldset className="space-y-3">
        <legend className="font-bold">{m.viaLabel}</legend>
        <p className={helpClass}>{m.viaHelp}</p>
        {viaList.length === 0 ? (
          <p className={helpClass}>{m.viaEmpty}</p>
        ) : (
          <>
            <ol className="space-y-2">
              {viaList.map((id, index) => (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-white p-2"
                >
                  <span className="min-w-0 flex-1 break-words">
                    <span aria-hidden="true" className="mr-2 font-bold">
                      {index + 1}.
                    </span>
                    {viaName(id)}
                  </span>
                  <button
                    type="button"
                    className={`${quietButtonClass} min-w-11 px-3`}
                    disabled={index === 0}
                    onClick={() => moveVia(index, -1)}
                  >
                    <span aria-hidden="true">↑</span>
                    <span className="sr-only">{format(m.viaUp, { town: viaName(id) })}</span>
                  </button>
                  <button
                    type="button"
                    className={`${quietButtonClass} min-w-11 px-3`}
                    disabled={index === viaList.length - 1}
                    onClick={() => moveVia(index, 1)}
                  >
                    <span aria-hidden="true">↓</span>
                    <span className="sr-only">{format(m.viaDown, { town: viaName(id) })}</span>
                  </button>
                  <button
                    type="button"
                    className={`${quietButtonClass} min-w-11 px-3`}
                    onClick={() => setViaList(viaList.filter((t) => t !== id))}
                  >
                    <span aria-hidden="true">✕</span>
                    <span className="sr-only">{format(m.viaRemove, { town: viaName(id) })}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className={helpClass}>{m.viaOrderNote}</p>
          </>
        )}
        {viaChoices.length > 0 && viaList.length < 6 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor="trip-via-add" className="block">
                {m.viaAdd}
              </label>
              <select
                id="trip-via-add"
                value={viaPick}
                onChange={(event) => setViaPick(event.target.value)}
                className={fieldClass}
              >
                <option value="">{m.viaAddNone}</option>
                {viaChoices.map((town) => (
                  <option key={town.id} value={town.id}>
                    {town.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={quietButtonClass}
              disabled={viaPick === ""}
              onClick={() => {
                setViaList([...viaList, viaPick]);
                setViaPick("");
              }}
            >
              {m.viaAddButton}
            </button>
          </div>
        )}
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="trip-days" className="block font-bold">
          {m.daysLabel}
        </label>
        <select
          id="trip-days"
          value={trip.days}
          onChange={(event) => onChange(withDays(trip, Number(event.target.value)))}
          className={fieldClass}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? m.daysOne : format(m.daysMany, { n })}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="trip-date" className="block font-bold">
          {m.startDateLabel}
        </label>
        <p id="trip-date-help" className={helpClass}>
          {m.startDateHelp}
        </p>
        <input
          id="trip-date"
          type="date"
          value={trip.startDate ?? ""}
          aria-describedby="trip-date-help"
          onChange={(event) => onChange({ startDate: event.target.value || undefined })}
          className={fieldClass}
        />
      </div>
      {nightCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-bold">{m.nightsHeading}</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="nights-mode"
              checked={!own}
              onChange={() => {
                setOwn(false);
                if (trip.nights) onChange({ nights: undefined });
              }}
              className="size-4"
            />
            {m.nightsAuto}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="nights-mode"
              checked={own}
              onChange={() => setOwn(true)}
              className="size-4"
            />
            {m.nightsOwn}
          </label>
          {own && (
            <div className="space-y-3">
              <p className={helpClass}>{m.nightsNote}</p>
              {Array.from({ length: nightCount }, (_, i) => (
                <TownSelect
                  key={i}
                  id={`trip-night-${i + 1}`}
                  label={format(m.nightLabel, { n: i + 1 })}
                  value={picks[i] ?? ""}
                  towns={placesFor(picks[i] ?? "")}
                  none={m.nightNoren}
                  onChange={(value) => setNight(i, value)}
                />
              ))}
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
