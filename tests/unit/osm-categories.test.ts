import { describe, expect, it } from "vitest";
import { categoryForTags, isForVisitors } from "../../src/lib/osm/categories";
import {
  branchOf,
  chainNames,
  isChainFromTags,
  namesFromTags,
  pickTags,
} from "../../src/lib/osm/tags";

// All fixtures are synthetic; none describe a real business.
describe("OSM categories and tags", () => {
  it("isForVisitors keeps places worth a visit and drops errands and chains of shops and food", () => {
    const visit = (tags: Record<string, string>, isChain = false) =>
      isForVisitors({ name: "架空", ...tags }, isChain);
    for (const shop of ["confectionery", "bakery", "books", "second_hand", "alcohol", "gift;books"])
      expect(visit({ shop }), shop).toBe(true);
    for (const shop of ["convenience", "supermarket", "car", "hairdresser", "mobile_phone", "yes"])
      expect(visit({ shop }), shop).toBe(false);
    expect(visit({ craft: "pottery" })).toBe(true);
    expect(visit({ craft: "caterer" })).toBe(false);
    // A shop tag decides over a craft tag; other categories are not shops.
    expect(visit({ shop: "convenience", craft: "confectionery" })).toBe(false);
    for (const tags of [
      { amenity: "cafe" },
      { tourism: "museum" },
      { historic: "memorial" },
    ] as Record<string, string>[])
      expect(visit(tags)).toBe(true);
    // A chain shop or place to eat is the same everywhere; a chain hotel still gives a traveller a bed.
    expect(visit({ shop: "books" }, true)).toBe(false);
    expect(visit({ amenity: "fast_food" }, true)).toBe(false);
    expect(visit({ tourism: "hotel" }, true)).toBe(true);
  });
  it("chainNames drops a trailing branch name; branchOf finds untagged branches and nothing else", () => {
    expect(chainNames({ name: "架空亭 本町店", "name:en": "Kakuutei" })).toEqual([
      "架空亭",
      "kakuutei",
    ]);
    expect(chainNames({ name: "架空珈琲店" })).toEqual(["架空珈琲店"]);
    expect(chainNames({ name: "X" })).toEqual([]);
    const chains = ["架空亭", "kakuutei"];
    for (const name of [
      "架空亭",
      "架空亭 駅前店",
      "架空亭　駅前店",
      "架空亭長崎駅前店",
      "架空亭 Annex",
    ])
      expect(branchOf({ name }, chains), name).toBe("架空亭");
    expect(branchOf({ name: "別の名前", "name:en": "Kakuutei Station" }, chains)).toBe("kakuutei");
    // Another chain whose name only starts the same way, and a word that starts with the chain's name.
    for (const name of ["架空亭サン 木鉢店", "架空亭ロノミア", "本町の架空亭"])
      expect(branchOf({ name }, chains), name).toBeUndefined();
  });
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
