"use client";

import { useEffect, useId, useRef, useState } from "react";
import { categoryOptions } from "@/components/public/category";
import { normalisePoint } from "@/components/map/map-helpers";
import { PlaceMap } from "@/components/map/place-map";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCRIPTS, type Role, type Script } from "@/lib/domain/constants";
import { createOpenFreeMapStyle } from "@/lib/geo";
import { messagesFor, type Locale } from "@/lib/i18n";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import type { MapsSuggestion } from "@/lib/geo/maps-link";
import type { RegionConfig } from "@/lib/region";
import type { GeoSearchOutcome, GeoSuggestion } from "./geo-search";
import { type NameDraft, type PlaceDraft, type PlaceErrors } from "./place-form";
import {
  fieldsToNames,
  namesToFields,
  prefillMapsResult,
  requestCreatorLocation,
  simpleNameIndex,
  stepError,
  type WizardStep,
} from "./place-wizard";

export type SearchState = {
  query: string;
  pending: boolean;
  coolingDown: boolean;
  outcome?: GeoSearchOutcome;
  selected?: GeoSuggestion;
  center?: { lat: number; lng: number };
};
export type SearchActions = {
  onQuery(value: string): void;
  onSearch(): void;
  onSelect(value: GeoSuggestion): void;
  onConfirm(): void;
};
export function GeoSearchView({
  locale,
  state,
  actions,
}: {
  locale: Locale;
  state: SearchState;
  actions: SearchActions;
}) {
  const m = messagesFor(creatorMessages, locale);
  const id = useId();
  return (
    <section className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!state.pending && !state.coolingDown) actions.onSearch();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={id}>{m.query}</Label>
          <Input
            className="min-h-11 rounded-[10px]"
            id={id}
            value={state.query}
            onChange={(event) => actions.onQuery(event.target.value)}
          />
        </div>
        <Button
          className="min-h-11 rounded-[10px] px-4 whitespace-normal"
          type="submit"
          disabled={state.pending || state.coolingDown}
        >
          {state.pending ? m.searching : m.search}
        </Button>
      </form>
      {state.outcome &&
        (!state.outcome.ok ? (
          <Alert>{m[state.outcome.kind]}</Alert>
        ) : state.outcome.suggestions.length === 0 ? (
          <p role="status">{m.noResults}</p>
        ) : (
          <ul className="space-y-3">
            {state.outcome.suggestions.map((s, i) => (
              <li key={`${s.lat}:${s.lng}:${i}`} className="space-y-1 border-l-2 pl-3">
                <p>{s.name}</p>
                <p className="text-sm">{m.suggestion}</p>
                {s.attribution.map((line) => (
                  <p className="text-sm text-muted-foreground" key={line}>
                    {line}
                  </p>
                ))}
                <Button
                  className="min-h-11 rounded-[10px] px-4 whitespace-normal"
                  type="button"
                  variant="outline"
                  onClick={() => actions.onSelect(s)}
                >
                  {m.choose}
                </Button>
              </li>
            ))}
          </ul>
        ))}
      {state.selected && (
        <div className="space-y-2">
          <p>
            {m.suggestion}: {state.selected.name}
          </p>
        </div>
      )}
    </section>
  );
}

