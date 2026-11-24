"use client";

import { useState } from "react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { StoredParty } from "@/lib/trip/storage";
import type { NeedKind } from "@/lib/trip/types";
import { FULLNESS_LEVELS, NEED_KINDS, needLabel } from "@/lib/trip/vocabulary";
import { buttonClass, fieldClass, helpClass, quietButtonClass } from "./route-step";
import type { TripPageRegion } from "./use-trips";

type Guesses = NonNullable<NonNullable<TripPageRegion["trip"]>["guesses"]>;

/** A line saying a value is Noren's guess, or that the organiser set it, with a way back. */
function GuessLine({
  locale,
  set,
  guess,
  onReset,
}: {
  locale: Locale;
  set: boolean;
  guess: string;
  onReset(): void;
}) {
  const m = messagesFor(tripMessages, locale);
  if (!set) return <p className={helpClass}>{format(m.guessNote, { value: guess })}</p>;
  return (
    <p className={helpClass}>
      {m.yoursNote}{" "}
      <button type="button" className="min-h-11 text-ai underline" onClick={onReset}>
        {m.useGuess}
      </button>
    </p>
  );
}

function MinutesField({
  id,
  label,
  value,
  guess,
  locale,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  guess: number;
  locale: Locale;
  onChange(value: number | undefined): void;
}) {
  const m = messagesFor(tripMessages, locale);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={10}
        max={1440}
        step={5}
        value={value ?? ""}
        placeholder={String(guess)}
        aria-describedby={`${id}-guess`}
        onChange={(event) => {
          const n = Number(event.target.value);
          onChange(
            event.target.value === "" || !Number.isInteger(n) || n < 1
              ? undefined
              : Math.min(n, 1440),
          );
        }}
        className={fieldClass}
      />
      <div id={`${id}-guess`}>
        <GuessLine
          locale={locale}
          set={value !== undefined}
          guess={format(m.minutes, { n: guess })}
          onReset={() => onChange(undefined)}
        />
      </div>
    </div>
  );
}

function omit<T extends object>(value: T | undefined, key: keyof T): T | undefined {
  if (!value) return undefined;
  const { [key]: _gone, ...rest } = value;
  void _gone;
  return Object.keys(rest).length > 0 ? (rest as T) : undefined;
}

export function TravelStep({
  locale,
  party,
  guesses,
  onChange,
}: {
  locale: Locale;
  party: StoredParty;
  /** The region's starting guesses; shown as guesses wherever the organiser has set nothing. */
  guesses: Guesses;
  onChange(patch: Partial<StoredParty>): void;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const [kind, setKind] = useState<NeedKind>("prayer");
  const [at, setAt] = useState("13:00");
  const [minutes, setMinutes] = useState(20);
  const setLimit = (key: "stretchMinutes" | "dayDriveMinutes", value: number | undefined) => {
    const next = value === undefined ? omit(party.limits, key) : { ...party.limits, [key]: value };
    onChange({ limits: next });
  };
  const setMeal = (key: "lunch" | "dinner", value: string) => {
    const next = value === "" ? omit(party.meals, key) : { ...party.meals, [key]: value };
    onChange({ meals: next });
  };
  const fullnessLabel = FULLNESS_LEVELS.find((f) => f.level === guesses.fullness)?.label[locale];
  return (
    <div className="space-y-6">
      <h2 className="font-sans text-[22px] font-bold">{m.travelIntro}</h2>
      <MinutesField
        id="trip-stretch"
        label={m.stretchLabel}
        value={party.limits?.stretchMinutes}
        guess={guesses.stretchMinutes}
        locale={locale}
        onChange={(v) => setLimit("stretchMinutes", v)}
      />
      <MinutesField
        id="trip-day-drive"
        label={m.dayDriveLabel}
        value={party.limits?.dayDriveMinutes}
        guess={guesses.dayDriveMinutes}
        locale={locale}
        onChange={(v) => setLimit("dayDriveMinutes", v)}
      />
      <fieldset className="space-y-2">
        <legend className="font-bold">{m.fullnessLegend}</legend>
        <ul className="flex flex-wrap gap-2">
          {FULLNESS_LEVELS.map((entry) => (
            <li key={entry.level}>
              <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4">
                <input
                  type="radio"
                  name="trip-fullness"
                  checked={party.fullness === entry.level}
                  onChange={() => onChange({ fullness: entry.level })}
                  className="size-4"
                />
                {entry.label[locale]}
              </label>
            </li>
          ))}
        </ul>
        <GuessLine
          locale={locale}
          set={party.fullness !== undefined}
          guess={fullnessLabel ?? guesses.fullness}
          onReset={() => onChange({ fullness: undefined })}
        />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-bold">{m.mealsLegend}</legend>
        {(["lunch", "dinner"] as const).map((meal) => (
          <div key={meal} className="space-y-2">
            <label htmlFor={`trip-${meal}`} className="block">
              {meal === "lunch" ? m.lunchLabel : m.dinnerLabel}
            </label>
            <input
              id={`trip-${meal}`}
              type="time"
              value={party.meals?.[meal] ?? ""}
              aria-describedby={`trip-${meal}-guess`}
              onChange={(event) => setMeal(meal, event.target.value)}
              className={fieldClass}
            />
            <div id={`trip-${meal}-guess`}>
              <GuessLine
                locale={locale}
                set={party.meals?.[meal] !== undefined}
                guess={guesses[meal]}
                onReset={() => setMeal(meal, "")}
              />
            </div>
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-bold">{m.needsHeading}</legend>
        {party.needs.length === 0 ? (
          <p>{m.needsNone}</p>
        ) : (
          <ul className="space-y-2">
            {party.needs.map((need, index) => (
              <li
                key={`${need.kind}-${need.at}-${index}`}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-white p-2 pl-4"
              >
                <span>
                  {format(m.readbackTime, {
                    kind: needLabel(need.kind, locale),
                    minutes: need.minutes,
                    time: need.at,
                  })}
                </span>
                <button
                  type="button"
                  className={quietButtonClass}
                  onClick={() => onChange({ needs: party.needs.filter((_, i) => i !== index) })}
                >
                  <span aria-hidden="true">✕</span>
                  <span className="sr-only">
                    {format(m.needRemove, { kind: needLabel(need.kind, locale), time: need.at })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {party.needs.length < 12 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="need-kind" className="block">
                {m.needKind}
              </label>
              <select
                id="need-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as NeedKind)}
                className={fieldClass}
              >
                {NEED_KINDS.map((entry) => (
                  <option key={entry.kind} value={entry.kind}>
                    {entry.label[locale]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="need-at" className="block">
                {m.needAt}
              </label>
              <input
                id="need-at"
                type="time"
                value={at}
                onChange={(event) => setAt(event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="need-minutes" className="block">
                {m.needMinutes}
              </label>
              <input
                id="need-minutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={480}
                step={5}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
                className={fieldClass}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={party.needs.length >= 12 || !/^\d\d:\d\d$/.test(at) || !(minutes >= 1)}
          onClick={() =>
            onChange({ needs: [...party.needs, { kind, at, minutes: Math.round(minutes) }] })
          }
        >
          {m.needAdd}
        </button>
      </fieldset>
    </div>
  );
}
