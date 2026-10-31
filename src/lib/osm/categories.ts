export type OsmCategory =
  | "restaurant"
  | "cafe"
  | "bar"
  | "stay"
  | "bath"
  | "shop"
  | "music_shop"
  | "gallery"
  | "museum"
  | "attraction"
  | "other";

// First matching OSM tag row wins. Cuisine precedes amenity so an izakaya restaurant is a bar, a
// stay precedes a bath so a ryokan that also opens its bath to visitors stays a ryokan, and a museum
// precedes a shop so a museum with a gift shop stays a museum.
export const CATEGORY_ROWS: readonly {
  key: string;
  values?: readonly string[];
  category: OsmCategory;
}[] = [
  { key: "cuisine", values: ["izakaya"], category: "bar" },
  {
    key: "amenity",
    values: ["restaurant", "fast_food", "food_court", "ice_cream"],
    category: "restaurant",
  },
  { key: "amenity", values: ["cafe"], category: "cafe" },
  { key: "amenity", values: ["bar", "pub", "biergarten", "nightclub"], category: "bar" },
  // Hotels, ryokan, minshuku and guesthouses; campsites and public cabins are not local businesses.
  { key: "tourism", values: ["hotel", "guest_house", "hostel", "motel"], category: "stay" },
  { key: "amenity", values: ["public_bath"], category: "bath" },
  { key: "shop", values: ["musical_instrument", "music", "records"], category: "music_shop" },
  { key: "shop", values: ["art"], category: "gallery" },
  { key: "tourism", values: ["gallery"], category: "gallery" },
  // OSM cannot tell a small picture book museum from a famous one, so all museums share a category.
  { key: "tourism", values: ["museum"], category: "museum" },
  { key: "shop", category: "shop" },
  { key: "craft", category: "shop" },
  { key: "tourism", values: ["attraction", "viewpoint", "artwork"], category: "attraction" },
  { key: "historic", category: "attraction" },
];

/**
 * Noren maps places worth a visit, not errands (owner, 2026-10-31): someone who needs a convenience
 * store, a supermarket or a phone shop has other maps. A shop or craft stays only when its type is
 * listed here; every other shop type is an errand.
 */
export const VISIT_SHOP_TYPES: readonly string[] = [
  // Food and drink to take home: castella makers, bakeries, sake shops.
  "confectionery",
  "pastry",
  "bakery",
  "chocolate",
  "deli",
  "tea",
  "coffee",
  "alcohol",
  "wine",
  "cheese",
  "seafood",
  // Shops with something to look at or a person behind the counter.
  "books",
  "gift",
  "second_hand",
  "antiques",
  "craft",
  "pottery",
  "toys",
  "hobby",
  "games",
  "anime",
  "collector",
  "model",
  "kimono",
  "fabric",
  "general",
  "country_store",
];
export const VISIT_CRAFT_TYPES: readonly string[] = [
  "confectionery",
  "pottery",
  "potter",
  "ceramics",
  "glass",
  "glassblower",
  "brewery",
  "distillery",
  "winery",
  "handicraft",
  "woodcarver",
];
// A chain shop or restaurant is the same in every town, so it is an errand; a chain hotel still gives
// a traveller a bed, and a museum or sight is never a chain.
const CHAIN_IS_ERRAND = new Set<string>([
  "shop",
  "restaurant",
  "cafe",
  "bar",
  "music_shop",
  "gallery",
]);

/** False for errands: shops of other types, and chains of shops and places to eat or drink. */
export function isForVisitors(tags: Record<string, string>, isChain: boolean): boolean {
  const category = categoryForTags(tags);
  if (isChain && CHAIN_IS_ERRAND.has(category)) return false;
  if (category !== "shop") return true;
  const listed = (key: "shop" | "craft", types: readonly string[]) =>
    tags[key]?.split(";").some((part) => types.includes(part.trim())) ?? false;
  return tags.shop ? listed("shop", VISIT_SHOP_TYPES) : listed("craft", VISIT_CRAFT_TYPES);
}

export function categoryForTags(tags: Record<string, string>): OsmCategory {
  for (const row of CATEGORY_ROWS) {
    const value = tags[row.key]?.trim();
    if (
      value &&
      (!row.values || value.split(";").some((part) => row.values!.includes(part.trim())))
    )
      return row.category;
  }
  return "other";
}
