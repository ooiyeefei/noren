"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ErrorMessage } from "@/components/layout/error-message";
import { FactTickList } from "@/components/facts/fact-tick-list";
import type { FactVocabularyItem } from "@/components/facts/fact-list";
import { PlaceCheck } from "@/components/place/place-check";
import { useShownAs } from "@/components/place/use-shown-as";
import { displayName } from "@/lib/connector/present";
import { readLocation } from "@/lib/collection/location";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { factMessages } from "@/lib/i18n/messages/facts";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { getRegionConfig } from "@/lib/region/registry";
import { type StoredParty, type StoredTrip } from "@/lib/trip/storage";
import { buildTripRequest, travellerLabels } from "@/lib/trip/snapshot";
import { fillGuesses } from "@/lib/trip/request";
import type { ChangeOp, Pin, Plan, RegionTripSettings, Stop } from "@/lib/trip/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  commitChange,
  keepStops,
  lastDayPassed,
  planStops,
  recordDone,
  requestChange,
} from "./apply-change";
import { PlanConsentButton, takeFirstPlanApproval } from "./plan-consent";
import { PlanView, type PlaceChoice, type StoredPlan } from "./plan-view";
import { ShareControls } from "./share-controls";
import { roadTowns } from "./route-step";
import type { StopLookup } from "./stop-card";
import { stopInfoFrom } from "./stop-info";
import { patchTrip, useTrips, withDays, type TripPageRegion } from "./use-trips";

// The plan page, wired. The plan, its seed and the organiser's changes live on this phone. What a
// place is called, its quotes and what a met check rests on are read afresh each time the page is
// open, and are never written to the device, so a story that is taken down leaves at once.

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

export { keepStops, planStops };

