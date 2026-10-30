import { z } from "zod";
import { CONSENT_SCOPES, SCRIPTS, SOURCE_ADAPTER_IDS } from "../domain/constants";

// A region picks from the fixed lists in domain/constants; it cannot add new values without code
// (a new adapter needs an implementation anyway).

const locale = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/, "expected a language tag such as ja or en");
const localised = z.record(locale, z.string().min(1));
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const regionSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "lowercase letters, digits and hyphens"),
    name: localised,
    /** [west, south, east, north] */
    bbox: z.tuple([lng, lat, lng, lat]),
    defaultCenter: z.strictObject({ lat, lng, zoom: z.number().min(0).max(22) }),
    locales: z.array(locale).min(1),
    defaultLocale: locale,
    /** For each UI language, the order in which a place's name scripts are shown. */
    nameFallback: z.record(locale, z.array(z.enum(SCRIPTS)).min(1)),
    geo: z.strictObject({
      mapStyle: z.strictObject({ adapter: z.enum(["openfreemap"]), url: z.url() }),
      search: z.array(z.enum(["nominatim"])).min(1),
      countrycodes: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
      attribution: z.array(z.string().min(1)).min(1),
    }),
    enabledSourceAdapters: z.array(z.enum(SOURCE_ADAPTER_IDS)).min(1),
    cautionVocabulary: z
      .array(
        z.strictObject({
          key: z.string().regex(/^[a-z][a-z0-9_]*$/),
          labels: localised,
          /** Name of the Japanese speaker who reviewed the labels; null shows them as unreviewed. */
          labelsReviewedBy: z.string().min(1).nullable(),
        }),
      )
      .min(1),
    /**
     * The closed set of place categories (bars, restaurants, cafes, shops, music shops, galleries, and the
     * rest). `focus` marks the local-business categories the product is about; nothing is excluded
     * (owner's rule 2026-10-30). Optional so a region can start without one.
     */
    categories: z
      .array(
        z.strictObject({
          key: z.string().regex(/^[a-z][a-z0-9_]*$/),
          labels: localised,
          labelsReviewedBy: z.string().min(1).nullable(),
          focus: z.boolean(),
        }),
      )
      .min(1)
      .optional(),
    consent: z.strictObject({
      textVersion: z.string().min(1),
      text: localised,
      requiredScopes: z.array(z.enum(CONSENT_SCOPES)),
    }),
    minimumAge: z.number().int().min(0).max(30),
    retention: z.strictObject({
      /** null: delete audio once the transcript is corrected and the claims are confirmed. */
      audioDays: z.number().int().positive().nullable(),
    }),
    takedown: z.strictObject({
      /** A role address or form URL, never a personal email. null until one exists. */
      contact: z.string().min(1).nullable(),
      acknowledgeHours: z.number().int().positive(),
      decideDays: z.number().int().positive(),
    }),
    demo: z.strictObject({
      publicDemoEnabled: z.boolean(),
      mockAccountLabels: z.strictObject({
        user: z.string().min(1),
        creator: z.string().min(1),
        business_owner: z.string().min(1),
        steward: z.string().min(1),
      }),
    }),
    legal: z.strictObject({
      /** Named legal operator shown on notices; null until decided (blocks real people's stories). */
      operatorName: z.string().min(1).nullable(),
      launchPackComplete: z.boolean(),
    }),
  })
  .superRefine((region, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const [west, south, east, north] = region.bbox;
    if (west >= east) fail(["bbox"], "west must be less than east");
    if (south >= north) fail(["bbox"], "south must be less than north");
    const { lat: cLat, lng: cLng } = region.defaultCenter;
    if (cLng < west || cLng > east || cLat < south || cLat > north) {
      fail(["defaultCenter"], "the default map centre must lie inside bbox");
    }

    const locales = new Set(region.locales);
    if (locales.size !== region.locales.length) fail(["locales"], "locales must be unique");
    if (!locales.has(region.defaultLocale)) fail(["defaultLocale"], "must be one of locales");

    // Every per-language table must cover exactly the region's locales.
    const requireLocales = (path: (string | number)[], keys: string[]) => {
      for (const l of locales) if (!keys.includes(l)) fail(path, `missing locale "${l}"`);
      for (const k of keys) if (!locales.has(k)) fail(path, `"${k}" is not in locales`);
    };
    requireLocales(["name"], Object.keys(region.name));
    requireLocales(["nameFallback"], Object.keys(region.nameFallback));
    requireLocales(["consent", "text"], Object.keys(region.consent.text));
    region.cautionVocabulary.forEach((c, i) =>
      requireLocales(["cautionVocabulary", i, "labels"], Object.keys(c.labels)),
    );
    for (const [l, scripts] of Object.entries(region.nameFallback)) {
      if (new Set(scripts).size !== scripts.length) {
        fail(["nameFallback", l], "scripts must not repeat");
      }
    }

    // A link card is the fallback for any URL no adapter matches (FR-005).
    if (!region.enabledSourceAdapters.includes("link_card")) {
      fail(["enabledSourceAdapters"], 'must include "link_card"');
    }
    if (new Set(region.enabledSourceAdapters).size !== region.enabledSourceAdapters.length) {
      fail(["enabledSourceAdapters"], "adapters must not repeat");
    }

    region.categories?.forEach((c, i) =>
      requireLocales(["categories", i, "labels"], Object.keys(c.labels)),
    );
    const categoryKeys = (region.categories ?? []).map((c) => c.key);
    if (new Set(categoryKeys).size !== categoryKeys.length) {
      fail(["categories"], "category keys must be unique");
    }

    const keys = region.cautionVocabulary.map((c) => c.key);
    if (new Set(keys).size !== keys.length) {
      fail(["cautionVocabulary"], "caution keys must be unique");
    }

    // Constitution: consent must cover all four scopes before an interview is uploaded.
    for (const scope of CONSENT_SCOPES) {
      if (!region.consent.requiredScopes.includes(scope)) {
        fail(["consent", "requiredScopes"], `must include "${scope}"`);
      }
    }

    // A region cannot declare its launch pack complete without a named operator and a contact.
    if (region.legal.launchPackComplete) {
      if (region.legal.operatorName === null) {
        fail(["legal", "operatorName"], "required once launchPackComplete is true");
      }
      if (region.takedown.contact === null) {
        fail(["takedown", "contact"], "required once launchPackComplete is true");
      }
    }
  });

export type RegionConfig = z.infer<typeof regionSchema>;

export type RegionPolicy = {
  inviteOnly: boolean;
  noindex: boolean;
  allowPilotVisibility: boolean;
  /** Real businesses stay in `draft` until the launch pack is complete. */
  realBusinessesDraftOnly: boolean;
};

/**
 * `launchPackComplete: false` forces invite-only accounts, noindex on every page, no `pilot`
 * visibility and real businesses in `draft` only (constitution, Privacy and Legal Constraints).
 */
export function deriveRegionPolicy(region: RegionConfig): RegionPolicy {
  const open = region.legal.launchPackComplete;
  return {
    inviteOnly: !open,
    noindex: !open,
    allowPilotVisibility: open,
    realBusinessesDraftOnly: !open,
  };
}
