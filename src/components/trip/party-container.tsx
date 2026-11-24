"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useState } from "react";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { deleteTrip, type StoredParty, type StoredTrip } from "@/lib/trip/storage";
import { api } from "../../../convex/_generated/api";
import { linkAlreadyGone } from "./share-controls";
import { PartyKeeps, PartyStep } from "./party-step";
import { PurposeStep } from "./purpose-step";
import { RouteStep, helpClass, quietButtonClass } from "./route-step";
import { TravelStep } from "./travel-step";
import { patchParty, patchTrip, useTrips, type TripPageRegion } from "./use-trips";

export type PartyViewProps = {
  locale: Locale;
  region: TripPageRegion;
  /** Undefined when this phone holds no such trip. */
  trip?: StoredTrip;
  party?: StoredParty;
  canKeep: boolean;
  confirming: boolean;
  deleted: boolean;
  /** Deleting waits for the trip's private link to be switched off. */
  deleting?: boolean;
  /** The link could not be switched off, so the trip is still here. */
  linkProblem?: boolean;
  onTripChange(patch: Partial<StoredTrip>): void;
  onPartyChange(patch: Partial<StoredParty>): void;
  onAskDelete(): void;
  onCancelDelete(): void;
  onDelete(): void;
};

/** Everything Noren holds about the trip and the party, in one place, to change or delete (FR-311). */
export function PartyView(props: PartyViewProps): React.JSX.Element {
  const { locale, region, trip, party } = props;
  const m = messagesFor(tripMessages, locale);
  const back = (
    <Link
      href={localePath(locale, "/trip")}
      className="inline-flex min-h-11 items-center text-ai underline"
    >
      {m.backToTrips}
    </Link>
  );
  if (props.deleted) {
    return (
      <div className="space-y-4" lang={locale}>
        <p role="status" className="font-bold">
          {m.deleted}
        </p>
        {back}
      </div>
    );
  }
  if (!trip || !party) {
    return (
      <div className="space-y-4" lang={locale}>
        <h2 className="font-sans text-[22px] font-bold">{m.notFoundTitle}</h2>
        <p>{m.otherDevice}</p>
        {back}
      </div>
    );
  }
  const guesses = region.trip?.guesses;
  const section = "max-w-2xl space-y-4 border-t border-line pt-6 first:border-t-0 first:pt-0";
  return (
    <div className="space-y-8" lang={locale}>
      <p className="max-w-prose text-[17px]">{m.partyLead}</p>
      <section aria-labelledby="party-kept" className="space-y-2 rounded-[10px] bg-kamenozoki p-4">
        <h2 id="party-kept" className="font-sans text-[18px] font-bold">
          {m.partyHeldHeading}
        </h2>
        <p className="max-w-prose text-[15px]">{m.keptOnPhone}</p>
        <PartyKeeps locale={locale} />
        {!props.canKeep && (
          <p role="alert" className="text-[15px] font-bold text-beni">
            {m.cantKeep}
          </p>
        )}
      </section>
      <section aria-labelledby="party-trip" className={section}>
        <h2 id="party-trip" className="font-sans text-[22px] font-bold">
          {m.tripSection}
        </h2>
        <RouteStep locale={locale} region={region} trip={trip} onChange={props.onTripChange} />
        <PurposeStep
          locale={locale}
          purpose={trip.purpose}
          onChange={(purpose) => props.onTripChange({ purpose })}
        />
      </section>
      <section aria-labelledby="party-party" className={section}>
        <h2 id="party-party" className="font-sans text-[22px] font-bold">
          {m.partySection}
        </h2>
        <PartyStep
          locale={locale}
          party={party}
          tripDays={trip.days}
          onChange={props.onPartyChange}
        />
        {guesses && (
          <TravelStep
            locale={locale}
            party={party}
            guesses={guesses}
            onChange={props.onPartyChange}
          />
        )}
        <label className="flex min-h-11 items-center gap-2 font-bold">
          <input
            type="checkbox"
            checked={party.kept}
            onChange={(event) => props.onPartyChange({ kept: event.target.checked })}
            className="size-4"
          />
          {m.keepParty}
        </label>
        <p className={helpClass}>{m.keepHelp}</p>
      </section>
      <section aria-labelledby="party-delete" className={section}>
        <h2 id="party-delete" className="font-sans text-[22px] font-bold">
          {m.deleteHeading}
        </h2>
        {trip.shareCode && <p className="max-w-prose">{m.shareNote}</p>}
        {props.confirming ? (
          <div role="alertdialog" aria-labelledby="party-delete-ask" className="space-y-3">
            <p id="party-delete-ask" className="max-w-prose font-bold">
              {m.deleteConfirm}
            </p>
            {props.linkProblem && (
              <p role="alert" className="max-w-prose font-bold text-beni">
                {m.deleteLinkProblem}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={props.deleting}
                onClick={props.onDelete}
                className="min-h-11 rounded-[10px] bg-beni px-4 font-bold text-white focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2"
              >
                {m.deleteYes}
              </button>
              <button type="button" className={quietButtonClass} onClick={props.onCancelDelete}>
                {m.deleteNo}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={quietButtonClass} onClick={props.onAskDelete}>
            {m.deleteTrip}
          </button>
        )}
      </section>
      {back}
    </div>
  );
}

export function PartyContainer({
  locale,
  region,
  id,
}: {
  locale: Locale;
  region: TripPageRegion;
  id: string;
}): React.JSX.Element {
  const { data, update, canKeep } = useTrips();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkProblem, setLinkProblem] = useState(false);
  const removeLink = useMutation(api.tripShare.remove);
  const trip = data.trips.find((t) => t.id === id);
  const party = trip && data.parties.find((p) => p.id === trip.partyId);
  return (
    <PartyView
      locale={locale}
      region={region}
      trip={trip}
      party={party}
      canKeep={canKeep}
      confirming={confirming}
      deleted={deleted}
      deleting={deleting}
      linkProblem={linkProblem}
      onTripChange={(patch) => update((d) => patchTrip(d, id, patch))}
      onPartyChange={(patch) => party && update((d) => patchParty(d, party.id, patch))}
      onAskDelete={() => setConfirming(true)}
      onCancelDelete={() => setConfirming(false)}
      onDelete={() => {
        const code = trip?.shareCode;
        const finish = () => {
          update((d) => deleteTrip(d, id));
          setConfirming(false);
          setDeleted(true);
        };
        if (!code) return finish();
        // The private link is switched off before the trip leaves the phone (FR-337). If that
        // cannot be done, the trip stays and the page says so: a link is never left behind quietly.
        setDeleting(true);
        setLinkProblem(false);
        removeLink({ code })
          .then(finish, (error: unknown) => (linkAlreadyGone(error) ? finish() : setLinkProblem(true)))
          .finally(() => setDeleting(false));
      }}
    />
  );
}
