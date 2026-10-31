import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  checkOutcomeValidator,
  checkProblemValidator,
  checkVerdictValidator,
  externalProviderValidator,
  licenceValidator,
  placeKindValidator,
  roleValidator,
  scriptValidator,
  sourceStatusValidator,
  visibilityValidator,
} from "../lib/validators";

// Convex adds `_id` and `_creationTime` (the data model's `created_at`) to every row. Rules that a
// validator cannot express live in convex/lib/rules and run as triggers (research D3, D19).

export const placeTables = {
  /** Created on first sign-in. The role lives only here; only a steward changes it (research D2). */
  person: defineTable({
    /** The canonical identity key from the verified Clerk token. */
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    role: roleValidator,
    displayName: v.string(),
    publicProfileUrl: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.id("person")),
    isMock: v.boolean(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_role", ["role"]),

  /** A real place or a labelled mock place. A real place is `draft` until a steward confirms it, then `public`: anyone can read it and no owner approval is needed (research D20). */
  place: defineTable({
    regionId: v.string(),
    slug: v.string(),
    /**
     * Unset means "business". `landmark` is a legacy label that grants nothing: it never makes a place
     * public. Museums and sights are shown under their own map categories instead (owner, 2026-10-31).
     */
    kind: v.optional(placeKindValidator),
    visibility: visibilityValidator,
    /**
     * Why a `demo_public` place is public. Only a clearly labelled fictional mock place may be, set by a
     * steward's audited `setVisibility` and cleared when the place leaves `demo_public` (FR-029). A real
     * place becomes public through the `public` visibility, never through this field. A `demo_public`
     * place without the basis is not publicly readable, so a row written around the gate exposes nothing.
     */
    demoPublicBasis: v.optional(v.literal("fictional")),
    /** A key from the region's category vocabulary (checked on write); unset until a person chooses one. */
    category: v.optional(v.string()),
    createdBy: v.id("person"),
    isMock: v.boolean(),
    /**
     * Copies of the place's names, pin and whether it has a published page, kept in step by the
     * triggers in lib/rules/mapCopies.ts so the map reads one row per place instead of three lookups
     * (a query may make 4,096). The name, pin and pageVersion tables stay the truth; unset means "not
     * copied yet", and readers then look the values up.
     */
    mapNames: v.optional(
      v.array(
        v.object({
          lang: v.string(),
          script: scriptValidator,
          value: v.string(),
          isPrimary: v.boolean(),
        }),
      ),
    ),
    mapPin: v.optional(v.union(v.object({ lat: v.number(), lng: v.number() }), v.null())),
    hasPublishedPage: v.optional(v.boolean()),
    /**
     * When a person last confirmed the place in person: they placed its pin, or said "Still here"
     * (FR-030). Unset means "Not yet confirmed", as for a listing from open data no one has checked.
     * An import never sets or clears it.
     */
    confirmedAt: v.optional(v.number()),
    confirmedBy: v.optional(v.id("person")),
  })
    .index("by_regionId_and_slug", ["regionId", "slug"])
    .index("by_regionId_and_visibility", ["regionId", "visibility"])
    .index("by_createdBy", ["createdBy"]),

  /**
   * One person saying a place is still there, or reporting what is wrong with it (FR-030). A report
   * changes nothing in public until a steward records an outcome: the place stays, or it is hidden.
   * Never counted into a score (principle I).
   */
  placeCheck: defineTable({
    placeId: v.id("place"),
    regionId: v.string(),
    personId: v.id("person"),
    verdict: checkVerdictValidator,
    problem: v.optional(checkProblemValidator),
    note: v.optional(v.string()),
    reviewedBy: v.optional(v.id("person")),
    reviewedAt: v.optional(v.number()),
    outcome: v.optional(checkOutcomeValidator),
    isMock: v.boolean(),
  })
    .index("by_placeId_and_personId", ["placeId", "personId"])
    .index("by_regionId_and_verdict_and_reviewedAt", ["regionId", "verdict", "reviewedAt"]),

  /** Links a business owner to a place they may confirm claims for. */
  placeOwner: defineTable({
    placeId: v.id("place"),
    personId: v.id("person"),
    verifiedBy: v.id("person"),
    verifiedAt: v.number(),
  })
    .index("by_placeId_and_personId", ["placeId", "personId"])
    .index("by_personId", ["personId"]),

  /** At least one confirmed name is needed before a place can leave `draft` (checked by the caller). */
  placeName: defineTable({
    placeId: v.id("place"),
    lang: v.string(),
    script: scriptValidator,
    value: v.string(),
    confirmedBy: v.optional(v.id("person")),
    isPrimary: v.boolean(),
  })
    .index("by_placeId_and_lang", ["placeId", "lang"])
    .index("by_placeId_and_lang_and_script_and_value", ["placeId", "lang", "script", "value"]),

  /** The authoritative location of a place: where a person put the pin (FR-001, principle III). */
  pin: defineTable({
    placeId: v.id("place"),
    lat: v.number(),
    lng: v.number(),
    placedBy: v.id("person"),
    placedAt: v.number(),
  })
    .index("by_placeId", ["placeId"])
    .index("by_lat", ["lat"]),

  /** Pointers to outside identifiers; never truth (FR-003). OSM data stays in seedOsmCandidate. */
  placeExternalRef: defineTable({
    placeId: v.id("place"),
    provider: externalProviderValidator,
    ref: v.string(),
    licence: v.optional(licenceValidator),
    attribution: v.optional(v.string()),
    retrievedAt: v.number(),
  })
    .index("by_placeId_and_provider_and_ref", ["placeId", "provider", "ref"])
    .index("by_provider_and_ref", ["provider", "ref"]),

  /** OpenStreetMap-derived candidates (ODbL), kept apart from every other table. */
  seedOsmCandidate: defineTable({
    regionId: v.string(),
    osmType: v.union(v.literal("node"), v.literal("way"), v.literal("relation")),
    osmId: v.number(),
    tags: v.record(v.string(), v.string()),
    lat: v.number(),
    lng: v.number(),
    licence: v.literal("ODbL-1.0"),
    /** Unset until a person confirms the candidate and a place exists. */
    confirmedPlaceId: v.optional(v.id("place")),
    /** When the importer fetched this row; ODbL provenance with the OSM version and timestamp. */
    retrievedAt: v.optional(v.number()),
    osmVersion: v.optional(v.number()),
    osmTimestamp: v.optional(v.string()),
    /** A region category key the importer derived from the tags; a steward may change it when confirming. */
    category: v.optional(v.string()),
    /** Set when a steward decides the candidate is not a place for Noren (duplicate, closed, not a business). */
    dismissedAt: v.optional(v.number()),
    /** True when OpenStreetMap marks the place as part of a brand or chain (a `brand` tag); the list hides chains by default because Noren's focus is local businesses. */
    isChain: v.optional(v.boolean()),
  })
    .index("by_osmType_and_osmId", ["osmType", "osmId"])
    .index("by_regionId_and_confirmedPlaceId", ["regionId", "confirmedPlaceId"])
    .index("by_regionId_and_category", ["regionId", "category"])
    .index("by_regionId", ["regionId"]),

  /** Openly licensed text (Wikipedia, tourism database). CC BY-SA text stays here, apart from ODbL. */
  openTextSnippet: defineTable({
    /** Unset until a steward links the snippet to a confirmed place. */
    placeId: v.optional(v.id("place")),
    lang: v.string(),
    text: v.string(),
    licence: licenceValidator,
    sourceUrl: v.string(),
    attribution: v.string(),
    revisionRef: v.optional(v.string()),
    retrievedAt: v.number(),
    approvedBy: v.optional(v.id("person")),
  })
    .index("by_placeId", ["placeId"])
    .index("by_sourceUrl_and_lang", ["sourceUrl", "lang"]),

  /**
   * A reference to a public post or page. Stores no captions, images or post content (FR-006).
   * `demoConsent*` record a steward noting that the post's author agreed to appear in the public
   * demo; a source without them is never shown to the public (FR-029).
   */
  source: defineTable({
    placeId: v.id("place"),
    platform: v.string(),
    adapter: v.string(),
    url: v.string(),
    canonicalUrl: v.string(),
    /** The title a creator typed for a link card (FR-005); never fetched from the page. */
    title: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    authorUrl: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    creatorNote: v.optional(v.string()),
    noteLang: v.optional(v.string()),
    addedBy: v.id("person"),
    status: sourceStatusValidator,
    lastCheckedAt: v.optional(v.number()),
    demoConsentAt: v.optional(v.number()),
    demoConsentBy: v.optional(v.id("person")),
    isMock: v.boolean(),
  })
    .index("by_placeId_and_status", ["placeId", "status"])
    .index("by_placeId_and_canonicalUrl", ["placeId", "canonicalUrl"])
    .index("by_status_and_lastCheckedAt", ["status", "lastCheckedAt"]),
};
