"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { VoiceInput } from "@/components/voice/voice-input";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { undoLastChange } from "@/lib/trip/storage";
import { travellerLabels } from "@/lib/trip/snapshot";
import type { ChangeOp, Plan, RegionTripSettings, Stop } from "@/lib/trip/types";
import { api } from "../../../convex/_generated/api";
import { commitChange, dayForToday, planStops, requestChange } from "./apply-change";
import {
  ChangeView,
  ChangeWords,
  type ChangeEntry,
  type LastResult,
  type MovedLine,
  type OpNames,
} from "./change-view";
import { useNoticeSeen } from "./new-trip-container";
import { roadTowns } from "./route-step";
import { stopInfoFrom } from "./stop-info";
import { useTrips, type TripPageRegion } from "./use-trips";

// The change page, wired. The plan and the list of changes live on this phone; a change by button
// calls the planning action with the stops it must leave alone and no model. Names of places are
// read afresh and never written to the device.

function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

type RawLast =
  | { kind: "applied"; saidAs: string; moved: NonNullable<Plan["moved"]>; unmet: Plan["unmet"] }
  | { kind: "refused"; unmet: Plan["unmet"] }
  | { kind: "undone" };

export function ChangeContainer({
  locale,
  region,
  id,
}: {
  locale: Locale;
  region: TripPageRegion;
  id: string;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const mounted = useMounted();
  const online = useOnline();
  const { data, update } = useTrips();
  const { isAuthenticated } = useConvexAuth();
  const plan = useAction(api.tripActions.plan);
  const interpret = useAction(api.tripActions.interpret);
  const [noticeSeen, markNoticeSeen] = useNoticeSeen();
  const trip = data.trips.find((t) => t.id === id);
  const party = trip && data.parties.find((p) => p.id === trip.partyId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"failed" | "offline">();
  const [last, setLast] = useState<RawLast>();
  const settings = region as unknown as RegionTripSettings;

  // Places to name: those in the plan and in the recent changes, read afresh each time.
  const pinIds = new Set(trip?.pins.map((p) => p.id));
  const ids = trip?.plan
    ? [
        ...new Set(
          [
            ...planStops(trip.plan).flatMap((s) => ("placeId" in s.place ? [s.place.placeId] : [])),
            ...trip.pins.flatMap((p) => (p.placeId ? [p.placeId] : [])),
            ...trip.changes
              .slice(-10)
              .flatMap((c) => c.moved.flatMap((line) => [line.was, line.now]))
              .flatMap((key) => (key !== undefined && !pinIds.has(key) ? [key] : [])),
          ].slice(0, 84),
        ),
      ]
    : [];
  const rows = useQuery(
    api.trips.stops,
    isAuthenticated && ids.length > 0 ? { placeIds: ids } : "skip",
  );

  if (!mounted) return <p role="status">{m.planOpening}</p>;
  const back = (
    <Link
      href={localePath(locale, "/trip")}
      className="inline-flex min-h-11 items-center text-ai underline"
    >
      {m.backToTrips}
    </Link>
  );
  if (!trip || !party) {
    return (
      <div className="max-w-prose space-y-4" lang={locale}>
        <h2 className="font-sans text-[22px] font-bold">{m.notFoundTitle}</h2>
        <p>{m.otherDevice}</p>
        {back}
      </div>
    );
  }
  const tripPlan = trip.plan;
  if (!tripPlan) {
    return (
      <div className="max-w-prose space-y-4" lang={locale}>
        <p>{m.changeNoPlan}</p>
        <Link
          href={localePath(locale, `/trip/${encodeURIComponent(trip.id)}`)}
          className="inline-flex min-h-11 items-center text-ai underline"
        >
          {m.changeBackToPlan}
        </Link>
      </div>
    );
  }

  const labels = travellerLabels(party);
  const towns = roadTowns(region, locale).filter((t) => t.town);
  const townName = (townId: string) => roadTowns(region, locale).find((t) => t.id === townId)?.name ?? townId;
  /** A place or a pin by the key a change stores: a name, or undefined when it is not known. */
  const nameOfKey = (key: string | undefined): string | undefined => {
    if (key === undefined) return undefined;
    const pin = trip.pins.find((p) => p.id === key);
    if (pin) return pin.label.trim() || m.movedPin;
    const row = rows?.[ids.indexOf(key)];
    return row ? stopInfoFrom(row, trip.regionId, locale).name : undefined;
  };
  const nameOfStop = (stop: Stop) =>
    nameOfKey("placeId" in stop.place ? stop.place.placeId : stop.place.pinId);
  const stopsBySlot = new Map(planStops(tripPlan).map((s) => [s.slot, s]));
  const dayOfSlot = (slot: string) =>
    tripPlan.days.find((d) => d.items.some((i) => i.kind === "stop" && i.slot === slot))?.index;
  const lines = (moved: readonly { slot: string; was?: string; now?: string; why: string }[]): MovedLine[] =>
    moved.map((line) => ({
      slot: line.slot,
      day: dayOfSlot(line.slot),
      was: nameOfKey(line.was),
      // A stop marked done is named by the place it is, which is the plan's own.
      now: line.why === "done" ? nameOfStop(stopsBySlot.get(line.slot)!) : nameOfKey(line.now),
      why: line.why,
    }));
  const names: OpNames = {
    who: (key) => labels[key]?.trim() || m.turnSomeone,
    stop: (slot) => {
      const stop = stopsBySlot.get(slot);
      return (stop && nameOfStop(stop)) || m.movedUnknown;
    },
    town: townName,
  };
  const today = new Date().toLocaleDateString("en-CA");

  async function apply(ops: ChangeOp[], saidAs: string) {
    if (!trip || !party || !trip.plan) return;
    if (!online) {
      setProblem("offline");
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      const result = await requestChange({
        trip,
        party,
        settings,
        plan,
        ops,
        replaced: ops.flatMap((op) => (op.op === "redraw" || op.op === "skip" ? [op.slot] : [])),
      });
      if (result.kind === "refused") {
        // The plan on screen and on the phone stay exactly as they were.
        setLast({ kind: "refused", unmet: result.unmet });
      } else {
        update((d) => commitChange(d, trip.id, result, { saidAs, ops }));
        setLast({ kind: "applied", saidAs, moved: result.plan.moved ?? [], unmet: result.unmet });
      }
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  }

  const shown: LastResult | undefined =
    last?.kind === "applied"
      ? { kind: "applied", saidAs: last.saidAs, moved: lines(last.moved), unmet: last.unmet }
      : last;
  const entries: ChangeEntry[] = trip.changes.map((c) => ({
    at: c.at,
    saidAs: c.saidAs,
    moved: lines(c.moved),
  }));
  const outline = planStops(tripPlan)
    .slice(0, 84)
    .map((stop) => ({
      day: dayOfSlot(stop.slot) ?? 1,
      slot: stop.slot,
      ...(nameOfStop(stop) && { placeName: nameOfStop(stop)!.slice(0, 200) }),
      kind: "stop",
    }));
  const changeTravellers = party.travellers.map((t) => ({
    key: t.key,
    label: t.label,
    hasLikes: t.likes.length > 0,
  }));

  return (
    <ChangeView
      locale={locale}
      tripId={trip.id}
      days={tripPlan.days.map((day) => ({
        index: day.index,
        stops: day.items.flatMap((item) =>
          item.kind === "stop"
            ? [
                {
                  slot: item.slot,
                  name: nameOfStop(item) ?? m.movedUnknown,
                  done: tripPlan.done.includes(item.slot),
                },
              ]
            : [],
        ),
      }))}
      nightCount={Math.max(0, tripPlan.days.length - 1)}
      towns={towns}
      travellers={changeTravellers}
      today={dayForToday(tripPlan, tripPlan.done, today)}
      busy={busy}
      offline={!online}
      problem={problem}
      last={shown}
      onDismissLast={() => setLast(undefined)}
      canUndo={trip.previous !== undefined}
      onUndo={() => {
        update((d) => ({ ...d, trips: d.trips.map((t) => (t.id === trip.id ? undoLastChange(t) : t)) }));
        setProblem(undefined);
        setLast({ kind: "undone" });
      }}
      changes={entries}
      names={names}
      onChange={(ops, saidAs) => void apply(ops, saidAs)}
      words={
        <ChangeWords
          locale={locale}
          travellers={changeTravellers}
          names={names}
          noticeSeen={noticeSeen}
          onNoticeSeen={markNoticeSeen}
          busy={busy || !online}
          interpret={(words) =>
            interpret({ messages: [{ role: "user", text: words }], outline, language: locale })
          }
          onApply={(op, saidAs) => void apply([op], saidAs)}
          voice={(onText) => <VoiceInput locale={locale} onText={onText} />}
        />
      }
    />
  );
}
