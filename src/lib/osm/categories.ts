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
