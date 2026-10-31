import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorHomeView } from "@/components/creator/creator-home-view";
import {
  NewPlaceView,
  PlaceNamesEditor,
  type NewPlaceViewProps,
} from "@/components/creator/new-place-view";
import {
  fieldsToNames,
  japaneseScript,
  namesToFields,
  prefillMapsResult,
  requestCreatorLocation,
  stepError,
  wizardHref,
  wizardStep,
} from "@/components/creator/place-wizard";
import {
  validatePlaceDraft,
  type NameDraft,
  type PlaceDraft,
} from "@/components/creator/place-form";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import { loadRegions } from "@/lib/region";

const region = [...loadRegions().values()][0]!;
const empty: PlaceDraft = { kind: "business", names: [], pin: null };
const names = fieldsToNames({ japanese: "仮のお店", english: "Mock shop" });
const valid: PlaceDraft = {
  ...empty,
  names,
  pin: { lat: region.defaultCenter.lat, lng: region.defaultCenter.lng },
};
const props: NewPlaceViewProps = {
  locale: "en",
  region,
  role: "creator",
  draft: empty,
  search: { query: "", pending: false, coolingDown: false },
  searchActions: { onQuery: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(), onConfirm: vi.fn() },
  onChange: vi.fn(),
  onCreate: vi.fn(),
  onStep: vi.fn(),
};
afterEach(() => vi.unstubAllGlobals());

describe("creator wizard names", () => {
  it.each(["かふぇ", "カフェ", "カフェ はち", "ｶﾌｪｰ", "カフェー", "がく"])(
    "detects kana: %s",
    (value) => expect(japaneseScript(value)).toBe("kana"),
  );
  it.each(["仮のお店", "喫茶カフェ", "Cafe 八", "", "123"])(
    "uses kanji for text that is not only kana: %s",
    (value) => expect(japaneseScript(value)).toBe("kanji"),
  );
  it("maps both simple fields to primary rows and back", () => {
    expect(names).toEqual([
      { lang: "ja", script: "kanji", value: "仮のお店", isPrimary: true },
      { lang: "en", script: "latin", value: "Mock shop", isPrimary: true },
    ]);
    expect(namesToFields(names)).toEqual({ japanese: "仮のお店", english: "Mock shop" });
    expect(fieldsToNames({ japanese: "カフェ", english: "" })).toEqual([
      { lang: "ja", script: "kana", value: "カフェ", isPrimary: true },
    ]);
    expect(fieldsToNames({ japanese: "  ", english: "Mock" })).toEqual([
      { lang: "en", script: "latin", value: "Mock", isPrimary: true },
    ]);
  });
  it("prefers the primary and retains other readings when a simple field changes", () => {
    const reading: NameDraft = { lang: "ja", script: "kana", value: "かり", isPrimary: false };
    const existing = [reading, ...names];
    expect(namesToFields(existing).japanese).toBe("仮のお店");
    const updated = fieldsToNames({ japanese: "新しい名前", english: "Mock" }, existing);
    expect(updated).toContainEqual(reading);
    expect(updated.filter((name) => name.lang === "ja" && name.isPrimary)).toHaveLength(1);
    expect(validatePlaceDraft({ ...valid, names: updated }, region)).toEqual({});
    expect(existing).toEqual([reading, ...names]);
  });
  it("maps a lone existing name without a primary and clears a removed simple field", () => {
    expect(namesToFields([{ ...names[0]!, isPrimary: false }])).toEqual({
      japanese: "仮のお店",
      english: "",
    });
    expect(fieldsToNames({ japanese: "", english: "Mock shop" }, names)).toEqual([names[1]]);
  });
  it("prefills Japanese and English maps names without placing a pin", () => {
    for (const [name, key] of [
      ["カフェ", "japanese"],
      ["Mock shop", "english"],
    ] as const) {
      const result = prefillMapsResult(empty, { name, lat: 32.750123, lng: 129.871234 });
      expect(namesToFields(result.names)[key]).toBe(name);
      expect(result.pin).toBeNull();
      expect(stepError(1, result, region)).toBe("no_pin");
    }
    expect(empty).toEqual({ kind: "business", names: [], pin: null });
  });
  it("preserves typed names, handles nameless maps results and leaves region validation intact", () => {
    expect(prefillMapsResult(valid, { name: "Another mock", lat: 90, lng: 180 }).names).toEqual(
      names,
    );
    const result = prefillMapsResult(valid, { lat: 90, lng: 180 });
    expect(result.names).toEqual(names);
    expect(result.pin).toEqual(valid.pin);
    expect(stepError(1, { ...result, pin: { lat: 90, lng: 180 } }, region)).toBe("outside_region");
  });
});