function StopTools({
  locale,
  regionId,
  placeId,
  confirmed,
}: {
  locale: Locale;
  regionId: string;
  placeId: string;
  confirmed: boolean;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const confirm = useMutation(api.checks.confirm);
  const report = useMutation(api.checks.report);
  const id = placeId as Id<"place">;
  const [open, setOpen] = useState(false);
  const region = getRegionConfig(regionId);
  const vocabulary: FactVocabularyItem[] = (region?.factVocabulary ?? []).map((item) => ({
    key: item.key,
    labels: item.labels,
    labelsReviewedBy: item.labelsReviewedBy,
  }));
  const factText = messagesFor(factMessages, locale);
  return (
    <div className="space-y-3">
      {!confirmed && (
        <PlaceCheck
          locale={locale}
          fromOpenData
          draftName={`check:${placeId}`}
          actions={{
            signedIn: isLoading ? undefined : isAuthenticated,
            confirm: () => confirm({ placeId: id }),
            report: (problem, note) => report({ placeId: id, problem, note: note || undefined }),
          }}
        />
      )}
      {region?.features.facts && vocabulary.length > 0 && (
        <details
          className="rounded-[10px] border border-line"
          onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="min-h-11 cursor-pointer px-4 py-2 font-bold">
            {factText.tellUs}
          </summary>
          <div className="px-4 pb-4">
            {open && <TellUs locale={locale} placeId={id} vocabulary={vocabulary} />}
          </div>
        </details>
      )}
    </div>
  );
}

function TellUs({
  locale,
  placeId,
  vocabulary,
}: {
  locale: Locale;
  placeId: Id<"place">;
  vocabulary: FactVocabularyItem[];
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const person = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const shownAs = useShownAs(person);
  const facts = useQuery(api.facts.forPlace, { placeId });
  const reportFact = useMutation(api.facts.report);
  const removeFact = useMutation(api.facts.remove);
  return (
    <FactTickList
      locale={locale}
      vocabulary={vocabulary}
      actions={{
        signedIn: isLoading ? undefined : isAuthenticated,
        shownAs,
        mine: Object.fromEntries(
          (facts ?? []).flatMap((fact) =>
            fact.basis === "member" && fact.addedByMe
              ? [[fact.key, { factId: fact._id, value: fact.value }]]
              : [],
          ),
        ),
        report: (key, value) => reportFact({ placeId, key, value }),
        remove: (factId) => removeFact({ factId: factId as Id<"placeFact"> }),
      }}
    />
  );
}

function PlaceListLoader({
  regionId,
  on,
  children,
}: {
  regionId: string;
  on: boolean;
  children(places: PlaceChoice[] | undefined): React.ReactNode;
}) {
  const listed = useQuery(api.places.listForMap, on ? { regionId } : "skip");
  const region = getRegionConfig(regionId);
  const places = listed
    ?.filter((place) => !place.isMock && place.pin !== null)
    .map((place) => ({
      placeId: place._id,
      slug: place.slug,
      name: region ? displayName(place, region) : place.slug,
      searchable: place.names.map((name) => name.value),
      pin: place.pin!,
    }));
  return <>{children(on ? places : undefined)}</>;
}

function guessesOf(party: StoredParty, region: RegionTripSettings) {
  try {
    return fillGuesses(party, region).guessed;
  } catch {
    return [];
  }
}

/** The plan page for a trip kept on this phone. */
export function PlanContainer({
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
  const { isLoading, isAuthenticated } = useConvexAuth();
  const plan = useAction(api.tripActions.plan);
  const trip = data.trips.find((t) => t.id === id);
  const party = trip && data.parties.find((p) => p.id === trip.partyId);
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<unknown>(null);
  const [problem, setProblem] = useState<"failed" | "offline">();
  const [refused, setRefused] = useState<Plan["unmet"]>();
  const [wantPlaces, setWantPlaces] = useState(false);
  // The organiser's names for pins added in this visit, until the change is written to the device.
  const newPins = useRef(new Map<string, string>());
  const settings = region as unknown as RegionTripSettings;

  const ids = trip?.plan
    ? [
        ...new Set(
          [
            ...planStops(trip.plan).flatMap((s) => ("placeId" in s.place ? [s.place.placeId] : [])),
            ...trip.pins.flatMap((p) => (p.placeId ? [p.placeId] : [])),
          ].slice(0, 84),
        ),
      ]
    : [];
  const stopRows = useQuery(
    api.trips.stops,
    isAuthenticated && ids.length > 0 ? { placeIds: ids } : "skip",
  );

  async function makePlan(next: StoredTrip, from: StoredParty, fresh: boolean) {
    setBusy(true);
    setPlanError(null);
    try {
      const result = await plan({
        request: buildTripRequest(next, from, settings),
        ...(fresh ? {} : next.seed ? { seed: next.seed } : {}),
      });
      update((d) => ({
        ...patchTrip(d, next.id, {
          days: next.days,
          nights: next.nights,
          pins: next.pins,
          plan: { ...(result.plan as Plan), done: [], skipped: [] },
          seed: result.seed,
          avoid: [],
          previous: undefined,
        }),
      }));
    } catch (error) {
      setPlanError(error);
    } finally {
      setBusy(false);
    }
  }

  // Opening an unfinished trip directly leaves the send button for the organiser to press.
  useEffect(() => {
    if (!trip || !party || trip.plan || isLoading || !isAuthenticated || !online) return;
    const send = window.setTimeout(() => {
      if (takeFirstPlanApproval(trip.id)) void makePlan(trip, party, false);
    }, 0);
    return () => window.clearTimeout(send);
    // makePlan reads the latest trip and party through the arguments given here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, trip?.plan, party?.id, isLoading, isAuthenticated, online]);

  // A trip is under way once its start date arrives.
  useEffect(() => {
    if (!trip?.plan || trip.status !== "planning" || !trip.startDate) return;
    const today = new Date().toLocaleDateString("en-CA");
    if (trip.startDate <= today) update((d) => patchTrip(d, trip.id, { status: "under_way" }));
  }, [trip?.id, trip?.plan, trip?.status, trip?.startDate, update]);

  // A trip is over once the last day it planned has passed.
  useEffect(() => {
    if (!trip?.plan || trip.status === "finished") return;
    if (lastDayPassed(trip.plan, new Date().toLocaleDateString("en-CA"))) {
      update((d) => patchTrip(d, trip.id, { status: "finished" }));
    }
  }, [trip?.id, trip?.plan, trip?.status, update]);

  const back = (
    <Link
      href={localePath(locale, "/trip")}
      className="inline-flex min-h-11 items-center text-ai underline"
    >
      {m.backToTrips}
    </Link>
  );
  if (!mounted) return <p role="status">{m.planOpening}</p>;
  if (!trip || !party) {
    return (
      <div className="max-w-prose space-y-4" lang={locale}>
        <h2 className="font-sans text-[22px] font-bold">{m.notFoundTitle}</h2>
        <p>{m.otherDevice}</p>
        <p>{m.notHereHelp}</p>
        {back}
      </div>
    );
  }
  if (!trip.plan) {
    return (
      <div className="max-w-prose space-y-4" lang={locale}>
        {planError ? (
          <>
            <p role="alert" className="font-bold text-beni">
              {m.planFailed}
            </p>
            <ErrorMessage error={planError} locale={locale} />
          </>
        ) : busy || !online ? (
          <p role="status">{!online ? m.planOffline : m.planMaking}</p>
        ) : null}
        {!busy && (
          <PlanConsentButton
            locale={locale}
            label={planError ? m.planRetry : m.planNow}
            disabled={!online || isLoading || !isAuthenticated}
            onClick={() => void makePlan(trip, party, false)}
          />
        )}
        {back}
      </div>
    );
  }

  const tripPlan: StoredPlan = trip.plan;
  const done = tripPlan.done;
  const regionId = trip.regionId;
  const labels = travellerLabels(party);

  async function change(ops: ChangeOp[], saidAs: string, replaced: { slot: string }[] = []) {
    if (!trip || !party || !trip.plan || !trip.seed) return;
    if (!online) {
      setProblem("offline");
      return;
    }
    setBusy(true);
    setProblem(undefined);
    setRefused(undefined);
    try {
      const result = await requestChange({
        trip,
        party,
        settings,
        plan,
        ops,
        replaced: replaced.map((r) => r.slot),
      });
      // A refused change leaves the plan on screen, and on the phone, exactly as it was.
      if (result.kind === "refused") setRefused(result.unmet);
      else update((d) => commitChange(d, trip.id, result, { saidAs, ops }, newPins.current));
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  }

  const stopInfoFor = (placeId: string): StopLookup => {
    const raw = stopRows ? (stopRows[ids.indexOf(placeId)] ?? null) : undefined;
    if (raw === null) return { state: "gone" };
    if (raw) return { state: "ready", info: stopInfoFrom(raw, regionId, locale) };
    return !online || !isAuthenticated ? { state: "offline" } : { state: "loading" };
  };
  const townName = (id: string) => roadTowns(region, locale).find((t) => t.id === id)?.name ?? id;
  const shareTitle = format(m.tripRoute, { from: townName(trip.start), to: townName(trip.end) }).slice(0, 80);
  const pinById = (pinId: string) => trip.pins.find((p) => p.id === pinId);
  const placeIdOf = (stop: Stop): string | undefined =>
    "placeId" in stop.place ? stop.place.placeId : pinById(stop.place.pinId)?.placeId;
  const lookupFor = (stop: Stop): StopLookup => {
    const placeId = placeIdOf(stop);
    return placeId ? stopInfoFor(placeId) : { state: "spot" };
  };

  return (
    <PlaceListLoader regionId={regionId} on={wantPlaces}>
      {(places) => (
        <PlanView
          locale={locale}
          region={region}
          tripId={trip.id}
          start={trip.start}
          plan={tripPlan}
          partyDescribed={party.travellers.length > 0}
          guessed={guessesOf(party, settings)}
          labels={labels}
          travellers={party.travellers.map((t) => ({
            key: t.key,
            label: t.label,
            hasLikes: t.likes.length > 0,
            days: t.days,
          }))}
          pinLabels={Object.fromEntries(trip.pins.map((p) => [p.id, p.label]))}
          pins={trip.pins.map(({ id: pinId, label, day }) => ({ id: pinId, label, day }))}
          lookupFor={lookupFor}
          toolsFor={(stop) => {
            const placeId = placeIdOf(stop);
            const lookup = lookupFor(stop);
            return placeId && lookup.state === "ready" ? (
              <StopTools
                locale={locale}
                regionId={regionId}
                placeId={placeId}
                confirmed={lookup.info.confirmed}
              />
            ) : undefined;
          }}
          busy={busy}
          offline={!online}
          problem={problem}
          refused={refused}
          onDismissRefused={() => setRefused(undefined)}
          finished={trip.status === "finished"}
          onFinish={() => update((d) => patchTrip(d, trip.id, { status: "finished" }))}
          shareSlot={
            <ShareControls
              locale={locale}
              trip={trip}
              party={party}
              online={online}
              defaultTitle={shareTitle}
              onCode={(code) => update((d) => patchTrip(d, trip.id, { shareCode: code }))}
            />
          }
          places={places}
          onWantPlaces={() => setWantPlaces(true)}
          locate={async () => {
            const here = await readLocation(navigator.geolocation);
            return here.kind === "read" ? { lat: here.lat, lng: here.lng } : null;
          }}
          onRedraw={(slot) => void change([{ op: "redraw", slot }], m.drawAnother, [{ slot }])}
          onSkip={(slot) => void change([{ op: "skip", slot }], m.skipStop, [{ slot }])}
          onDone={(slot) => {
            if (done.includes(slot)) return;
            update((d) => recordDone(d, trip.id, slot, m.doneStop));
          }}
          onTurn={(who, day) =>
            void change(
              [{ op: "more_for", who, day }],
              format(m.turnGive, { label: labels[who]?.trim() || m.turnSomeone }),
            )
          }
          onAddDay={
            trip.days < 7 && online
              ? () => void makePlan({ ...trip, ...withDays(trip, trip.days + 1) }, party, true)
              : undefined
          }
          onAddPin={(pin) => {
            if (trip.pins.length >= 12) {
              setProblem("failed");
              return;
            }
            const full: Pin = {
              id: crypto.randomUUID(),
              day: pin.day,
              minutes: pin.minutes,
              pin: pin.pin,
              ...(pin.at && { at: pin.at }),
              ...(pin.placeId && { placeId: pin.placeId }),
            };
            newPins.current.set(full.id, pin.label);
            void change([{ op: "add_pin", pin: full }], m.pinSave);
          }}
          onReplan={done.length === 0 ? () => void makePlan(trip, party, true) : undefined}
        />
      )}
    </PlaceListLoader>
  );
}
