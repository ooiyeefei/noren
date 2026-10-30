export type OsmCategory =
  "restaurant" | "cafe" | "bar" | "shop" | "music_shop" | "gallery" | "attraction" | "other";

// First matching OSM tag row wins. Cuisine precedes amenity so an izakaya restaurant is a bar.
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
  { key: "shop", values: ["musical_instrument", "music", "records"], category: "music_shop" },
  { key: "shop", values: ["art"], category: "gallery" },
  { key: "tourism", values: ["gallery"], category: "gallery" },
  { key: "shop", category: "shop" },
  { key: "craft", category: "shop" },
  {
    key: "tourism",
    values: ["attraction", "museum", "viewpoint", "artwork"],
    category: "attraction",
  },
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
