import { expect, it } from "vitest";
import { pickPlaceName, type PlaceNameLike } from "../../src/lib/region/names";
import { activeRegionConfig } from "../../src/lib/region/registry";

const region = activeRegionConfig({});
const kanji: PlaceNameLike = { lang: "ja", script: "kanji", value: "テスト橋", isPrimary: false };
const romaji: PlaceNameLike = {
  lang: "ja",
  script: "romaji",
  value: "Tesuto-bashi",
  isPrimary: false,
};
const latin: PlaceNameLike = {
  lang: "en",
  script: "latin",
  value: "Test Bridge",
  isPrimary: false,
};
const names = [latin, romaji, kanji];

it("ja picks the kanji name and offers the romaji as secondary", () => {
  expect(pickPlaceName(names, "ja", region)).toEqual({ primary: kanji, secondary: romaji });
});
it("en picks the latin name and offers the kanji", () => {
  expect(pickPlaceName([kanji, latin], "en", region)).toEqual({ primary: latin, secondary: kanji });
});
it("a locale without nameFallback uses the default locale's order", () => {
  expect(pickPlaceName(names, "fr", region)).toEqual({ primary: kanji, secondary: romaji });
});
it("isPrimary wins within one script", () => {
  const primary = { ...kanji, value: "テスト大橋", isPrimary: true };
  expect(pickPlaceName([kanji, primary], "ja", region).primary).toBe(primary);
});
it("names in the page's language win within one script", () => {
  const other = { ...latin, lang: "fr", isPrimary: true };
  expect(pickPlaceName([other, latin], "en", region).primary).toBe(latin);
});
it("no names gives nulls", () => {
  expect(pickPlaceName([], "ja", region)).toEqual({ primary: null, secondary: null });
});
it("a single name has no secondary", () => {
  expect(pickPlaceName([kanji], "ja", region)).toEqual({ primary: kanji, secondary: null });
});
it("ties keep input order and secondary must differ in script and value", () => {
  const sameValue = { ...romaji, value: kanji.value };
  const sameScript = { ...kanji, value: "テスト大橋" };
  expect(pickPlaceName([kanji, sameScript, sameValue, latin], "ja", region)).toEqual({
    primary: kanji,
    secondary: latin,
  });
});
