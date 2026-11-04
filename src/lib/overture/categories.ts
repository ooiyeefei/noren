import { CHAIN_IS_ERRAND, type OsmCategory } from "../osm/categories";

/**
 * Noren's category for an Overture place, from its taxonomy.
 *
 * Overture v2 gives each place a `taxonomy.hierarchy`, the path from a broad group to its own type
 * (for example food_and_drink > casual_eatery > cafe). A row matches when any step of the path is one
 * of its terms, and the first matching row wins, as in the OSM table in ../osm/categories. The rows
 * follow the same decisions as the OSM ones: the owner's list is food, cafes, bars, shops, crafts,
 * galleries, museums, sights, places to stay and public baths, never errands (2026-10-31).
 *
 * A place whose hierarchy no row matches is not for the map: pharmacies, convenience stores, banks,
 * clinics, schools, salons, offices, car dealers, parking, parks and so on. That is the errand rule.
 */
export type OvertureCategory = Exclude<OsmCategory, "other">;

type Row = { category: OvertureCategory | null; terms: readonly string[] };

export const OVERTURE_CATEGORY_ROWS: readonly Row[] = [
  // Looks like a cafe or a place to stay but is neither: an internet cafe is a manga kissa, and a
  // campsite or a cabin is not a local business (the OSM table makes the same call).
  {
    category: null,
    terms: ["internet_cafe", "campground", "cabin", "private_lodging"],
  },
  // Overture files a pub, a sake bar and a cocktail bar under "bar"; a lounge and a club also pour
  // drinks. A music venue and a karaoke room are not on the owner's list.
  {
    category: "bar",
    terms: ["bar", "lounge", "beer_garden", "dance_club", "tapas_bar", "gastropub"],
  },
  {
    category: "cafe",
    terms: ["cafe", "coffee_shop", "tea_room", "bubble_tea_shop", "milk_bar", "smoothie_juice_bar"],
  },
  // Ice cream is a restaurant in the OSM table; the rest of the sweet shops are shops to take home from.
  {
    category: "restaurant",
    terms: ["ice_cream_shop", "gelato_shop", "frozen_yogurt_shop", "shaved_ice_shop"],
  },
  // Not the bare "lodging" group: those 41 records are mostly area names ("長崎市内"), a house builder
  // and a liquor store that Overture could not classify further.
  {
    category: "stay",
    terms: ["hotel", "inn", "hostel", "bed_and_breakfast", "resort", "lodge"],
  },
  { category: "bath", terms: ["public_bath_house", "onsen", "hot_springs"] },
  {
    category: "music_shop",
    terms: ["musical_instrument_store", "music_and_dvd_store"],
  },
  { category: "gallery", terms: ["art_gallery"] },
  { category: "museum", terms: ["museum"] },
  // Sights. Shrines, temples and churches are left out, as they are in the OSM table unless a
  // mapper also tagged them historic: most are small neighbourhood buildings, and the ones people
  // travel for are historic sites or monuments. Parks, beaches, mountains and bridges are left out
  // too (the OSM table lists only viewpoints and attractions).
  {
    category: "attraction",
    terms: [
      "historic_site",
      "castle",
      "lighthouse",
      "monument",
      "aquarium",
      "zoo",
      "amusement_park",
      "observatory",
      "planetarium",
      "botanical_garden",
      "sculpture_statue",
    ],
  },
  // Shops, only the types the OSM table lists as worth a visit (VISIT_SHOP_TYPES, VISIT_CRAFT_TYPES).
  {
    category: "shop",
    terms: [
      // Food and drink to take home.
      "bakery",
      "candy_store",
      "chocolatier",
      "dessert_shop",
      "delicatessen",
      "cheese_shop",
      "fishmonger",
      "seafood_market",
      "liquor_store",
      "beer_wine_spirits_store",
      "brewery",
      // Something to look at, or a person behind the counter.
      "bookstore",
      "comic_books_store",
      "gift_shop",
      "souvenir_store",
      "second_hand_store",
      "antique_store",
      "arts_crafts_and_hobby_store",
      "hobby_shop",
      "fabric_store",
      "toy_store",
      "video_game_store",
      "glass_blowing_venue",
    ],
  },
  // Places to eat that no earlier row took. "restaurant" covers every cuisine below it, and
  // "casual_eatery" the diners and fast-food counters that are left.
  { category: "restaurant", terms: ["restaurant", "casual_eatery", "food_truck_stand"] },
];

// Overture files izakaya under japanese_restaurant; OSM has a cuisine tag for them. A name that says
// so is the only signal, and it is a strong one.
const IZAKAYA_NAME = /居酒屋|酒場|立ち飲み|立呑/u;

// Overture files some bus stops, districts, offices and trade associations under a visitor category.
const NOT_A_PLACE_NAME = /バス停|停留所|丁目$|事務所|営業所|協同組合/u;

/** True for a name that is a stop, a district or an office, which no visitor category should hold. */
export function isNotAPlaceName(name: string): boolean {
  return NOT_A_PLACE_NAME.test(name);
}

/** The Noren category for a taxonomy, or null when the place is not for the map. */
export function categoryForTaxonomy(
  hierarchy: readonly string[] | null | undefined,
  name?: string,
): OvertureCategory | null {
  const path = hierarchy ?? [];
  for (const row of OVERTURE_CATEGORY_ROWS) {
    if (!row.terms.some((term) => path.includes(term))) continue;
    return row.category === "restaurant" && name && IZAKAYA_NAME.test(name) ? "bar" : row.category;
  }
  return null;
}

/** Chains of shops and places to eat or drink are errands; a chain hotel still gives a bed. */
export function isChainErrand(category: OvertureCategory): boolean {
  return CHAIN_IS_ERRAND.has(category);
}
