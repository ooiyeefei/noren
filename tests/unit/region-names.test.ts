import { expect, it } from "vitest";
import { detectScript, pickPlaceName, type PlaceNameLike } from "../../src/lib/region/names";
import { activeRegionConfig } from "../../src/lib/region/registry";
import type { RegionConfig } from "../../src/lib/region/schema";

const malaysia = {
  defaultLocale: "en",
  nameLanguages: ["ms", "en", "zh", "ta"],
  nameFallback: { en: ["latin", "hanzi", "tamil"], ja: ["kanji", "kana", "latin", "hanzi", "tamil"] },
} satisfies Pick<RegionConfig, "defaultLocale" | "nameFallback"> & { nameLanguages: string[] };
const nagasaki = activeRegionConfig({ REGION_ID: "nagasaki" });

it("uses the region's name languages to distinguish Han characters", () => {
  expect(detectScript("長崎", malaysia)).toBe("hanzi");
  expect(detectScript("長崎", { nameLanguages: ["ja", "en"] })).toBe("kanji");
  expect(detectScript("長崎", {})).toBe("kanji");
});

it("selects Latin, then Hanzi, then Tamil for an English reader in Malaysia", () => {
  const names = ([
    ["ta", "பினாங்கு"],
    ["zh", "槟城"],
    ["en", "Penang"],
  ] as const).map(([lang, value]) => ({ lang, value, script: detectScript(value, malaysia), isPrimary: false }));
  expect(names.map((name) => name.script)).toEqual(["tamil", "hanzi", "latin"]);
  for (const length of [3, 2, 1]) {
    expect(pickPlaceName(names.slice(0, length), "en", malaysia).primary).toBe(names[length - 1]);
  }
});

it("preserves Nagasaki's Japanese and English fallback orders", () => {
  const kanji: PlaceNameLike = { lang: "ja", script: "kanji", value: "長崎", isPrimary: false };
  const kana: PlaceNameLike = { ...kanji, script: "kana", value: "ながさき" };
  const romaji: PlaceNameLike = { ...kanji, script: "romaji", value: "Nagasaki" };
  const latin: PlaceNameLike = { ...romaji, lang: "en", script: "latin" };
  for (const [locale, order] of [
    ["ja", [kanji, kana, romaji, latin]],
    ["en", [latin, romaji, kanji, kana]],
  ] as const) {
    for (const [index, expected] of order.entries()) {
      expect(pickPlaceName(order.slice(index).reverse(), locale, nagasaki).primary).toBe(expected);
    }
  }
});
