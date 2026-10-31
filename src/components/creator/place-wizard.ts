import type { MapsSuggestion } from "@/lib/geo/maps-link";
import type { RegionConfig } from "@/lib/region";
import { validatePlaceDraft, type NameDraft, type PlaceDraft } from "./place-form";

export type WizardStep = 1 | 2 | 3;
export type NameFields = { japanese: string; english: string };

export function japaneseScript(text: string): "kana" | "kanji" {
  const compact = text.normalize("NFKC").replace(/\s/g, "");
  return compact && /^[\p{Script=Hiragana}\p{Script=Katakana}ー゙゚]+$/u.test(compact)
    ? "kana"
    : "kanji";
}

export function simpleNameIndex(names: NameDraft[], lang: "ja" | "en"): number {
  const matches = (name: NameDraft) =>
    name.lang === lang &&
    (lang === "ja" ? name.script === "kanji" || name.script === "kana" : name.script === "latin");
  const primary = names.findIndex((name) => matches(name) && name.isPrimary);
  return primary >= 0 ? primary : names.findIndex(matches);
}

export function namesToFields(names: NameDraft[]): NameFields {
  return {
    japanese: names[simpleNameIndex(names, "ja")]?.value ?? "",
    english: names[simpleNameIndex(names, "en")]?.value ?? "",
  };
}

export function fieldsToNames(fields: NameFields, existing: NameDraft[] = []): NameDraft[] {
  const ja = simpleNameIndex(existing, "ja");
  const en = simpleNameIndex(existing, "en");
  const names: NameDraft[] = [];
  if (fields.japanese.trim())
    names.push({
      lang: "ja",
      script: japaneseScript(fields.japanese),
      value: fields.japanese,
      isPrimary: true,
    });
  if (fields.english.trim())
    names.push({ lang: "en", script: "latin", value: fields.english, isPrimary: true });
  return names.concat(
    existing
      .filter((_, index) => index !== ja && index !== en)
      .map((name) => ({
        ...name,
        isPrimary:
          (name.lang === "ja" && fields.japanese.trim()) ||
          (name.lang === "en" && fields.english.trim())
            ? false
            : name.isPrimary,
      })),
  );
}

export function prefillMapsResult(draft: PlaceDraft, suggestion: MapsSuggestion): PlaceDraft {
  const fields = namesToFields(draft.names);
  const key = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(suggestion.name ?? "")
    ? "japanese"
    : "english";
  return {
    ...draft,
    names:
      suggestion.name && !fields[key].trim()
        ? fieldsToNames({ ...fields, [key]: suggestion.name }, draft.names)
        : draft.names,
  };
}

export function stepError(
  step: WizardStep,
  draft: PlaceDraft,
  region: Pick<RegionConfig, "locales" | "bbox">,
) {
  const errors = validatePlaceDraft(draft, region);
  if (step === 1) return errors.pin;
  if (step === 2) return Object.entries(errors).find(([key]) => key !== "pin")?.[1];
  // A place goes on the map as soon as it is added, and the map needs to know what kind it is.
  return draft.category ? undefined : "no_category";
}

export function wizardStep(value: string | null): WizardStep {
  return value === "2" ? 2 : value === "3" ? 3 : 1;
}

export function wizardHref(locale: string, step: WizardStep): string {
  return `/${locale}/creator?add=1&step=${step}`;
}

export type LocationResult = { ok: true; pin: NonNullable<PlaceDraft["pin"]> } | { ok: false };
export function requestCreatorLocation(
  browser: Pick<Navigator, "geolocation"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<LocationResult> {
  return new Promise((resolve) => {
    try {
      if (!browser?.geolocation) return resolve({ ok: false });
      browser.geolocation.getCurrentPosition(
        ({ coords }) => {
          const pin = { lat: coords.latitude, lng: coords.longitude };
          resolve(
            Number.isFinite(pin.lat) &&
              Number.isFinite(pin.lng) &&
              Math.abs(pin.lat) <= 90 &&
              Math.abs(pin.lng) <= 180
              ? { ok: true, pin }
              : { ok: false },
          );
        },
        () => resolve({ ok: false }),
        { timeout: 10000, maximumAge: 0 },
      );
    } catch {
      resolve({ ok: false });
    }
  });
}
