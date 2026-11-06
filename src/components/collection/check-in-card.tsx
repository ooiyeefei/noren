"use client";

import { useRef, useState } from "react";
import { ErrorMessage } from "@/components/layout/error-message";
import { neighbourhoodName } from "@/components/explore/mission-bar";
import type { LocationRead } from "@/lib/collection/location";
import { withinReach } from "@/lib/collection/reach";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { distanceMetres } from "@/lib/overture/dedupe";
import { cn } from "@/lib/utils";
import { CheckInResult, PeopleMention, type CheckInResultActions } from "./check-in-result";
import { NextPanelCard, type SetLike } from "./next-panel-card";
import type { PublicRegionProps } from "@/components/public/mapping";

export type CheckInSpot = {
  neighbourhoodId: string;
  setNames: Readonly<Record<string, string>>;
  panelIndex: number;
  panelCount: number;
  visited: boolean;
  panelDyed: boolean;
  dyedPanels: readonly number[];
  pickedLine: { en: string; ja: string; postsRead: number } | null;
};

export type CheckInOutcome = {
  outcome: "dyed" | "already_dyed" | "already_here";
  panelIndex: number;
  dyedCount: number;
  panelCount: number;
  finished: boolean;
};

/** What the page can do about a check-in; the container wires these to the phone and to Convex. */
export type CheckInActions = CheckInResultActions & {
  /** Undefined while sign-in is still loading. */
  signedIn: boolean | undefined;
  locate(): Promise<LocationRead>;
  checkIn(): Promise<CheckInOutcome>;
};

type Reach = PublicRegionProps["checkIn"];
type Verdict =
  | { kind: "near" }
  | { kind: "far"; metres: number }
  | { kind: "denied" | "unavailable" | "timeout" | "unsupported" };

/** FR-104, on the phone: the reading is judged here and goes no further. */
export function judgeReading(
  read: LocationRead,
  pin: { lat: number; lng: number },
  reach: Reach,
): Verdict {
  if (read.kind !== "read") return { kind: read.kind };
  const metres = distanceMetres(pin, read);
  return withinReach(metres, read.accuracy, reach)
    ? { kind: "near" }
    : { kind: "far", metres: Math.round(metres) };
}

type Step =
  | { kind: "ready" | "reading" | "sending" }
  | { kind: "far"; metres: number }
  | { kind: "denied" | "unavailable" | "timeout" | "unsupported" }
  | { kind: "failed"; error: unknown };

const BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 font-bold text-white disabled:opacity-50";

/** Which panel this place gives, among the ones the person already has. */
function Pips({ spot }: { spot: CheckInSpot }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 gap-0.5">
      {Array.from({ length: spot.panelCount }, (_, index) => (
        <i
          key={index}
          className={cn(
            "block h-3.5 w-[7px] border",
            index === spot.panelIndex
              ? "border-kasutera bg-kasutera"
              : spot.dyedPanels.includes(index)
                ? "border-kon bg-kon"
                : "border-line bg-kamenozoki",
          )}
        />
      ))}
    </span>
  );
}

/**
 * "I'm here" on a place that fills a panel. The location is read on the press and at no other
 * moment, and a press that fails records nothing and says what to do next (FR-104 to FR-106).
 */
