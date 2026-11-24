"use client";

import Link from "next/link";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { StoredTrip } from "@/lib/trip/storage";
import { buttonClass, quietButtonClass, roadTowns } from "./route-step";
import { tripGroup, useTrips, type TripPageRegion } from "./use-trips";

const GROUPS = ["underWay", "planned", "notPlanned", "finished"] as const;

export type TripsViewProps = {
  locale: Locale;
  region: TripPageRegion;
  trips: readonly StoredTrip[];
  canKeep: boolean;
};

/**
 * The trips on this phone: under way first, then planned, then those not yet planned, then
 * finished. It says plainly that they are kept here, and nowhere else.
 */
export function TripsView({ locale, region, trips, canKeep }: TripsViewProps): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const names = new Map(roadTowns(region, locale).map((t) => [t.id, t.name]));
  const groupLabel = {
    underWay: m.groupUnderWay,
    planned: m.groupPlanned,
    notPlanned: m.groupNotPlanned,
    finished: m.groupFinished,
  };
  return (
    <div className="space-y-8" lang={locale}>
      <section aria-labelledby="trip-kept" className="space-y-2 rounded-[10px] bg-kamenozoki p-4">
        <h2 id="trip-kept" className="font-sans text-[18px] font-bold">
          {m.keptOnPhone}
        </h2>
        <p className="max-w-prose text-[15px]">{m.keptDetail}</p>
        {!canKeep && (
          <p role="alert" className="text-[15px] font-bold text-beni">
            {m.cantKeep}
          </p>
        )}
      </section>
      <div>
        <Link
          href={localePath(locale, "/trip/new")}
          className={`${buttonClass} inline-flex items-center`}
        >
          {m.planATrip}
        </Link>
      </div>
      {trips.length === 0 && <p className="max-w-prose">{m.noTrips}</p>}
      {GROUPS.map((group) => {
        const inGroup = trips.filter((trip) => tripGroup(trip) === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`trips-${group}`} className="space-y-3">
            <h2 id={`trips-${group}`} className="font-sans text-[22px] font-bold">
              {groupLabel[group]}
            </h2>
            <ul className="space-y-3">
              {inGroup.map((trip) => {
                const route =
                  trip.start && trip.end
                    ? format(m.tripRoute, {
                        from: names.get(trip.start) ?? trip.start,
                        to: names.get(trip.end) ?? trip.end,
                      })
                    : m.routeUnknown;
                return (
                  <li
                    key={trip.id}
                    className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-bold break-words">{route}</p>
                      <p className="text-[14px] text-muted-foreground">
                        {trip.days === 1 ? m.daysOne : format(m.daysMany, { n: trip.days })}
                        {trip.startDate ? `, ${format(m.startsOn, { date: trip.startDate })}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={localePath(
                          locale,
                          group === "notPlanned" ? "/trip/new" : `/trip/${trip.id}`,
                        )}
                        className={`${buttonClass} inline-flex items-center`}
                      >
                        {group === "notPlanned" ? m.carryOn : m.openPlan}
                      </Link>
                      <Link
                        href={localePath(locale, `/trip/${trip.id}/party`)}
                        className={`${quietButtonClass} inline-flex items-center`}
                      >
                        {m.holdLink}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function TripsContainer({
  locale,
  region,
}: {
  locale: Locale;
  region: TripPageRegion;
}): React.JSX.Element {
  const { data, canKeep } = useTrips();
  return <TripsView locale={locale} region={region} trips={data.trips} canKeep={canKeep} />;
}
