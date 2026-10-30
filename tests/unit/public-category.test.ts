import { expect, it } from "vitest";
import { categoryOptions, labelForCategory } from "@/components/public/category";
import { getRegionConfig } from "@/lib/region/registry";
import { publicMessages } from "@/lib/i18n/messages/public";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";

const region = getRegionConfig("nagasaki")!;
it("the category filter lists focus categories first, in the viewer's language", () => {
  const shuffled = { ...region, categories: [...region.categories!].reverse() };
  for (const locale of ["ja", "en"] as const) {
    const options = categoryOptions(shuffled, locale);
    expect(options.map((entry) => entry.focus)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    for (const option of options) {
      const source = region.categories!.find((entry) => entry.key === option.key)!;
      expect(option.label).toBe(source.labels[locale]);
      expect(option.unreviewed).toBe(source.labelsReviewedBy === null);
    }
  }
  expect(categoryOptions({ ...region, categories: undefined }, "en")).toEqual([]);
});
it("an unknown category key falls back to the key, never an empty label", () => {
  expect(labelForCategory(region, "unknown-key", "en")).toBe("unknown-key");
});
it("reviewed category labels are marked reviewed", () => {
  const categories = region.categories!.map((entry) => ({
    ...entry,
    labelsReviewedBy: "Mock reviewer",
  }));
  expect(categoryOptions({ ...region, categories }, "ja").every((entry) => !entry.unreviewed)).toBe(
    true,
  );
});
it("no landmark or 名所 wording remains in any public or creator message in either language", () => {
  for (const table of [publicMessages, creatorMessages, placeUiMessages]) {
    for (const locale of ["ja", "en"] as const) {
      expect(JSON.stringify(table[locale])).not.toMatch(/landmark|名所|ランドマーク/i);
    }
  }
});
