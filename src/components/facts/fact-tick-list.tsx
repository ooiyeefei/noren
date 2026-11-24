"use client";

import { useId, useRef, useState } from "react";
import { UnreviewedBadge } from "@/components/badges";
import { ErrorMessage } from "@/components/layout/error-message";
import { ShownAs, type ShownAsActions } from "@/components/place/shown-as";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { factMessages } from "@/lib/i18n/messages/facts";
import { labelFor, type FactVocabularyItem } from "./fact-list";

/** What the tick list can do; the place container wires these to Convex. */
export type FactTickActions = {
  /** Undefined while sign-in is still loading. */
  signedIn: boolean | undefined;
  /** Set while the member has not yet confirmed the name that will show with a report. */
  shownAs?: ShownAsActions;
  /** The signed-in member's own live answers, by key. */
  mine: Readonly<Record<string, { factId: string; value: "yes" | "no" }>>;
  report(key: string, value: "yes" | "no"): Promise<unknown>;
  remove(factId: string): Promise<unknown>;
};

/**
 * FR-344: the region's fixed list, each item with "yes" and "no" and neither chosen at first. A
 * member can change or clear their own answer. Before a first report the member says a clear yes to
 * their name and the day showing with it, the way a story asks for the display name.
 */
export function FactTickList({
  locale,
  vocabulary,
  actions,
}: {
  locale: Locale;
  vocabulary: readonly FactVocabularyItem[];
  actions: FactTickActions;
}) {
  const m = messagesFor(factMessages, locale);
  const hintId = useId();
  const base = useId();
  const [pending, setPending] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  if (actions.signedIn === false)
    return (
      <p>
        {m.needSignIn}{" "}
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={localePath(locale, "/sign-in")}
        >
          {m.signIn}
        </a>
      </p>
    );
  if (actions.signedIn === undefined) return null;
  const held = actions.shownAs !== undefined;
  async function send(key: string, work: () => Promise<unknown>, result: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(key);
    setError(null);
    setDone(null);
    try {
      await work();
      setDone(`${key}:${result}`);
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  return (
    <div className="space-y-4">
      <p>{m.tickIntro}</p>
      {actions.shownAs && (
        <div className="space-y-2">
          <p>{m.askYes}</p>
          <ShownAs locale={locale} hintId={hintId} actions={actions.shownAs} />
        </div>
      )}
      {vocabulary.some((item) => item.labelsReviewedBy === null) && (
        <p>
          <UnreviewedBadge locale={locale} />
        </p>
      )}
      <ul className="space-y-4">
        {vocabulary.map((item) => {
          const mine = actions.mine[item.key];
          const name = `${base}-${item.key}`;
          return (
            <li key={item.key}>
              <fieldset className="space-y-1" disabled={held || pending !== null}>
                <legend className="font-bold">{labelFor(item, locale)}</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {(["yes", "no"] as const).map((value) => (
                    <label
                      key={value}
                      className="relative inline-flex min-h-11 min-w-20 cursor-pointer items-center justify-center rounded-[10px] border border-input px-4 py-2 has-[:checked]:border-kon has-[:checked]:bg-kon has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-kon has-[:disabled]:opacity-60"
                    >
                      <input
                        type="radio"
                        name={name}
                        value={value}
                        checked={mine?.value === value}
                        aria-describedby={held ? hintId : undefined}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                        onChange={() =>
                          void send(item.key, () => actions.report(item.key, value), "saved")
                        }
                      />
                      {value === "yes" ? m.yes : m.no}
                    </label>
                  ))}
                  {mine && (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center text-[15px] text-ai underline"
                      onClick={() =>
                        void send(item.key, () => actions.remove(mine.factId), "removed")
                      }
                    >
                      {m.tickClear}
                    </button>
                  )}
                </div>
                <p role="status" className="min-h-0 text-[15px]">
                  {pending === item.key
                    ? m.saving
                    : done === `${item.key}:saved`
                      ? m.saved
                      : done === `${item.key}:removed`
                        ? m.removed
                        : ""}
                </p>
              </fieldset>
            </li>
          );
        })}
      </ul>
      {Object.keys(actions.mine).length > 0 && <p className="text-[15px]">{m.mine}</p>}
      {error !== null && <ErrorMessage error={error} locale={locale} />}
    </div>
  );
}
