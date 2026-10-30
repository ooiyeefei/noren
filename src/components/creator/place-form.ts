import { describeSource } from "@/lib/adapters";
import type { PlaceKind, Script, SourceAdapterId } from "@/lib/domain/constants";
import type { RegionConfig } from "@/lib/region";

import type { MapsSuggestion } from "@/lib/geo/maps-link";

export type NameDraft = { lang: string; script: Script; value: string; isPrimary: boolean };
export type PlaceDraft = {
  kind: PlaceKind;
  category?: string;
  names: NameDraft[];
  pin: { lat: number; lng: number } | null;
};
export type NameError =
  | "blank"
  | "too_long"
  | "duplicate"
  | "two_primaries"
  | "no_name"
  | "too_many"
  | "outside_region"
  | "no_pin";
export type PlaceErrors = Partial<Record<"names" | "pin" | `name.${number}`, NameError>>;

export function validatePlaceDraft(
  draft: PlaceDraft,
  region: Pick<RegionConfig, "locales" | "bbox">,
): PlaceErrors {
  const errors: PlaceErrors = {};
  if (!draft.names.length || !draft.names.some((n) => n.value.trim())) errors.names = "no_name";
  if (draft.names.length > 12) errors.names = "too_many";
  const seen = new Set<string>();
  const primaries = new Set<string>();
  draft.names.forEach((name, i) => {
    const value = name.value.trim();
    const key = JSON.stringify([name.lang, name.script, value]);
    if (!value) errors[`name.${i}`] = "blank";
    else if (value.length > 120) errors[`name.${i}`] = "too_long";
    else if (!region.locales.includes(name.lang)) errors[`name.${i}`] = "outside_region";
    else if (seen.has(key)) errors[`name.${i}`] = "duplicate";
    else if (name.isPrimary && primaries.has(name.lang)) errors[`name.${i}`] = "two_primaries";
    seen.add(key);
    if (name.isPrimary) primaries.add(name.lang);
  });
  const [w, s, e, n] = region.bbox;
  const pin = draft.pin;
  if (!pin) errors.pin = "no_pin";
  else if (
    !Number.isFinite(pin.lat) ||
    !Number.isFinite(pin.lng) ||
    pin.lng < w ||
    pin.lng > e ||
    pin.lat < s ||
    pin.lat > n
  )
    errors.pin = "outside_region";
  return errors;
}

export function toCreateArgs(
  draft: PlaceDraft,
  regionId: string,
): {
  regionId: string;
  kind: "business";
  category?: string;
  names: NameDraft[];
  pin: { lat: number; lng: number };
} {
  if (!draft.pin) throw new Error("no_pin");
  const names = draft.names
    .filter((n) => n.value.trim())
    .map((n) => ({ ...n, value: n.value.trim() }));
  const primary = new Set(names.filter((n) => n.isPrimary).map((n) => n.lang));
  for (const name of names)
    if (!primary.has(name.lang)) {
      name.isPrimary = true;
      primary.add(name.lang);
    }
  return {
    regionId,
    kind: "business",
    ...(draft.category ? { category: draft.category } : {}),
    names,
    pin: { ...draft.pin },
  };
}

export function defaultNameRows(locales: readonly string[]): NameDraft[] {
  return locales.flatMap((lang) =>
    (lang === "ja" ? (["kanji", "kana"] as const) : (["latin"] as const)).map((script) => ({
      lang,
      script,
      value: "",
      isPrimary: false,
    })),
  );
}

export type SourceDraft = {
  url: string;
  title: string;
  note: string;
  noteLang: string;
  authorHandle: string;
  authorUrl: string;
};
export function previewSource(
  url: string,
  enabled: readonly SourceAdapterId[],
):
  | {
      ok: true;
      platform: string;
      linkCard: boolean;
      suggestedAuthor: { handle: string; url: string } | null;
    }
  | { ok: false; reason: string } {
  const result = describeSource(url, enabled);
  return result.ok
    ? {
        ok: true,
        platform: result.source.platform,
        linkCard: result.source.adapter === "link_card",
        suggestedAuthor: result.source.author,
      }
    : result;
}
export function toAddSourceArgs(
  draft: SourceDraft,
  placeId: string,
):
  | {
      ok: true;
      args: {
        placeId: string;
        url: string;
        title?: string;
        note?: string;
        noteLang?: string;
        authorHandle?: string;
        authorUrl?: string;
      };
    }
  | { ok: false; field: keyof SourceDraft } {
  if (!draft.url.trim()) return { ok: false, field: "url" };
  if (draft.title.trim().length > 200) return { ok: false, field: "title" };
  if (draft.note.trim().length > 1000) return { ok: false, field: "note" };
  if (draft.note.trim() && !draft.noteLang.trim()) return { ok: false, field: "noteLang" };
  if (draft.authorUrl.trim()) {
    try {
      if (new URL(draft.authorUrl.trim()).protocol !== "https:")
        return { ok: false, field: "authorUrl" };
    } catch {
      return { ok: false, field: "authorUrl" };
    }
  }
  const args: Extract<ReturnType<typeof toAddSourceArgs>, { ok: true }>["args"] = {
    placeId,
    url: draft.url.trim(),
  };
  for (const key of ["title", "note", "noteLang", "authorHandle", "authorUrl"] as const) {
    const value = draft[key].trim();
    if (value && (key !== "noteLang" || draft.note.trim())) args[key] = value;
  }
  return { ok: true, args };
}

export function applyMapsSuggestion(draft: PlaceDraft, suggestion: MapsSuggestion): PlaceDraft {
  const primary = draft.names.findIndex((name) => name.isPrimary);
  const index = primary >= 0 ? primary : 0;
  return {
    ...draft,
    names: draft.names.map((name, i) =>
      i === index && !name.value.trim() && suggestion.name
        ? { ...name, value: suggestion.name, isPrimary: true }
        : name,
    ),
  };
}
