"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, CircleCheck, CircleHelp, Clock } from "lucide-react";
import { ErrorMessage } from "@/components/layout/error-message";
import { CHECK_PROBLEMS, type CheckProblem } from "@/lib/domain/constants";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { checkMessages } from "@/lib/i18n/messages/checks";
import { cn } from "@/lib/utils";
import { checkDate, checkState } from "./check-state";

/** What the page can do about a check; the container wires these to Convex. */
export type PlaceCheckActions = {
  /** Undefined while sign-in is still loading. */
  signedIn: boolean | undefined;
  confirm(): Promise<unknown>;
  report(problem: CheckProblem, note: string): Promise<unknown>;
};

const ICONS = { unconfirmed: CircleHelp, confirmed: CircleCheck, stale: Clock };
const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-5 py-2 font-bold disabled:opacity-50";

/**
 * FR-030: the label says whether a person has checked the place; opening it shows where the
 * listing came from and lets a signed-in member say "Still here" or report something wrong.
 */
export function PlaceCheck({
  locale,
  confirmedAt,
  osmRef,
  actions,
  now,
}: {
  locale: Locale;
  confirmedAt?: number;
  osmRef?: string;
  actions?: PlaceCheckActions;
  now?: number;
}) {
  const m = messagesFor(checkMessages, locale);
  const radioName = useId();
  const [shownAt] = useState(() => Date.now());
  const state = checkState(confirmedAt, now ?? shownAt);
  const [reporting, setReporting] = useState(false);
  const [problem, setProblem] = useState<CheckProblem | "">("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<"confirmed" | "reported" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function send(work: () => Promise<unknown>, result: "confirmed" | "reported") {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setDone(null);
    try {
      await work();
      setDone(result);
      if (result === "reported") {
        setReporting(false);
        setProblem("");
        setNote("");
      }
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const Icon = ICONS[state];
  const label = state === "unconfirmed" ? messagesFor(badgeMessages, locale).unconfirmed : m[state];
  return (
    <details
      data-check={state}
      className={cn(
        "group rounded-[10px] border border-line",
        state === "unconfirmed" && "border-dashed",
      )}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 font-bold [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-4 px-4 pb-4 text-[15px]">
        <p>
          {osmRef && <>{m.fromOsm} </>}
          {confirmedAt === undefined
            ? m.noOneYet
            : format(state === "stale" ? m.staleOn : m.confirmedOn, {
                date: checkDate(confirmedAt, locale),
              })}
        </p>
        {osmRef && (
          <a
            className="inline-flex min-h-11 items-center text-ai underline"
            href={`https://www.openstreetmap.org/${osmRef}`}
          >
            {m.seeOnOsm}
          </a>
        )}
        {actions?.signedIn === false && (
          <p>
            {m.signInToCheck}{" "}
            <a
              className="inline-flex min-h-11 items-center text-ai underline"
              href={localePath(locale, "/sign-in")}
            >
              {m.signIn}
            </a>
          </p>
        )}
        {actions?.signedIn && (
          <div className="space-y-3">
            <p className="text-muted-foreground">{m.stillHereHint}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending}
                className={cn(BUTTON, "bg-kon text-white")}
                onClick={() => void send(actions.confirm, "confirmed")}
              >
                {m.stillHere}
              </button>
              {!reporting && (
                <button
                  type="button"
                  disabled={pending}
                  className={cn(BUTTON, "border border-input text-kon")}
                  onClick={() => {
                    setReporting(true);
                    setDone(null);
                  }}
                >
                  {m.somethingWrong}
                </button>
              )}
            </div>
            {reporting && (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (problem) void send(() => actions.report(problem, note), "reported");
                }}
              >
                <fieldset className="space-y-1">
                  <legend className="font-bold">{m.problemLegend}</legend>
                  {CHECK_PROBLEMS.map((key) => (
                    <label key={key} className="flex min-h-11 items-center gap-3">
                      <input
                        type="radio"
                        name={radioName}
                        value={key}
                        checked={problem === key}
                        onChange={() => setProblem(key)}
                        className="size-5"
                      />
                      {m[key]}
                    </label>
                  ))}
                </fieldset>
                <label className="block space-y-1">
                  <span>{m.note}</span>
                  <textarea
                    value={note}
                    maxLength={500}
                    rows={3}
                    onChange={(event) => setNote(event.target.value)}
                    className="block w-full rounded-[10px] border border-input p-3 text-[16px]"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={pending || !problem}
                    className={cn(BUTTON, "bg-kon text-white")}
                  >
                    {m.sendReport}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className={cn(BUTTON, "border border-input text-kon")}
                    onClick={() => setReporting(false)}
                  >
                    {m.cancel}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        <div role="status" aria-live="polite">
          {pending
            ? m.sending
            : done === "confirmed"
              ? m.confirmedThanks
              : done === "reported"
                ? m.reportThanks
                : null}
        </div>
        {error !== null && <ErrorMessage error={error} locale={locale} />}
      </div>
    </details>
  );
}
