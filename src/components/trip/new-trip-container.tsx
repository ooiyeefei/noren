"use client";

import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { messagesFor, localePath, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { StoredParty, StoredTrip } from "@/lib/trip/storage";
import { VoiceInput } from "@/components/voice/voice-input";
import { api } from "../../../convex/_generated/api";
import { applyProposal } from "./own-words-apply";
import { OwnWordsBox } from "./own-words-box";
import { nextKey, PartyStep } from "./party-step";
import { approveFirstPlan, PlanConsentButton } from "./plan-consent";
import { PurposeStep } from "./purpose-step";
import { RouteStep, quietButtonClass } from "./route-step";
import { RulesReadback } from "./rules-readback";
import { TravelStep } from "./travel-step";
import {
  blankParty,
  blankTrip,
  patchParty,
  patchTrip,
  resumable,
  useTrips,
  withDraft,
  type TripPageRegion,
} from "./use-trips";

export const STEPS = ["route", "purpose", "party", "travel", "check"] as const;
export type Step = (typeof STEPS)[number];

export type NewTripViewProps = {
  locale: Locale;
  region: TripPageRegion;
  trip: StoredTrip;
  party: StoredParty;
  step: Step;
  /** What stopped the last "Plan now", if anything. */
  problem?: "needs_route" | "limit";
  canKeep: boolean;
  onStep(step: Step): void;
  onTripChange(patch: Partial<StoredTrip>): void;
  onPartyChange(patch: Partial<StoredParty>): void;
  onPlan(): void;
  /** The box to say it in your own words, shown beside the questions that describe the party. */
  ownWords?: React.ReactNode;
};

/** Whether this step has an answer yet: the one way on reads "Skip this" until it does. */
function answered(step: Step, trip: StoredTrip, party: StoredParty): boolean {
  switch (step) {
    case "route":
      return trip.start !== "" || trip.end !== "" || trip.startDate !== undefined;
    case "purpose":
      return trip.purpose.trim() !== "";
    case "party":
      return party.travellers.length > 0;
    case "travel":
      return (
        party.limits !== undefined ||
        party.meals !== undefined ||
        party.fullness !== undefined ||
        party.needs.length > 0
      );
    default:
      return true;
  }
}

/**
 * The questions, one step at a time. Every step can be skipped, the steps can be visited in any
 * order, and "Plan now" is on every one. It holds no state of its own: each answer goes straight to
 * the handlers, which save it to the device.
 */
export function NewTripView(props: NewTripViewProps): React.JSX.Element {
  const { locale, region, trip, party, step } = props;
  const m = messagesFor(tripMessages, locale);
  const guesses = region.trip?.guesses;
  const steps = STEPS.filter((s) => s !== "travel" || guesses !== undefined);
  const labels: Record<Step, string> = {
    route: m.stepRoute,
    purpose: m.stepPurpose,
    party: m.stepParty,
    travel: m.stepTravel,
    check: m.stepCheck,
  };
  const index = steps.indexOf(step);
  const previous = index > 0 ? steps[index - 1] : undefined;
  const following = index >= 0 && index < steps.length - 1 ? steps[index + 1] : undefined;
  return (
    <div className="space-y-6" lang={locale}>
      <p className="max-w-prose">{m.skippable}</p>
      {!props.canKeep && (
        <p role="alert" className="font-bold text-beni">
          {m.cantKeep}
        </p>
      )}
      <nav aria-label={m.stepsLabel}>
        <ol className="flex flex-wrap gap-2">
          {steps.map((s) => (
            <li key={s}>
              <button
                type="button"
                aria-current={s === step ? "step" : undefined}
                onClick={() => props.onStep(s)}
                className={
                  s === step
                    ? "min-h-11 rounded-full bg-kon px-4 font-bold text-white"
                    : "min-h-11 rounded-full border border-line bg-white px-4 text-kon hover:bg-kamenozoki"
                }
              >
                {labels[s]}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="max-w-2xl space-y-6">
        {step === "route" && (
          <RouteStep locale={locale} region={region} trip={trip} onChange={props.onTripChange} />
        )}
        {step === "purpose" && (
          <PurposeStep
            locale={locale}
            purpose={trip.purpose}
            onChange={(purpose) => props.onTripChange({ purpose })}
          />
        )}
        {step === "party" && (
          <PartyStep
            locale={locale}
            party={party}
            tripDays={trip.days}
            onChange={props.onPartyChange}
          />
        )}
        {(step === "party" || step === "purpose") && props.ownWords}
        {step === "travel" && guesses && (
          <TravelStep
            locale={locale}
            party={party}
            guesses={guesses}
            onChange={props.onPartyChange}
          />
        )}
        {step === "check" && (
          <RulesReadback
            locale={locale}
            party={party}
            onConfirm={props.onPlan}
            onChange={() => props.onStep("party")}
          />
        )}
      </div>
      {props.problem === "needs_route" && (
        <p role="alert" className="font-bold text-beni">
          {m.planNeedsRoute}
        </p>
      )}
      {props.problem === "limit" && (
        <p role="alert" className="font-bold text-beni">
          {m.limitReached}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {previous && (
          <button type="button" className={quietButtonClass} onClick={() => props.onStep(previous)}>
            {m.back}
          </button>
        )}
        {following && (
          <button
            type="button"
            className={quietButtonClass}
            onClick={() => props.onStep(following)}
          >
            {answered(step, trip, party) ? m.next : m.skip}
          </button>
        )}
        {step !== "check" && (
          <div className="w-full">
            <PlanConsentButton locale={locale} label={m.planNow} onClick={props.onPlan} />
          </div>
        )}
      </div>
    </div>
  );
}

// Whether the organiser has been told, once, what is sent where. Kept on this phone with the trips.
const NOTICE_KEY = "noren.trips.own-words-notice.v1";
const noticeListeners = new Set<() => void>();
function noticeSnapshot(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}
export function useNoticeSeen(): [boolean | undefined, () => void] {
  const seen = useSyncExternalStore(
    (notify) => {
      noticeListeners.add(notify);
      return () => noticeListeners.delete(notify);
    },
    noticeSnapshot,
    () => undefined,
  );
  return [
    seen,
    () => {
      try {
        window.localStorage.setItem(NOTICE_KEY, "1");
      } catch {
        // The notice is then shown again next time, which is the safe way to fail.
      }
      noticeListeners.forEach((notify) => notify());
    },
  ];
}

/** The questions, wired to the device. A draft that has no plan yet is picked up where it was left. */
export function NewTripContainer({
  locale,
  region,
}: {
  locale: Locale;
  region: TripPageRegion;
}): React.JSX.Element {
  const router = useRouter();
  const { data, update, canKeep } = useTrips();
  const [blank] = useState(() => {
    const partyId = crypto.randomUUID();
    return { trip: blankTrip(crypto.randomUUID(), partyId, region.id), party: blankParty(partyId) };
  });
  const [step, setStep] = useState<Step>("route");
  const [problem, setProblem] = useState<NewTripViewProps["problem"]>();
  const saved = resumable(data);
  const trip = saved ?? blank.trip;
  const party = data.parties.find((p) => p.id === trip.partyId) ?? blank.party;
  const save = (change: (d: typeof data) => typeof data) => {
    try {
      update((current) => change(withDraft(current, trip, party)));
      setProblem(undefined);
    } catch {
      setProblem("limit");
    }
  };
  const interpret = useAction(api.tripActions.interpret);
  const [noticeSeen, markNoticeSeen] = useNoticeSeen();
  return (
    <NewTripView
      locale={locale}
      ownWords={
        <OwnWordsBox
          locale={locale}
          travellers={party.travellers.map(({ key, label }) => ({ key, label }))}
          noticeSeen={noticeSeen}
          onNoticeSeen={markNoticeSeen}
          canAddTraveller={nextKey(party) !== undefined}
          interpret={(words) =>
            interpret({ messages: [{ role: "user", text: words }], outline: [], language: locale })
          }
          voice={(onText) => <VoiceInput locale={locale} onText={onText} />}
          onAccept={(proposal, who) => {
            if (who && "fresh" in who) {
              const key = nextKey(party);
              if (key === undefined) return;
              const added = {
                ...party,
                travellers: [
                  ...party.travellers,
                  { key, label: who.fresh, ageBand: "adult" as const, rules: [], likes: [], skips: [] },
                ],
              };
              save((d) => patchParty(d, party.id, applyProposal(added, proposal, key)));
              return;
            }
            save((d) => patchParty(d, party.id, applyProposal(party, proposal, who?.key)));
          }}
        />
      }
      region={region}
      trip={trip}
      party={party}
      step={step}
      problem={problem}
      canKeep={canKeep}
      onStep={setStep}
      onTripChange={(patch) => save((d) => patchTrip(d, trip.id, patch))}
      onPartyChange={(patch) => save((d) => patchParty(d, party.id, patch))}
      onPlan={() => {
        if (trip.start === "" || trip.end === "") {
          setStep("route");
          setProblem("needs_route");
          return;
        }
        approveFirstPlan(trip.id);
        router.push(localePath(locale, `/trip/${trip.id}`));
      }}
    />
  );
}