describe("creator wizard completeness", () => {
  it("requires a valid pin for step one and at least one valid name for step two", () => {
    expect(stepError(1, empty, region)).toBe("no_pin");
    expect(stepError(1, valid, region)).toBeUndefined();
    expect(stepError(2, empty, region)).toBe("no_name");
    expect(stepError(2, { ...valid, pin: null }, region)).toBeUndefined();
    expect(
      stepError(2, { ...valid, names: [{ ...names[0]!, value: "a".repeat(121) }] }, region),
    ).toBe("too_long");
    expect(
      stepError(2, { ...valid, names: [names[0]!, { ...names[0]!, value: "別名" }] }, region),
    ).toBe("two_primaries");
    expect(stepError(3, valid, region)).toBe("no_category");
    expect(stepError(3, { ...valid, category: "cafe" }, region)).toBeUndefined();
    expect(validatePlaceDraft(valid, region)).toEqual({});
  });
  it("keeps the wizard step in a shareable URL and tolerates invalid URL input", () => {
    expect(wizardHref("ja", 2)).toBe("/ja/creator?add=1&step=2");
    expect(wizardStep("2")).toBe(2);
    expect(wizardStep("3")).toBe(3);
    for (const value of [null, "1", "99", "-1", "hello"]) expect(wizardStep(value)).toBe(1);
  });
});

describe("creator geolocation", () => {
  it("returns a refusal when a mocked navigator denies permission", async () => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((_success, error) => {
      error?.({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    expect(await requestCreatorLocation()).toEqual({ ok: false });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });
  it("returns a refusal when geolocation is unavailable or throws", async () => {
    vi.stubGlobal("navigator", {});
    expect(await requestCreatorLocation()).toEqual({ ok: false });
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: () => {
          throw new Error("unavailable");
        },
      },
    });
    expect(await requestCreatorLocation()).toEqual({ ok: false });
  });
  it("returns the location as a picker pin", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              latitude: 32.75,
              longitude: 129.87,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: 0,
            toJSON: () => ({}),
          }),
      },
    });
    expect(await requestCreatorLocation()).toEqual({ ok: true, pin: { lat: 32.75, lng: 129.87 } });
  });
});

for (const locale of ["en", "ja"] as const)
  describe(`rendered wizard (${locale})`, () => {
    for (const step of [1, 2, 3] as const)
      it(`renders step ${step} with one page heading and live progress`, () => {
        const m = creatorMessages[locale];
        const html = renderToStaticMarkup(
          <CreatorHomeView locale={locale} region={region} places={[]}>
            <NewPlaceView {...props} locale={locale} step={step} draft={valid} />
          </CreatorHomeView>,
        );
        expect(html.match(/<h1\b/g)).toHaveLength(1);
        expect(html).toContain('id="main" tabindex="-1"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain(m.progress.replace("{step}", String(step)));
        expect(html).toContain([m.where, m.called, m.kindOfPlace][step - 1]);
        expect(html).toContain(m.back);
        if (step < 3) expect(html).toContain(`>${m.next}</button>`);
        else {
          expect(html).toContain(m.createDraft);
          expect(html).toContain(m.draftHint);
          expect(html).toContain(m.pinPlaced);
          expect(html).not.toContain("129.");
        }
      });
    for (const step of [1, 2] as const)
      it(`explains the disabled Next on incomplete step ${step}`, () => {
        const m = creatorMessages[locale];
        const html = renderToStaticMarkup(<NewPlaceView {...props} locale={locale} step={step} />);
        expect(html).toMatch(
          new RegExp(`disabled=""[^>]*aria-describedby="[^"]+"[^>]*>${m.next}</button>`),
        );
        expect(html).toContain(step === 1 ? m.no_pin : m.no_name);
      });
    it("shows two named fields before the full rows disclosure", () => {
      const m = creatorMessages[locale];
      const html = renderToStaticMarkup(
        <PlaceNamesEditor
          locale={locale}
          locales={region.locales}
          names={names}
          onChange={vi.fn()}
        />,
      );
      const simple = html.slice(0, html.indexOf("<details"));
      expect(simple.match(/<input\b/g)).toHaveLength(2);
      expect(simple).toContain(m.japaneseName);
      expect(simple).toContain(m.englishName);
      expect(html).toContain(m.extraNames);
      for (const label of [m.language, m.script, m.primary]) expect(html).toContain(label);
    });
  });
