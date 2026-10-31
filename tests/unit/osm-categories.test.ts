import { describe, expect, it } from "vitest";
import { categoryForTags } from "../../src/lib/osm/categories";
import { isChainFromTags, namesFromTags, pickTags } from "../../src/lib/osm/tags";

// All fixtures are synthetic; none describe a real business.
describe("OSM categories and tags", () => {
  it("isChainFromTags: brand, brand:wikidata, blank brand, none", () => {
    expect(isChainFromTags({ brand: "Synthetic Brand" })).toBe(true);
    expect(isChainFromTags({ "brand:wikidata": "Q123" })).toBe(true);
    expect(isChainFromTags({ brand: " \t\n" })).toBe(false);
    expect(isChainFromTags({ brand: "", "brand:wikidata": " " })).toBe(false);
    expect(isChainFromTags({ brand: " ", "brand:wikidata": "Q123" })).toBe(true);
    expect(isChainFromTags({ name: "Synthetic Local" })).toBe(false);
    for (const tags of [null, undefined, [], 5, { brand: 123 }])
      expect(isChainFromTags(tags)).toBe(false);
  });
  it("category mapping table: every documented row, plus unknown tags -> other", () => {
    const rows = [
      ["amenity", "restaurant", "restaurant"],
      ["amenity", "fast_food", "restaurant"],
      ["amenity", "food_court", "restaurant"],
      ["amenity", "ice_cream", "restaurant"],
      ["amenity", "cafe", "cafe"],
      ["amenity", "bar", "bar"],
      ["amenity", "pub", "bar"],
      ["amenity", "biergarten", "bar"],
      ["amenity", "nightclub", "bar"],
      ["cuisine", "izakaya", "bar"],
      ["tourism", "hotel", "stay"],
      ["tourism", "guest_house", "stay"],
      ["tourism", "hostel", "stay"],
      ["tourism", "motel", "stay"],
      ["amenity", "public_bath", "bath"],
      ["shop", "musical_instrument", "music_shop"],
      ["shop", "music", "music_shop"],
      ["shop", "records", "music_shop"],
      ["shop", "art", "gallery"],
      ["tourism", "gallery", "gallery"],
      ["tourism", "museum", "museum"],
      ["shop", "synthetic_unknown", "shop"],
      ["craft", "synthetic_unknown", "shop"],
      ["tourism", "attraction", "attraction"],
      ["tourism", "viewpoint", "attraction"],
      ["tourism", "artwork", "attraction"],
      ["historic", "synthetic_unknown", "attraction"],
      ["unknown", "unknown", "other"],
      ["amenity", "unknown", "other"],
      // The owner left pharmacies out; campsites and public cabins are not local businesses.
      ["amenity", "pharmacy", "other"],
      ["tourism", "camp_site", "other"],
      ["tourism", "chalet", "other"],
    ];
    for (const [key, value, expected] of rows)
      expect(categoryForTags({ [key!]: value! }), `${key}=${value}`).toBe(expected);
    expect(categoryForTags({})).toBe("other");
    expect(categoryForTags({ shop: "" })).toBe("other");
  });
  it("an izakaya restaurant is a bar", () => {
    expect(categoryForTags({ amenity: "restaurant", cuisine: "izakaya" })).toBe("bar");
    expect(categoryForTags({ amenity: "restaurant", cuisine: "japanese; izakaya" })).toBe("bar");
  });
  it("a ryokan that also opens its bath is a place to stay", () => {
    expect(categoryForTags({ tourism: "hotel", amenity: "public_bath" })).toBe("stay");
    expect(categoryForTags({ tourism: "guest_house", amenity: "public_bath" })).toBe("stay");
  });
  it("a museum with a gift shop is a museum, and a library stays out of the map", () => {
    expect(categoryForTags({ tourism: "museum", shop: "gift" })).toBe("museum");
    expect(categoryForTags({ amenity: "library" })).toBe("other");
  });
  it("a musical instrument shop is a music_shop", () => {
    expect(categoryForTags({ shop: "musical_instrument" })).toBe("music_shop");
  });
  it("pickTags drops address, phone, website and unknown keys", () => {
    expect(
      pickTags({
        name: "  Synthetic Cafe  ",
        "addr:street": "mock street",
        phone: "mock",
        website: "https://example.invalid",
        opening_hours: "mock",
        operator: "mock",
        email: "mock",
        unknown: "mock",
        cuisine: "x".repeat(230),
        shop: 9,
      }),
    ).toEqual({ name: "Synthetic Cafe", cuisine: "x".repeat(200) });
    for (const garbage of [null, undefined, "text", [], 5]) expect(pickTags(garbage)).toEqual({});
  });
  it("namesFromTags never invents a translation", () => {
    expect(namesFromTags({ name: "架空の喫茶店" })).toEqual({
      ja: "架空の喫茶店",
      primary: "架空の喫茶店",
    });
    expect(namesFromTags({ name: "Synthetic Cafe" })).toEqual({
      en: "Synthetic Cafe",
      primary: "Synthetic Cafe",
    });
    expect(
      namesFromTags({ name: "架空の店", "name:ja": "架空店", "name:en": "Synthetic Shop" }),
    ).toEqual({ ja: "架空店", en: "Synthetic Shop", primary: "架空の店" });
    expect(namesFromTags({ "name:ja-Hrkt": "カクウ" })).toEqual({ primary: "カクウ" });
    expect(namesFromTags({ name: "架空 Cafe" }).en).toBeUndefined();
    expect(namesFromTags({})).toEqual({});
  });
});
