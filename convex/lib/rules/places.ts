import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../../_generated/dataModel";
import { isPublicDemoPlace } from "../access";
import { isBlank, mustBeUnique, violation } from "./shared";

/** Rules for the person, place, name, pin, reference and source tables. */
export function registerPlaceRules(triggers: Triggers<DataModel>) {
  triggers.register("place", async (_ctx, change) => {
    const place = change.newDoc;
    if (place === null) return;
    if (
      place.visibility === "public" &&
      (place.isMock !== false || place.demoPublicBasis !== undefined)
    ) {
      throw violation(
        "place_public_real_only",
        "only a real place without a demo basis may be public",
      );
    }
    if (
      place.visibility === "demo_public"
        ? !isPublicDemoPlace(place)
        : place.demoPublicBasis !== undefined
    ) {
      throw violation(
        "place_demo_public_needs_basis",
        "only a demo_public fictional mock place may have a basis",
      );
    }
  });

  mustBeUnique(triggers, "person", "person_token_unique", "token identifier", (ctx, person) =>
    ctx.db
      .query("person")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", person.tokenIdentifier))
      .take(2),
  );

  mustBeUnique(triggers, "place", "place_slug_unique", "region and slug", (ctx, place) =>
    ctx.db
      .query("place")
      .withIndex("by_regionId_and_slug", (q) =>
        q.eq("regionId", place.regionId).eq("slug", place.slug),
      )
      .take(2),
  );

  mustBeUnique(triggers, "placeOwner", "place_owner_unique", "place and person", (ctx, owner) =>
    ctx.db
      .query("placeOwner")
      .withIndex("by_placeId_and_personId", (q) =>
        q.eq("placeId", owner.placeId).eq("personId", owner.personId),
      )
      .take(2),
  );

  // Attaching an owner first needs the place's open-text claims sent back to `proposed`, so the
  // owner decides (data-model.md, state transitions). The other direction is in claims.ts.
  triggers.register("placeOwner", async (ctx, change) => {
    if (change.operation !== "insert") return;
    for (const status of ["owner_confirmed", "published", "disputed"] as const) {
      const claim = await ctx.db
        .query("claim")
        .withIndex("by_placeId_and_origin_and_status", (q) =>
          q.eq("placeId", change.newDoc.placeId).eq("origin", "open_text").eq("status", status),
        )
        .first();
      if (claim) {
        throw violation(
          "place_owner_after_open_text",
          `return the open-text claims of place ${change.newDoc.placeId} to proposed before attaching an owner`,
        );
      }
    }
  });

  mustBeUnique(
    triggers,
    "placeName",
    "place_name_unique",
    "place, language, script and value",
    (ctx, name) =>
      ctx.db
        .query("placeName")
        .withIndex("by_placeId_and_lang_and_script_and_value", (q) =>
          q
            .eq("placeId", name.placeId)
            .eq("lang", name.lang)
            .eq("script", name.script)
            .eq("value", name.value),
        )
        .take(2),
  );

  triggers.register("placeName", async (ctx, change) => {
    const name = change.newDoc;
    if (name === null) return;
    if (isBlank(name.value)) {
      throw violation("place_name_value_not_blank", "a place name cannot be blank");
    }
    if (!name.isPrimary) return;
    // A place has a handful of names per language, so one page of them is the whole set.
    const sameLanguage = await ctx.db
      .query("placeName")
      .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", name.placeId).eq("lang", name.lang))
      .take(100);
    if (sameLanguage.some((other) => other.isPrimary && other._id !== change.id)) {
      throw violation(
        "place_name_one_primary_per_lang",
        `place ${name.placeId} already has a primary name in ${name.lang}`,
      );
    }
  });

  mustBeUnique(triggers, "pin", "pin_one_per_place", "place", (ctx, pin) =>
    ctx.db
      .query("pin")
      .withIndex("by_placeId", (q) => q.eq("placeId", pin.placeId))
      .take(2),
  );

  triggers.register("pin", async (_ctx, change) => {
    const pin = change.newDoc;
    if (pin === null) return;
    if (!Number.isFinite(pin.lat) || pin.lat < -90 || pin.lat > 90) {
      throw violation("pin_lat_range", `latitude ${pin.lat} is outside -90 to 90`);
    }
    if (!Number.isFinite(pin.lng) || pin.lng < -180 || pin.lng > 180) {
      throw violation("pin_lng_range", `longitude ${pin.lng} is outside -180 to 180`);
    }
  });

  mustBeUnique(
    triggers,
    "placeExternalRef",
    "place_external_ref_unique",
    "place, provider and reference",
    (ctx, ref) =>
      ctx.db
        .query("placeExternalRef")
        .withIndex("by_placeId_and_provider_and_ref", (q) =>
          q.eq("placeId", ref.placeId).eq("provider", ref.provider).eq("ref", ref.ref),
        )
        .take(2),
  );

  mustBeUnique(
    triggers,
    "seedOsmCandidate",
    "seed_osm_candidate_unique",
    "OSM type and id",
    (ctx, candidate) =>
      ctx.db
        .query("seedOsmCandidate")
        .withIndex("by_osmType_and_osmId", (q) =>
          q.eq("osmType", candidate.osmType).eq("osmId", candidate.osmId),
        )
        .take(2),
  );

  mustBeUnique(triggers, "source", "source_place_url_unique", "place and URL", (ctx, source) =>
    ctx.db
      .query("source")
      .withIndex("by_placeId_and_canonicalUrl", (q) =>
        q.eq("placeId", source.placeId).eq("canonicalUrl", source.canonicalUrl),
      )
      .take(2),
  );

  // FR-029: the steward's note that the author agreed is a time and a name, never one without
  // the other.
  triggers.register("source", async (_ctx, change) => {
    const source = change.newDoc;
    if (source === null) return;
    if ((source.demoConsentAt === undefined) !== (source.demoConsentBy === undefined)) {
      throw violation(
        "source_demo_consent_paired",
        "demoConsentAt and demoConsentBy are set together or not at all",
      );
    }
  });
}
