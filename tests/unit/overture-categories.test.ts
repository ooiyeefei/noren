import { describe, expect, it } from "vitest";
import {
  categoryForTaxonomy,
  isChainErrand,
  isNotAPlaceName,
} from "../../src/lib/overture/categories";

// Hierarchies are Overture v2 taxonomy paths; names are synthetic.
const category = (...hierarchy: string[]) => categoryForTaxonomy(hierarchy);

describe("Overture category mapping", () => {
  it("files places to eat, drink and sleep under Noren's categories", () => {
    expect(category("food_and_drink", "restaurant", "asian_restaurant", "ramen_restaurant")).toBe(
      "restaurant",
    );
    expect(category("food_and_drink", "casual_eatery", "fast_food_restaurant")).toBe("restaurant");
    expect(category("food_and_drink", "casual_eatery", "cafe")).toBe("cafe");
    expect(category("food_and_drink", "non_alcoholic_beverage_venue", "coffee_shop")).toBe("cafe");
    expect(category("food_and_drink", "non_alcoholic_beverage_venue", "tea_room")).toBe("cafe");
    expect(category("food_and_drink", "alcoholic_beverage_venue", "bar", "sake_bar")).toBe("bar");
    expect(category("food_and_drink", "alcoholic_beverage_venue", "lounge")).toBe("bar");
    expect(category("lodging", "hotel")).toBe("stay");
    expect(category("lodging", "inn")).toBe("stay");
    expect(category("lodging", "bed_and_breakfast")).toBe("stay");
  });

  it("files culture, sights and baths", () => {
    expect(category("arts_and_entertainment", "museum", "history_museum")).toBe("museum");
    expect(category("arts_and_entertainment", "arts_and_crafts_space", "art_gallery")).toBe(
      "gallery",
    );
    expect(category("cultural_and_historic", "historic_site")).toBe("attraction");
    expect(category("cultural_and_historic", "memorial_site", "monument")).toBe("attraction");
    expect(category("arts_and_entertainment", "animal_attraction", "aquarium")).toBe("attraction");
    expect(category("lifestyle_services", "wellness_service", "public_bath_house", "onsen")).toBe(
      "bath",
    );
    expect(category("geographic_entities", "water_feature", "hot_springs")).toBe("bath");
  });

  it("files only the shops the OSM table lists as worth a visit", () => {
    for (const type of [
      ["shopping", "specialty_store", "books_music_and_video_store", "bookstore"],
      ["food_and_drink", "casual_eatery", "bakery"],
      ["food_and_drink", "casual_eatery", "candy_store"],
      ["food_and_drink", "casual_eatery", "dessert_shop", "donut_shop"],
      ["shopping", "food_and_beverage_store", "liquor_store"],
      ["shopping", "food_and_beverage_store", "fishmonger"],
      ["shopping", "second_hand_store", "antique_store"],
      ["shopping", "specialty_store", "arts_crafts_and_hobby_store"],
      ["shopping", "specialty_store", "souvenir_store"],
      ["alcoholic_beverage_venue", "brewery"],
    ])
      expect(category(...type)).toBe("shop");
    expect(
      category(
        "shopping",
        "specialty_store",
        "musical_instrument_and_pro_audio_store",
        "musical_instrument_store",
      ),
    ).toBe("music_shop");
    // Ice cream is a restaurant, as in the OSM table, though it sits under dessert_shop.
    expect(category("food_and_drink", "casual_eatery", "dessert_shop", "ice_cream_shop")).toBe(
      "restaurant",
    );
  });

  it("leaves errands off the map", () => {
    for (const type of [
      ["shopping", "convenience_store"],
      ["shopping", "food_and_beverage_store", "grocery_store"],
      ["shopping", "specialty_store", "pharmacy_and_drug_store", "pharmacy"],
      ["shopping", "vehicle_dealer", "auto_dealer"],
      ["shopping", "fashion_and_apparel_store", "clothing_store"],
      ["shopping", "specialty_store", "electronics_store", "mobile_phone_store"],
      ["shopping", "specialty_store", "flowers_and_gifts_store"],
      ["shopping", "shopping_mall"],
      ["shopping", "discount_store"],
      ["services_and_business", "financial_service", "atm"],
      ["services_and_business", "financial_service", "bank_or_credit_union"],
      ["health_care", "hospital"],
      ["education", "school", "elementary_school"],
      ["lifestyle_services", "personal_or_beauty_service", "hair_salon"],
      ["lifestyle_services", "wellness_service", "spa"],
      ["sports_and_recreation", "park"],
      ["sports_and_recreation", "sport_or_fitness_facility", "gym"],
      ["community_and_government", "government_office"],
      ["travel_and_transportation", "parking"],
      ["arts_and_entertainment", "performing_arts_venue", "music_venue", "karaoke_venue"],
      ["cultural_and_historic", "place_of_worship", "buddhist_place_of_worship"],
    ])
      expect(category(...type), type.join(" > ")).toBeNull();
  });

  it("does not take look-alikes: an internet cafe, a campsite, a cabin, a bare lodging group", () => {
    expect(category("food_and_drink", "casual_eatery", "cafe", "internet_cafe")).toBeNull();
    expect(category("lodging", "campground")).toBeNull();
    expect(category("lodging", "cabin")).toBeNull();
    expect(category("lodging", "private_lodging", "holiday_rental_home")).toBeNull();
    expect(category("lodging")).toBeNull();
    expect(category("food_and_drink")).toBeNull();
    expect(categoryForTaxonomy(null)).toBeNull();
    expect(categoryForTaxonomy([])).toBeNull();
  });

  it("calls a japanese restaurant with izakaya in its name a bar, and no other restaurant", () => {
    const japanese = ["food_and_drink", "restaurant", "japanese_restaurant"];
    expect(categoryForTaxonomy(japanese, "居酒屋 架空")).toBe("bar");
    expect(categoryForTaxonomy(japanese, "架空酒場")).toBe("bar");
    expect(categoryForTaxonomy(japanese, "架空食堂")).toBe("restaurant");
    // A name never moves a place out of another category.
    expect(categoryForTaxonomy(["lodging", "hotel"], "居酒屋ホテル")).toBe("stay");
  });

  it("treats chains of shops and places to eat as errands, but not a hotel or a sight", () => {
    for (const name of ["restaurant", "cafe", "bar", "shop", "music_shop", "gallery"] as const)
      expect(isChainErrand(name)).toBe(true);
    for (const name of ["stay", "museum", "attraction", "bath"] as const)
      expect(isChainErrand(name)).toBe(false);
  });

  it("recognises names that are a stop, a district or an office", () => {
    expect(isNotAPlaceName("架空町 バス停")).toBe(true);
    expect(isNotAPlaceName("架空1丁目")).toBe(true);
    expect(isNotAPlaceName("架空製パン 営業所")).toBe(true);
    expect(isNotAPlaceName("架空水産加工団地協同組合")).toBe(true);
    expect(isNotAPlaceName("丁目カフェ")).toBe(false);
    expect(isNotAPlaceName("架空カフェ")).toBe(false);
  });
});
