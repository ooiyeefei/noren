import { applyMapsSuggestion } from "@/components/creator/place-form";
import { describe, expect, it } from "vitest";
import {
  defaultNameRows,
  previewSource,
  toAddSourceArgs,
  toCreateArgs,
  validatePlaceDraft,
  type NameDraft,
  type PlaceDraft,
  type SourceDraft,
} from "@/components/creator/place-form";
import { SOURCE_ADAPTER_IDS } from "@/lib/domain/constants";

const region = {
  locales: ["ja", "en"],
  bbox: [129, 32, 130, 33] as [number, number, number, number],
};
const name: NameDraft = { lang: "ja", script: "kanji", value: "仮の場所", isPrimary: false };
const draft: PlaceDraft = { kind: "business", names: [name], pin: { lat: 32.5, lng: 129.5 } };
const source: SourceDraft = {
  url: " https://example.com/mock ",
  title: " Mock title ",
  note: "",
  noteLang: "en",
  authorHandle: " @typed_mock ",
  authorUrl: " https://example.com/typed_mock ",
};
describe("creator forms", () => {
  it("a valid draft has no errors", () => expect(validatePlaceDraft(draft, region)).toEqual({}));
  it("a draft with no name is refused with the names key", () =>
    expect(validatePlaceDraft({ ...draft, names: [] }, region)).toEqual({ names: "no_name" }));
  it("a blank name and a 121-character name are refused with their row keys", () => {
    expect(validatePlaceDraft({ ...draft, names: [{ ...name, value: " " }] }, region)).toEqual({
      names: "no_name",
      "name.0": "blank",
    });
    expect(
      validatePlaceDraft({ ...draft, names: [{ ...name, value: "a".repeat(121) }] }, region),
    ).toEqual({ "name.0": "too_long" });
  });
  it("two primaries in one language and more than 12 names are refused", () => {
    expect(
      validatePlaceDraft(
        {
          ...draft,
          names: [
            { ...name, isPrimary: true },
            { ...name, value: "別名", isPrimary: true },
          ],
        },
        region,
      ),
    ).toEqual({ "name.1": "two_primaries" });
    expect(
      validatePlaceDraft(
        {
          ...draft,
          names: Array.from({ length: 13 }, (_, i) => ({ ...name, value: `Mock ${i}` })),
        },
        region,
      ).names,
    ).toBe("too_many");
  });
  it("duplicate names and non-region languages are refused", () => {
    expect(
      validatePlaceDraft(
        { ...draft, names: [name, { ...name, value: ` ${name.value} ` }] },
        region,
      ),
    ).toEqual({ "name.1": "duplicate" });
    expect(validatePlaceDraft({ ...draft, names: [{ ...name, lang: "fr" }] }, region)).toEqual({
      "name.0": "outside_region",
    });
  });
  it("a pin outside the region bbox and a missing pin are refused", () => {
    for (const pin of [
      { lat: 34, lng: 129.5 },
      { lat: 32.5, lng: 128 },
      { lat: NaN, lng: 129.5 },
      { lat: 32.5, lng: Infinity },
    ])
      expect(validatePlaceDraft({ ...draft, pin }, region).pin).toBe("outside_region");
    expect(validatePlaceDraft({ ...draft, pin: null }, region).pin).toBe("no_pin");
  });
  it("toCreateArgs trims, drops blank rows and marks the first name of each language primary", () => {
    const input = {
      ...draft,
      names: [
        { ...name, value: " 仮の場所 " },
        { ...name, script: "kana" as const, value: "かり" },
        { ...name, value: " " },
        { ...name, lang: "en", script: "latin" as const, value: " Mock place " },
      ],
    };
    const result = toCreateArgs(input, "mock-region");
    expect(result).toEqual({
      regionId: "mock-region",
      kind: "business",
      pin: draft.pin,
      names: [
        { ...name, isPrimary: true },
        { ...name, script: "kana", value: "かり" },
        { ...name, lang: "en", script: "latin", value: "Mock place", isPrimary: true },
      ],
    });
    expect(input.names[0]?.value).toBe(" 仮の場所 ");
    expect(() => toCreateArgs({ ...draft, pin: null }, "mock")).toThrow("no_pin");
  });
  it("keeps an explicitly chosen primary", () => {
    const names = toCreateArgs(
      { ...draft, names: [name, { ...name, value: "別名", isPrimary: true }] },
      "mock",
    ).names;
    expect(names.map((n) => n.isPrimary)).toEqual([false, true]);
  });
  it("defaultNameRows gives kanji and kana for ja and latin for en", () =>
    expect(defaultNameRows(["ja", "en"])).toEqual([
      { lang: "ja", script: "kanji", value: "", isPrimary: false },
      { lang: "ja", script: "kana", value: "", isPrimary: false },
      { lang: "en", script: "latin", value: "", isPrimary: false },
    ]));
  it("previewSource names Instagram, falls back to a link card, and refuses unsafe URLs", () => {
    expect(previewSource("https://www.instagram.com/p/mock/", SOURCE_ADAPTER_IDS)).toMatchObject({
      ok: true,
      platform: "instagram",
      linkCard: false,
    });
    expect(previewSource("http://example.com/mock", SOURCE_ADAPTER_IDS)).toMatchObject({
      ok: true,
      linkCard: true,
    });
    for (const url of [
      "javascript:alert(1)",
      "https://127.0.0.1/mock",
      "https://[::1]/mock",
      "https://example.com:8080/mock",
    ])
      expect(previewSource(url, SOURCE_ADAPTER_IDS).ok).toBe(false);
  });
  it("previewSource suggests the TikTok handle from the URL and none for an X post", () => {
    expect(
      previewSource("https://www.tiktok.com/@mock_creator/video/123456789", SOURCE_ADAPTER_IDS),
    ).toMatchObject({ ok: true, suggestedAuthor: { handle: "@mock_creator" } });
    expect(
      previewSource("https://x.com/mock_creator/status/123456789", SOURCE_ADAPTER_IDS),
    ).toMatchObject({ ok: true, suggestedAuthor: null });
  });
  it("toAddSourceArgs sends the typed author, omits blank fields and refuses a non-https author link", () => {
    expect(toAddSourceArgs(source, "mock-place")).toEqual({
      ok: true,
      args: {
        placeId: "mock-place",
        url: "https://example.com/mock",
        title: "Mock title",
        authorHandle: "@typed_mock",
        authorUrl: "https://example.com/typed_mock",
      },
    });
    expect(
      toAddSourceArgs({ ...source, authorUrl: "http://example.com/mock" }, "mock-place"),
    ).toEqual({ ok: false, field: "authorUrl" });
    expect(
      toAddSourceArgs({ ...source, authorUrl: "", authorHandle: "", title: "" }, "mock-place"),
    ).toEqual({ ok: true, args: { placeId: "mock-place", url: "https://example.com/mock" } });
  });
  it("source field limits and note language are checked", () => {
    expect(toAddSourceArgs({ ...source, title: "a".repeat(201) }, "p")).toEqual({
      ok: false,
      field: "title",
    });
    expect(toAddSourceArgs({ ...source, note: "a".repeat(1001) }, "p")).toEqual({
      ok: false,
      field: "note",
    });
    expect(toAddSourceArgs({ ...source, note: "Mock", noteLang: "" }, "p")).toEqual({
      ok: false,
      field: "noteLang",
    });
  });
});