export function MapsLinkFeedback({
  locale,
  error,
  suggested,
  area,
  pinned,
  onPin,
}: {
  locale: Locale;
  error?: string;
  suggested?: boolean;
  /** Whether the link gave only the middle of a map view, not the shop's own pin. */
  area?: boolean;
  /** Whether the pin is already on the spot from the link. */
  pinned?: boolean;
  /**
   * Puts the pin on the link's spot, for someone who cannot tell the shop on the map. The tap is
   * theirs, so the pin is still person-placed (FR-001, FR-003).
   */
  onPin?(): void;
}) {
  const m = messagesFor(creatorMessages, locale);
  return (
    <>
      {error && <Alert>{error}</Alert>}
      {suggested && (
        <div className="space-y-3">
          <p role="status">
            {area ? m.linkArea : pinned ? m.pinnedAtLink : m.linkFound} {m.checkMapsSuggestion}
          </p>
          {!area && !pinned && onPin && (
            <Button
              className="min-h-11 rounded-[10px] px-4 whitespace-normal"
              type="button"
              onClick={onPin}
            >
              {m.pinAtLink}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function MapsLinkField({
  locale,
  pin,
  onSuggestion,
  onPin,
}: {
  locale: Locale;
  pin: PlaceDraft["pin"];
  onSuggestion(suggestion: MapsSuggestion): void;
  onPin(pin: NonNullable<PlaceDraft["pin"]>): void;
}) {
  const m = messagesFor(creatorMessages, locale);
  const id = useId();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [spot, setSpot] = useState<{ pin: NonNullable<PlaceDraft["pin"]>; exact: boolean }>();
  const inFlight = useRef(false);
  async function fill() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSpot(undefined);
    try {
      const response = await fetch(`/api/geo/maps-link?${new URLSearchParams({ url })}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(
          typeof body.error?.message === "string" && body.error.message.trim()
            ? body.error.message
            : m.mapsLinkFailure,
        );
        return;
      }
      const suggestion = body.suggestion;
      if (
        !suggestion ||
        !Number.isFinite(suggestion.lat) ||
        !Number.isFinite(suggestion.lng) ||
        Math.abs(suggestion.lat) > 90 ||
        Math.abs(suggestion.lng) > 180 ||
        (suggestion.name !== undefined && typeof suggestion.name !== "string")
      ) {
        setError(m.mapsLinkFailure);
        return;
      }
      onSuggestion(suggestion);
      // Anything but a clear yes is treated as an area, so the one-tap pin is never offered by mistake.
      setSpot({ pin: normalisePoint(suggestion), exact: suggestion.exact === true });
    } catch {
      setError(m.mapsLinkFailure);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <section className="space-y-3">
      <Label htmlFor={id}>{m.mapsLink}</Label>
      <Input
        className="min-h-11 rounded-[10px]"
        id={id}
        type="url"
        maxLength={500}
        value={url}
        disabled={pending}
        onChange={(event) => setUrl(event.target.value)}
      />
      <Button
        className="min-h-11 rounded-[10px] px-4 whitespace-normal"
        type="button"
        disabled={pending || !url.trim()}
        onClick={fill}
      >
        {pending ? m.fillingFromLink : m.fillFromLink}
      </Button>
      <MapsLinkFeedback
        locale={locale}
        error={error}
        suggested={!!spot}
        area={!!spot && !spot.exact}
        pinned={!!spot && pin?.lat === spot.pin.lat && pin.lng === spot.pin.lng}
        onPin={spot?.exact ? () => onPin(spot.pin) : undefined}
      />
    </section>
  );
}

export function NameRows({
  locale,
  locales,
  names,
  errors = {},
  onChange,
}: {
  locale: Locale;
  locales: readonly string[];
  names: NameDraft[];
  errors?: PlaceErrors;
  onChange(names: NameDraft[]): void;
}) {
  const m = messagesFor(creatorMessages, locale);
  const id = useId();
  const update = (i: number, patch: Partial<NameDraft>) =>
    onChange(names.map((n, index) => (index === i ? { ...n, ...patch } : n)));
  return (
    <fieldset className="space-y-4">
      <legend className="text-[22px] font-bold">{m.names}</legend>
      <p className="text-sm">{m.optionalNames}</p>
      {errors.names && <p role="alert">{m[errors.names]}</p>}
      {names.map((name, i) => (
        <div key={i} className="grid gap-3 border-b border-line py-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-${i}-lang`}>{m.language}</Label>
            <select
              id={`${id}-${i}-lang`}
              className="min-h-11 w-full rounded-[10px] border border-input p-2"
              value={name.lang}
              onChange={(event) => update(i, { lang: event.target.value })}
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {l === "ja" || l === "en" ? m[l] : l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-${i}-script`}>{m.script}</Label>
            <select
              id={`${id}-${i}-script`}
              className="min-h-11 w-full rounded-[10px] border border-input p-2"
              value={name.script}
              onChange={(event) => update(i, { script: event.target.value as Script })}
            >
              {SCRIPTS.map((s) => (
                <option key={s} value={s}>
                  {m[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${id}-${i}-value`}>{m.value}</Label>
            <Input
              className="min-h-11 rounded-[10px]"
              id={`${id}-${i}-value`}
              lang={name.lang}
              value={name.value}
              aria-invalid={!!errors[`name.${i}`]}
              aria-describedby={errors[`name.${i}`] ? `${id}-${i}-error` : undefined}
              onChange={(event) => update(i, { value: event.target.value })}
            />
            {errors[`name.${i}`] && (
              <p id={`${id}-${i}-error`} role="alert">
                {m[errors[`name.${i}`]!]}
              </p>
            )}
          </div>
          <Label className="min-h-11">
            <input
              type="checkbox"
              checked={name.isPrimary}
              onChange={(event) => update(i, { isPrimary: event.target.checked })}
            />
            {m.primary}
          </Label>
          <Button
            className="min-h-11 rounded-[10px] px-4 whitespace-normal"
            type="button"
            variant="outline"
            onClick={() => onChange(names.filter((_, index) => i !== index))}
          >
            {m.removeName}
          </Button>
        </div>
      ))}
      <Button
        className="min-h-11 rounded-[10px] px-4 whitespace-normal"
        type="button"
        variant="outline"
        disabled={names.length >= 12}
        onClick={() =>
          onChange([
            ...names,
            { lang: locales[0] ?? locale, script: "latin", value: "", isPrimary: false },
          ])
        }
      >
        {m.addName}
      </Button>
    </fieldset>
  );
}

export function PlaceNamesEditor({
  locale,
  locales,
  names,
  errors = {},
  onChange,
}: {
  locale: Locale;
  locales: readonly string[];
  names: NameDraft[];
  errors?: PlaceErrors;
  onChange(names: NameDraft[]): void;
}) {
  const m = messagesFor(creatorMessages, locale);
  const id = useId();
  const fields = namesToFields(names);
  return (
    <section className="space-y-4">
      <p id={`${id}-hint`} className="text-[15px] text-muted-foreground">
        {m.nameHint}
      </p>
      {errors.names && <p role="alert">{m[errors.names]}</p>}
      {(["japanese", "english"] as const).map((key) => {
        const lang = key === "japanese" ? "ja" : "en";
        const index = simpleNameIndex(names, lang);
        const error = errors[`name.${index}`];
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={`${id}-${key}`}>
              {key === "japanese" ? m.japaneseName : m.englishName}
            </Label>
            <Input
              className="min-h-11 rounded-[10px]"
              id={`${id}-${key}`}
              lang={lang}
              value={fields[key]}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-${key}-error` : `${id}-hint`}
              onChange={(event) =>
                onChange(fieldsToNames({ ...fields, [key]: event.target.value }, names))
              }
            />
            {error && (
              <p id={`${id}-${key}-error`} role="alert" className="text-beni">
                {m[error]}
              </p>
            )}
          </div>
        );
      })}
      <details
        className="border-b border-line py-2"
        open={Object.keys(errors).some((key) => key.startsWith("name.")) || undefined}
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-ai underline">
          {m.extraNames}
        </summary>
        <NameRows
          locale={locale}
          locales={locales}
          names={names}
          errors={errors}
          onChange={onChange}
        />
      </details>
    </section>
  );
}

export function PinPicker({
  locale,
  region,
  draft,
  center,
  errors = {},
  onChange,
}: {
  locale: Locale;
  region: RegionConfig;
  draft: PlaceDraft;
  /** Where to centre the map; `area` when it is only the middle of a Maps link's view. */
  center?: { lat: number; lng: number; area?: boolean };
  errors?: PlaceErrors;
  onChange(pin: NonNullable<PlaceDraft["pin"]>): void;
}) {
  const m = messagesFor(creatorMessages, locale);
  const style = createOpenFreeMapStyle(region);
  const [initialPin] = useState(draft.pin);
  const start = center ?? initialPin;
  const aerial = region.geo.aerialPhoto;
  return (
    <section className="space-y-3">
      {center && !draft.pin && <p role="status">{center.area ? m.areaHint : m.entranceHint}</p>}
      <p className="text-sm">
        {m.pinHint}
        {aerial && ` ${m.photoHint}`}
      </p>
      <PlaceMap
        locale={locale}
        label={m.pin}
        styleUrl={style.styleUrl(region, "liberty", locale)}
        attribution={style.attribution}
        center={start ? { lat: start.lat, lng: start.lng, zoom: 17 } : region.defaultCenter}
        markers={[]}
        picker={{ value: draft.pin, onChange, centreLabel: m.putPinHere }}
        aerial={aerial}
      />
      {draft.pin && <p role="status">{m.pinPlaced}</p>}
      {errors.pin && <p role="alert">{m[errors.pin]}</p>}
    </section>
  );
}

export function PlacePinSearch({
  locale,
  region,
  draft,
  search,
  searchActions,
  errors,
  onChange,
  active = true,
  prefillNames = false,
}: Pick<
  NewPlaceViewProps,
  "locale" | "region" | "draft" | "search" | "searchActions" | "errors" | "onChange"
> & {
  active?: boolean;
  prefillNames?: boolean;
}) {
  const m = messagesFor(creatorMessages, locale);
  const [center, setCenter] = useState<{ lat: number; lng: number; area?: boolean }>();
  const [locating, setLocating] = useState(false);
  const [locationOff, setLocationOff] = useState(false);
  const latest = useRef({ draft, onChange });
  useEffect(() => {
    latest.current = { draft, onChange };
  }, [draft, onChange]);
  async function locate() {
    setLocating(true);
    setLocationOff(false);
    const result = await requestCreatorLocation();
    setLocating(false);
    if (result.ok) setCenter(result.pin);
    else setLocationOff(true);
  }
  return (
    <div className="space-y-6">
      <MapsLinkField
        locale={locale}
        pin={draft.pin}
        onSuggestion={(suggestion) => {
          if (prefillNames)
            latest.current.onChange(prefillMapsResult(latest.current.draft, suggestion));
          setCenter({
            lat: suggestion.lat,
            lng: suggestion.lng,
            ...(suggestion.exact === true ? {} : { area: true }),
          });
        }}
        onPin={(pin) => latest.current.onChange({ ...latest.current.draft, pin })}
      />
      <GeoSearchView
        locale={locale}
        state={search}
        actions={{
          ...searchActions,
          onSelect: (suggestion) => {
            setCenter({ lat: suggestion.lat, lng: suggestion.lng });
            searchActions.onSelect(suggestion);
          },
        }}
      />
      <Button
        className="min-h-11 rounded-[10px] px-4 whitespace-normal"
        type="button"
        variant="outline"
        disabled={locating}
        onClick={() => locate()}
      >
        {locating ? m.locating : m.locate}
      </Button>
      {locationOff && <p role="status">{m.locationOff}</p>}
      {active && (
        <PinPicker
          locale={locale}
          region={region}
          draft={draft}
          center={center ?? search.center}
          errors={errors}
          onChange={(pin) => onChange({ ...draft, pin })}
        />
      )}
    </div>
  );
}

export type NewPlaceViewProps = {
  locale: Locale;
  region: RegionConfig;
  role: Role;
  /** Whether the place goes on the public map when added, or is saved as a draft. */
  onMap?: boolean;
  draft: PlaceDraft;
  errors?: PlaceErrors;
  pending?: boolean;
  error?: string;
  search: SearchState;
  searchActions: SearchActions;
  onChange(draft: PlaceDraft): void;
  onCreate(): void;
  step?: WizardStep;
  active?: boolean;
  onStep?(step: WizardStep | 0): void;
};
export function NewPlaceView({
  locale,
  region,
  onMap = false,
  draft,
  errors,
  pending,
  error,
  search,
  searchActions,
  onChange,
  onCreate,
  step = 1,
  active = true,
  onStep,
}: NewPlaceViewProps) {
  const m = messagesFor(creatorMessages, locale);
  const heading = useRef<HTMLHeadingElement>(null);
  const reasonId = useId();
  useEffect(() => {
    if (active) heading.current?.focus();
  }, [step, active]);
  const reason = stepError(step, draft, region);
  const titles = [m.where, m.called, m.kindOfPlace];
  return (
    <section className="max-w-3xl space-y-6" lang={locale} aria-label={m.newPlace}>
      <p aria-live="polite" aria-atomic="true" className="text-[15px] text-muted-foreground">
        {m.progress.replace("{step}", String(step))}
      </p>
      <h2 ref={heading} tabIndex={-1} className="text-[22px] font-bold">
        {titles[step - 1]}
      </h2>
      <fieldset disabled={pending} className="min-w-0 space-y-6">
        <div hidden={step !== 1} className="space-y-6">
          <PlacePinSearch
            locale={locale}
            region={region}
            draft={draft}
            search={search}
            searchActions={searchActions}
            errors={errors}
            onChange={onChange}
            active={active && step === 1}
            prefillNames
          />
        </div>
        {step === 2 && (
          <PlaceNamesEditor
            locale={locale}
            locales={region.locales}
            names={draft.names}
            errors={errors}
            onChange={(names) => onChange({ ...draft, names })}
          />
        )}
        {step === 3 && (
          <>
            <CategoryChips
              locale={locale}
              region={region}
              value={draft.category}
              onChange={(category) => onChange({ ...draft, category })}
            />
            <section className="space-y-3 border-y border-line py-5" aria-label={m.summary}>
              <h3 className="font-bold">{m.summary}</h3>
              <ul>
                {draft.names
                  .filter((name) => name.value.trim())
                  .map((name, i) => (
                    <li className="break-words" key={i} lang={name.lang}>
                      {name.value}
                    </li>
                  ))}
              </ul>
              <p className="text-[13px] text-muted-foreground">
                {draft.pin ? m.pinPlaced : m.no_pin}
              </p>
              <p>
                {m.category}:{" "}
                {categoryOptions(region, locale).find((option) => option.key === draft.category)
                  ?.label ??
                  draft.category ??
                  m.noCategory}
              </p>
            </section>
            <p className="max-w-prose text-[15px] leading-relaxed">
              {onMap ? m.businessHint : m.draftHint}
            </p>
          </>
        )}
        {error && <Alert>{error}</Alert>}
        {reason && (
          <p id={reasonId} className="text-[15px] text-muted-foreground">
            {m[reason]}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            className="min-h-11 rounded-[10px] px-4 whitespace-normal"
            type="button"
            variant="outline"
            onClick={() => onStep?.(step === 1 ? 0 : step === 2 ? 1 : 2)}
          >
            {m.back}
          </Button>
          {step < 3 ? (
            <Button
              className="min-h-11 rounded-[10px] px-5 whitespace-normal"
              type="button"
              disabled={!!reason || pending}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => onStep?.(step === 1 ? 2 : 3)}
            >
              {m.next}
            </Button>
          ) : (
            <Button
              className="min-h-11 rounded-[10px] px-5 whitespace-normal"
              type="button"
              disabled={!!reason || pending}
              aria-describedby={reason ? reasonId : undefined}
              onClick={onCreate}
            >
              {pending ? m.pending : onMap ? m.create : m.createDraft}
            </Button>
          )}
        </div>
      </fieldset>
    </section>
  );
}

export function CategoryChips({
  locale,
  region,
  value,
  onChange,
}: {
  locale: Locale;
  region: RegionConfig;
  value?: string;
  onChange(value: string | undefined): void;
}) {
  const m = messagesFor(creatorMessages, locale);
  const options = categoryOptions(region, locale);
  const choices: { key: string; label: string }[] = [...options];
  if (value && !options.some((option) => option.key === value))
    choices.push({ key: value, label: value });
  return (
    <fieldset className="space-y-3">
      <legend className="text-[15px]">{m.category}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={(value ?? "") === option.key}
            onClick={() => onChange(option.key || undefined)}
            className={
              (value ?? "") === option.key
                ? "min-h-11 rounded-full border border-ai bg-ai px-4 py-2 text-white"
                : "min-h-11 rounded-full border border-input bg-white px-4 py-2 text-kon hover:bg-kamenozoki"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function CategorySelect({
  locale,
  region,
  value,
  onChange,
}: {
  locale: Locale;
  region: RegionConfig;
  value?: string;
  onChange(value: string | undefined): void;
}) {
  const id = useId();
  const m = messagesFor(creatorMessages, locale);
  const options = categoryOptions(region, locale);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{m.category}</Label>
      <select
        id={id}
        className="min-h-11 max-w-full rounded-[10px] border border-input p-2"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{m.noCategory}</option>
        {value && !options.some((entry) => entry.key === value) && (
          <option value={value}>{value}</option>
        )}
        {options.map((entry) => (
          <option key={entry.key} value={entry.key}>
            {entry.label}
          </option>
        ))}
      </select>
    </div>
  );
}