export function CheckInCard({
  locale,
  region,
  slug,
  pin,
  spot,
  set,
  stamp,
  displayName,
  actions,
}: {
  locale: Locale;
  region: PublicRegionProps;
  slug: string;
  pin: { lat: number; lng: number };
  spot: CheckInSpot;
  set?: SetLike | null;
  /** The place's stamp, shown in the result once the person holds it. */
  stamp?: React.ReactNode;
  displayName?: string;
  actions: CheckInActions;
}) {
  const m = messagesFor(collectionMessages, locale);
  const [step, setStep] = useState<Step>({ kind: "ready" });
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const busy = useRef(false);
  const name = neighbourhoodName(spot.setNames, locale);
  const panel = String(spot.panelIndex + 1);
  const setHref = localePath(locale, `/collection/${spot.neighbourhoodId}`);
  async function press() {
    if (busy.current) return;
    busy.current = true;
    setStep({ kind: "reading" });
    try {
      const verdict = judgeReading(await actions.locate(), pin, region.checkIn);
      if (verdict.kind !== "near") {
        setStep(verdict);
        return;
      }
      setStep({ kind: "sending" });
      setOutcome(await actions.checkIn());
      setStep({ kind: "ready" });
    } catch (error) {
      setStep({ kind: "failed", error });
    } finally {
      busy.current = false;
    }
  }
  if (outcome)
    return (
      <CheckInResult
        locale={locale}
        region={region}
        outcome={outcome}
        pin={pin}
        spot={spot}
        set={set}
        stamp={stamp}
        displayName={displayName}
        setHref={setHref}
        actions={actions}
      />
    );
  if (spot.visited)
    return (
      <section
        data-check-in="visited"
        className="space-y-3 rounded-[10px] border border-line p-4 text-[15px]"
      >
        <p className="flex items-center gap-2 font-bold">
          <Pips spot={spot} />
          <span className="min-w-0">{format(m.visited, { name, panel })}</span>
        </p>
        {spot.pickedLine && <PeopleMention locale={locale} line={spot.pickedLine} />}
        {set && <NextPanelCard locale={locale} region={region} set={set} from={pin} />}
        <a className="inline-flex min-h-11 items-center text-ai underline" href={setHref}>
          {format(m.seeNoren, { name })}
        </a>
      </section>
    );
  const message =
    step.kind === "reading"
      ? m.reading
      : step.kind === "sending"
        ? m.sending
        : step.kind === "denied"
          ? m.denied
          : step.kind === "unavailable" || step.kind === "timeout"
            ? m.unavailable
            : step.kind === "unsupported"
              ? m.unsupported
              : step.kind === "far"
                ? format(m.far, {
                    metres: step.metres.toLocaleString(locale),
                    limit: String(region.checkIn.checkInMetres),
                  })
                : null;
  const back = `?redirect_url=${encodeURIComponent(
    localePath(locale, `/places/${encodeURIComponent(slug)}`),
  )}`;
  const signInHref = `${localePath(locale, "/sign-in")}${back}`;
  return (
    <section
      data-check-in={step.kind}
      className="space-y-3 rounded-[10px] border border-line p-4 text-[15px]"
    >
      <p className="flex items-center gap-2 font-bold">
        <Pips spot={spot} />
        <span className="min-w-0">
          {spot.panelDyed
            ? format(m.panelAlready, { name, panel })
            : format(m.givesPanel, { name, panel })}
        </span>
      </p>
      {actions.signedIn === false &&
        (region.accountsOpen ? (
          <div className="space-y-2">
            <a className={BUTTON} href={`${localePath(locale, "/sign-up")}${back}`}>
              {m.makeAccount}
            </a>
            <p>
              {m.haveAccount}{" "}
              <a className="inline-flex min-h-11 items-center text-ai underline" href={signInHref}>
                {m.signIn}
              </a>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p>
              {m.signInToCheckIn} {m.inviteOnly}
            </p>
            <a className="inline-flex min-h-11 items-center text-ai underline" href={signInHref}>
              {m.signIn}
            </a>
          </div>
        ))}
      {actions.signedIn && (
        <div className="space-y-2">
          {message && (
            <p role="status" data-check-in-message="" className="font-bold">
              {message}
            </p>
          )}
          {step.kind === "failed" && <ErrorMessage error={step.error} locale={locale} />}
          <button
            type="button"
            data-im-here=""
            disabled={step.kind === "reading" || step.kind === "sending"}
            className={BUTTON}
            onClick={() => void press()}
          >
            {m.imHere}
          </button>
          <p className="text-[13px] text-muted-foreground">{m.locationNote}</p>
        </div>
      )}
      <a className="inline-flex min-h-11 items-center text-ai underline" href={setHref}>
        {format(m.seeNoren, { name })}
      </a>
    </section>
  );
}