it("the creator form sends business even for a legacy kind", () => {
  expect(toCreateArgs({ ...draft, kind: "landmark" }, "nagasaki").kind).toBe("business");
});
it("the creator form sends the chosen category", () => {
  expect(toCreateArgs({ ...draft, category: "cafe" }, "nagasaki").category).toBe("cafe");
  expect(toCreateArgs(draft, "nagasaki")).not.toHaveProperty("category");
});

it("a suggestion fills a blank name and keeps a typed one", () => {
  const suggestion = { name: "Mock shop", lat: 32.7, lng: 129.8 };
  const blank = { ...draft, names: [{ ...name, value: " " }] };
  expect(applyMapsSuggestion(blank, suggestion).names[0]).toMatchObject({
    value: "Mock shop",
    isPrimary: true,
  });
  expect(applyMapsSuggestion(draft, suggestion).names).toEqual(draft.names);
  expect(blank.names[0]?.value).toBe(" ");
  expect(applyMapsSuggestion(blank, { lat: 32, lng: 129 }).names).toEqual(blank.names);
});
it("the pin moves to the suggestion and still requires a region-bbox check", () => {
  const result = applyMapsSuggestion(draft, { lat: 90, lng: 180 });
  expect(result.pin).toEqual({ lat: 90, lng: 180 });
  expect(validatePlaceDraft(result, region).pin).toBe("outside_region");
});
it("a suggestion targets the primary row rather than another language", () => {
  const result = applyMapsSuggestion(
    {
      ...draft,
      names: [
        { ...name, value: "Typed" },
        { ...name, value: "", isPrimary: true },
      ],
    },
    { name: "Mock", lat: 32, lng: 129 },
  );
  expect(result.names.map((n) => n.value)).toEqual(["Typed", "Mock"]);
});
