"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorMessage } from "@/components/layout/error-message";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";

/** A place a question could be carried to, ready to show: its name in the page's language. */
export type CarryTargetView = {
  placeId: string;
  name: string;
  /** The language of `name`, for the lang attribute. */
  lang: string;
  /** Straight-line metres from the place the question is written at, rounded. */
  metres: number;
  /** Every name of the place, so a Japanese name finds it on the English page and the reverse. */
  search: string;
};

const NOTHING: readonly CarryTargetView[] = [];
const FIELD = "block w-full rounded-[10px] border border-input p-3 text-[16px]";

/**
 * "Where should they ask it?": here (the default), or at another place nearby, chosen from a
 * searchable list. The list is asked for once, when the second choice is made, and it is made of
 * places only: it is never worked out from where the writer is.
 */
export function CarryPicker({
  locale,
  id,
  other,
  placeId,
  onChange,
  load,
  problem,
}: {
  locale: Locale;
  /** A prefix that keeps this form's ids apart. */
  id: string;
  /** "At another place nearby" is chosen. */
  other: boolean;
  /** The place picked, if any. */
  placeId: string | undefined;
  onChange(next: { other: boolean; placeId: string | undefined }): void;
  /** Asks for the places nearby; called once, when "At another place nearby" is first chosen. */
  load?(): Promise<readonly CarryTargetView[]>;
  /** The writer chose another place but has not picked one. */
  problem: boolean;
}) {
  const m = messagesFor(addStoryMessages, locale);
  const [fetched, setFetched] = useState<readonly CarryTargetView[]>();
  // Without a way to ask, there is nothing to offer.
  const targets = load === undefined ? NOTHING : fetched;
  const [failure, setFailure] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const asked = useRef(false);
  useEffect(() => {
    if (!other || asked.current || load === undefined) return;
    asked.current = true;
    load().then(setFetched, (caught: unknown) => {
      asked.current = false;
      setFailure(caught ?? new Error("carry targets failed"));
    });
  }, [other, load]);
  const needle = query.trim().toLocaleLowerCase(locale);
  const shown =
    targets?.filter(
      (target) => needle === "" || target.search.toLocaleLowerCase(locale).includes(needle),
    ) ?? [];
  const chosen = targets?.find((target) => target.placeId === placeId);
  const name = `${id}-carry`;
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="font-bold">{m.carryLegend}</legend>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="radio"
          name={name}
          data-carry="here"
          checked={!other}
          onChange={() => onChange({ other: false, placeId: undefined })}
          className="size-5"
        />
        {m.carryHere}
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="radio"
          name={name}
          data-carry="other"
          checked={other}
          onChange={() => onChange({ other: true, placeId })}
          className="size-5"
        />
        {m.carryOther}
      </label>
      {other && (
        <div className="min-w-0 space-y-2">
          <p id={`${id}-carry-helper`} className="text-[15px] text-muted-foreground">
            {m.carryHelper}
          </p>
          {failure !== null ? (
            <ErrorMessage error={failure} locale={locale} />
          ) : targets === undefined ? (
            <p role="status">{m.carryLoading}</p>
          ) : targets.length === 0 ? (
            <p role="status" data-carry-none="">
              {m.carryNone}
            </p>
          ) : (
            <>
              <label htmlFor={`${id}-carry-search`} className="block font-bold">
                {m.carrySearch}
              </label>
              <input
                id={`${id}-carry-search`}
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={FIELD}
              />
              <div
                role="radiogroup"
                aria-label={m.carrySearch}
                aria-describedby={`${id}-carry-helper`}
                data-carry-list=""
                className="max-h-64 min-w-0 space-y-1 overflow-y-auto rounded-[10px] border border-input p-2"
              >
                {shown.map((target) => (
                  <label
                    key={target.placeId}
                    className="flex min-h-11 min-w-0 items-center gap-3 rounded-[8px] px-2"
                  >
                    <input
                      type="radio"
                      name={`${id}-carry-place`}
                      value={target.placeId}
                      checked={target.placeId === placeId}
                      onChange={() => onChange({ other: true, placeId: target.placeId })}
                      className="size-5 shrink-0"
                    />
                    <span lang={target.lang} className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      {target.name}
                    </span>
                    <span className="shrink-0 text-[15px] text-muted-foreground">
                      {format(m.carryMetres, { metres: target.metres.toLocaleString(locale) })}
                    </span>
                  </label>
                ))}
                {shown.length === 0 && <p className="p-2">{m.carryNoMatch}</p>}
              </div>
              <p role="status" className="text-[15px] font-bold empty:hidden">
                {chosen ? format(m.carryChosen, { place: chosen.name }) : ""}
              </p>
            </>
          )}
          {problem && (
            <p id={`${id}-carry-problem`} role="alert" className="text-beni">
              {m.carryProblem}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
