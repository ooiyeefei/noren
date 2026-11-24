import { expect, it } from "vitest";
import { getRegionConfig } from "@/lib/region/registry";
import { importBoxes, insideImportBox, parseOverpass } from "@/lib/osm/overpass";
import { namesFromTags } from "@/lib/osm/tags";
import { overtureNameTags } from "@/lib/overture/place";
import { listingNames } from "@/lib/osm/listings";
const region = getRegionConfig("malaysia-west")!;
const langs = region.nameLanguages!;
const common = { ms: "Contoh", en: "Example", zh: "示例", ta: "மாதிரி" };
it("carries configured names through both sources and discards unrelated tags", () => {
  const raw = overtureNameTags({ names: { primary: common.ms, common } });
  const [candidate] = parseOverpass(
    {
      elements: [
        {
          id: 1,
          type: "node",
          lat: 4.58,
          lon: 101.08,
          tags: { ...raw, amenity: "cafe", "diet:halal": "yes", "name:ja": "例" },
        },
      ],
    },
    undefined,
    langs,
  );
  expect(candidate?.tags).toEqual({ ...raw, amenity: "cafe" });
  expect(namesFromTags(candidate!.tags, langs)).toEqual({ ...common, primary: common.ms });
  expect(listingNames(raw, langs).map(({ lang, script }) => [lang, script])).toEqual([
    ["ms", "latin"],
    ["en", "latin"],
    ["zh", "hanzi"],
    ["ta", "tamil"],
  ]);
});
it("uses each configured Malaysian town box and the whole Nagasaki box", () => {
  const boxes = importBoxes(region);
  expect(boxes.map((b) => b.id)).toEqual(region.towns!.map((t) => t.id));
  expect(boxes.every((b) => !insideImportBox({ lat: 3.14, lng: 101.69 }, b.bbox))).toBe(true);
  for (const [i, town] of region.towns!.entries())
    expect(insideImportBox(town.center, boxes[i]!.bbox)).toBe(true);
  const home = getRegionConfig("nagasaki")!;
  expect(importBoxes(home)).toEqual([{ id: home.id, bbox: home.bbox }]);
});
