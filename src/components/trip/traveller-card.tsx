"use client";

import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { StoredParty } from "@/lib/trip/storage";
import { AGE_BANDS, TRIP_RULES, TRIP_TASTES } from "@/lib/trip/vocabulary";
import { fieldClass, helpClass, quietButtonClass } from "./route-step";

type Traveller = StoredParty["travellers"][number];

const REST_MINUTES = [30, 45, 60, 90, 120];
const LIMITS = { rules: 8, likes: 8, skips: 4 } as const;

function toggle(list: string[], tag: string, on: boolean): string[] {
  return on ? (list.includes(tag) ? list : [...list, tag]) : list.filter((t) => t !== tag);
}

function Ticks({
  idBase,
  legend,
  help,
  options,
  chosen,
  max,
  locale,
  onChange,
  fold = false,
}: {
  idBase: string;
  legend: string;
  help: string;
  options: readonly { tag: string; label: { en: string; ja: string } }[];
  chosen: string[];
  max: number;
  locale: Locale;
  onChange(next: string[]): void;
  /** Folded away until opened (open from the start when something is ticked), to keep a card short. */
  fold?: boolean;
}) {
  const body = (
    <>
      <p id={`${idBase}-help`} className={helpClass}>
        {help}
      </p>
      <ul className="flex flex-wrap gap-2" aria-describedby={`${idBase}-help`}>
        {options.map((option) => {
          const on = chosen.includes(option.tag);
          return (
            <li key={option.tag}>
              <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && chosen.length >= max}
                  onChange={(event) => onChange(toggle(chosen, option.tag, event.target.checked))}
                  className="size-4"
                />
                {option.label[locale]}
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
  if (fold) {
    return (
      <details open={chosen.length > 0} className="rounded-[10px] border border-line p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-bold">{legend}</summary>
        <div className="space-y-2 pt-2">{body}</div>
      </details>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className="font-bold">{legend}</legend>
      {body}
    </fieldset>
  );
}

/**
 * One traveller. The label is the organiser's own ("Mum", "the little one"); no field asks for a
 * legal name, a date of birth, a diagnosis or a reason. Must-haves and likes are separate lists.
 */
export function TravellerCard({
  locale,
  traveller,
  tripDays,
  onChange,
  onRemove,
}: {
  locale: Locale;
  traveller: Traveller;
  tripDays: number;
  onChange(next: Traveller): void;
  onRemove(): void;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const id = `traveller-${traveller.key}`;
  const patch = (next: Partial<Traveller>) => onChange({ ...traveller, ...next });
  const onDays = traveller.days ?? Array.from({ length: tripDays }, (_, i) => i + 1);
  const shown = traveller.label.trim() || m.someone;
  return (
    <section
      aria-labelledby={`${id}-name`}
      className="space-y-5 rounded-[10px] border border-line bg-white p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-name`} className="min-w-0 font-sans text-[18px] font-bold break-words">
          {shown}
        </h3>
        <button type="button" className={quietButtonClass} onClick={onRemove}>
          <span aria-hidden="true">✕</span>
          <span className="sr-only">{format(m.removeTraveller, { label: shown })}</span>
        </button>
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-label`} className="block font-bold">
          {m.labelLabel}
        </label>
        <p id={`${id}-label-help`} className={helpClass}>
          {m.labelHelp}
        </p>
        <input
          id={`${id}-label`}
          type="text"
          maxLength={40}
          autoComplete="off"
          value={traveller.label}
          aria-describedby={`${id}-label-help`}
          onChange={(event) => patch({ label: event.target.value })}
          className={fieldClass}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-age`} className="block font-bold">
          {m.ageLabel}
        </label>
        <select
          id={`${id}-age`}
          value={traveller.ageBand}
          onChange={(event) => patch({ ageBand: event.target.value as Traveller["ageBand"] })}
          className={fieldClass}
        >
          {AGE_BANDS.map((entry) => (
            <option key={entry.band} value={entry.band}>
              {entry.label[locale]}
            </option>
          ))}
        </select>
      </div>
      <Ticks
        idBase={`${id}-rules`}
        legend={m.rulesLegend}
        help={m.rulesHelp}
        options={TRIP_RULES}
        chosen={traveller.rules}
        max={LIMITS.rules}
        locale={locale}
        onChange={(rules) => patch({ rules })}
      />
      <Ticks
        idBase={`${id}-likes`}
        legend={m.likesLegend}
        help={m.likesHelp}
        options={TRIP_TASTES}
        chosen={traveller.likes}
        max={LIMITS.likes}
        fold
        locale={locale}
        onChange={(likes) => patch({ likes })}
      />
      <Ticks
        idBase={`${id}-skips`}
        legend={m.skipsLegend}
        help={m.skipsHelp}
        options={TRIP_TASTES}
        chosen={traveller.skips}
        max={LIMITS.skips}
        fold
        locale={locale}
        onChange={(skips) => patch({ skips })}
      />
      <div className="space-y-2">
        <label className="flex min-h-11 items-center gap-2 font-bold">
          <input
            type="checkbox"
            checked={traveller.rests !== undefined}
            onChange={(event) =>
              patch({ rests: event.target.checked ? { after: "lunch", minutes: 60 } : undefined })
            }
            className="size-4"
          />
          {m.restLabel}
        </label>
        {traveller.rests && (
          <div className="space-y-2">
            <label htmlFor={`${id}-rest`} className="block">
              {m.restMinutes}
            </label>
            <select
              id={`${id}-rest`}
              value={traveller.rests.minutes}
              onChange={(event) =>
                patch({ rests: { after: "lunch", minutes: Number(event.target.value) } })
              }
              className={fieldClass}
            >
              {REST_MINUTES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {tripDays > 1 && (
        <fieldset className="space-y-2">
          <legend className="font-bold">{m.daysLegend}</legend>
          <ul className="flex flex-wrap gap-2">
            {Array.from({ length: tripDays }, (_, i) => i + 1).map((day) => (
              <li key={day}>
                <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4">
                  <input
                    type="checkbox"
                    checked={onDays.includes(day)}
                    onChange={(event) => {
                      const next = (
                        event.target.checked ? [...onDays, day] : onDays.filter((d) => d !== day)
                      ).sort((a, b) => a - b);
                      // On every day is the same as no list at all.
                      patch({ days: next.length === tripDays ? undefined : next });
                    }}
                    className="size-4"
                  />
                  {format(m.dayN, { n: day })}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </section>
  );
}
