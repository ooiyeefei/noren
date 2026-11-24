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
const dailyLimit = z.number().int().positive();

const areaId = z.string().regex(/^[a-z][a-z0-9-]*$/, "lowercase letters, digits and hyphens");
const key = z.string().regex(/^[a-z][a-z0-9_]*$/);
const pin = z.strictObject({ lat, lng });
const sourceText = z.string().trim().min(1);
const areaGeo = z.strictObject({
  countrycodes: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
  attribution: z.array(sourceText).min(1),
});
const areaCollection = z.strictObject({
  /** A visit keeps only its date, in this offset from UTC. */
  utcOffsetHours: z.number().min(-12).max(14),
});
const roads = z.strictObject({
  points: z
    .array(
      z.strictObject({
        id: areaId,
        /** What the point is called on screen. A town's point may leave it to the town's own names. */
        names: localised.optional(),
        pin,
        offRoadMinutes: z.number().nonnegative(),
      }),
    )
    .min(1),
  /**
   * Road points where a trip may start or end although no town is seeded there (a city the roads
   * meet at). Each must name a point in `points`.
   */
  endpoints: z.array(areaId).optional(),
  segments: z.array(
    z.strictObject({
      from: areaId,
      to: areaId,
      minutes: z.number().positive(),
      kilometres: z.number().positive(),
      road: sourceText,
    }),
  ),
  source: z.strictObject({ text: sourceText, builtOn: z.iso.date(), licence: sourceText }),
});

const ruleList = z.array(areaId).optional();
const fact = z.strictObject({
  key,
  labels: localised,
  meets: ruleList,
  fails: ruleList,
  noMeets: ruleList,
  noFails: ruleList,
  serves: z.array(z.enum(["prayer", "work", "rest"])).optional(),
  labelsReviewedBy: z.string().min(1).nullable(),
});

const sourced = { source: sourceText, verified: z.boolean() };
const stateList = z.array(areaId).min(1);
const dateRange = z
  .strictObject({ from: z.iso.date(), to: z.iso.date(), ...sourced })
  .refine(({ from, to }) => from <= to, { path: ["to"], message: "must be on or after from" });
const calendar = z.strictObject({
  publicHolidays: z.array(
    z.strictObject({
      date: z.iso.date(),
      name: localised,
      states: z.union([z.literal("all"), stateList]),
      ...sourced,
    }),
  ),
  schoolHolidays: z.array(dateRange.safeExtend({ states: stateList })),
  fasting: z.array(dateRange),
  busyDays: z.array(z.strictObject({ date: z.iso.date(), why: localised, ...sourced })),
  weeklyRest: z.array(
    z.strictObject({
      states: stateList,
      days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1),
      ...sourced,
    }),
  ),
});

const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, "expected HH:MM");
const minutes = z
  .number()
  .int()
  .positive()
  .max(24 * 60);
const turns = z.number().int().positive().max(24);
const trip = z
  .strictObject({
    dayStart: time,
    dayEnd: time,
    minutesAtStop: z.record(key, minutes),
    townSpeedKmh: z.number().min(10).max(80),
    detourFactor: z.number().min(1).max(10),
    walkLimitMetres: z.number().int().positive().max(20_000),
    roadPointReachMetres: z.number().int().positive().max(100_000),
    turnsPerDay: z.strictObject({ light: turns, steady: turns, full: turns }),
    foodCategories: z.array(key),
    indoorCategories: z.array(key),
    guesses: z.strictObject({
      stretchMinutes: minutes,
      dayDriveMinutes: minutes,
      fullness: z.enum(["light", "steady", "full"]),
      lunch: time,
      dinner: time,
    }),
  })
  .refine(({ dayStart, dayEnd }) => dayStart < dayEnd, {
    path: ["dayEnd"],
    message: "must be after dayStart",
  });

const areaShape = {
  id: areaId,
  name: localised,
  /** [west, south, east, north] */
  bbox: z.tuple([lng, lat, lng, lat]),
  defaultCenter: z.strictObject({ lat, lng, zoom: z.number().min(0).max(22) }),
  /** For each UI language, the order in which a place's name scripts are shown. */
  nameFallback: z.record(locale, z.array(z.enum(SCRIPTS)).min(1)),
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
  /**
   * The areas a neighbourhood mission covers. A place belongs to the nearest centre whose circle
   * holds its pin, and to none when no circle does. Progress is the area's, never a person's.
   */
  neighbourhoods: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9-]*$/, "lowercase letters, digits and hyphens"),
        names: localised,
        center: z.strictObject({ lat, lng }),
        radiusMetres: z.number().positive(),
      }),
    )
    .min(1)
    .optional(),
  /**
   * The towns a shared story's hashtags name (#島原 #Shimabara). A place is in the nearest town whose
   * circle holds its pin, and in none when no circle does; then the region's own name stands in.
   */
  towns: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9-]*$/, "lowercase letters, digits and hyphens"),
        names: localised,
        center: z.strictObject({ lat, lng }),
        radiusMetres: z.number().positive(),
        state: areaId.optional(),
        onRoad: areaId.optional(),
      }),
    )
    .min(1)
    .optional(),
  enabled: z.boolean().optional(),
  nameLanguages: z.array(locale).min(1).optional(),
  roads: roads.optional(),
  factVocabulary: z.array(fact).optional(),
  factMaxAgeDays: dailyLimit.optional(),
  calendar: calendar.optional(),
  trip: trip.optional(),
};

const areaObject = z.strictObject({
  ...areaShape,
  geo: areaGeo,
  collection: areaCollection,
});
type Area = z.output<typeof areaObject>;
type Issue = (path: (string | number)[], message: string) => void;

function checkRoads(region: Area, fail: Issue) {
  const links = new Map(region.roads?.points.map(({ id }) => [id, new Set<string>()]));
  region.towns?.forEach(({ onRoad }, i) => {
    if (onRoad !== undefined && !links.has(onRoad)) {
      fail(["towns", i, "onRoad"], "must name a road point");
    }
  });
  if (!region.roads) return;
  if (links.size !== region.roads.points.length)
    fail(["roads", "points"], "point ids must be unique");

  region.roads.endpoints?.forEach((id, i) => {
    if (!links.has(id)) fail(["roads", "endpoints", i], "must name a road point");
  });
  region.roads.segments.forEach(({ from, to }, i) => {
    if (!links.has(from)) fail(["roads", "segments", i, "from"], "must name a road point");
    if (!links.has(to)) fail(["roads", "segments", i, "to"], "must name a road point");
    links.get(from)?.add(to);
    links.get(to)?.add(from);
  });

  const reached = new Set(region.roads.points.slice(0, 1).map(({ id }) => id));
  for (const id of reached) {
    for (const neighbour of links.get(id) ?? []) {
      if (links.has(neighbour)) reached.add(neighbour);
    }
  }
  if (reached.size !== links.size) fail(["roads", "points"], "every road point must be connected");
}

function checkArea(region: Area, locales: ReadonlySet<string>, fail: Issue) {
  const [west, south, east, north] = region.bbox;
  if (west >= east) fail(["bbox"], "west must be less than east");
  if (south >= north) fail(["bbox"], "south must be less than north");
  const { lat: cLat, lng: cLng } = region.defaultCenter;
  if (cLng < west || cLng > east || cLat < south || cLat > north) {
    fail(["defaultCenter"], "the default map centre must lie inside bbox");
  }

  if (locales.size === 0) fail(["nameFallback"], "must list at least one locale");

  // Every per-language table must cover exactly the region's locales.
  const requireLocales = (path: (string | number)[], keys: string[]) => {
    for (const l of locales) if (!keys.includes(l)) fail(path, `missing locale "${l}"`);
    for (const k of keys) if (!locales.has(k)) fail(path, `"${k}" is not in locales`);
  };
  requireLocales(["name"], Object.keys(region.name));
  requireLocales(["nameFallback"], Object.keys(region.nameFallback));
  region.cautionVocabulary.forEach((c, i) =>
    requireLocales(["cautionVocabulary", i, "labels"], Object.keys(c.labels)),
  );
  for (const [l, scripts] of Object.entries(region.nameFallback)) {
    if (new Set(scripts).size !== scripts.length) {
      fail(["nameFallback", l], "scripts must not repeat");
    }
  }

  region.categories?.forEach((c, i) =>
    requireLocales(["categories", i, "labels"], Object.keys(c.labels)),
  );
  const categoryKeys = (region.categories ?? []).map((c) => c.key);
  if (new Set(categoryKeys).size !== categoryKeys.length) {
    fail(["categories"], "category keys must be unique");
  }

  region.neighbourhoods?.forEach((n, i) => {
    requireLocales(["neighbourhoods", i, "names"], Object.keys(n.names));
    if (
      n.center.lng < west ||
      n.center.lng > east ||
      n.center.lat < south ||
      n.center.lat > north
    ) {
      fail(["neighbourhoods", i, "center"], "a neighbourhood's centre must lie inside bbox");
    }
  });
  const neighbourhoodIds = (region.neighbourhoods ?? []).map((n) => n.id);
  if (new Set(neighbourhoodIds).size !== neighbourhoodIds.length) {
    fail(["neighbourhoods"], "neighbourhood ids must be unique");
  }

  const keys = region.cautionVocabulary.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    fail(["cautionVocabulary"], "caution keys must be unique");
  }

  region.towns?.forEach((town, i) =>
    requireLocales(["towns", i, "names"], Object.keys(town.names)),
  );
  const factKeys = new Set<string>();
  region.factVocabulary?.forEach((item, i) => {
    if (factKeys.has(item.key)) fail(["factVocabulary", i, "key"], "fact keys must be unique");
    factKeys.add(item.key);
    requireLocales(["factVocabulary", i, "labels"], Object.keys(item.labels));
    if (
      ![item.meets, item.fails, item.noMeets, item.noFails, item.serves].some(
        (list) => list?.length,
      )
    ) {
      fail(["factVocabulary", i], "must have at least one effect");
    }
  });
  region.calendar?.publicHolidays.forEach(({ name }, i) =>
    requireLocales(["calendar", "publicHolidays", i, "name"], Object.keys(name)),
  );
  region.calendar?.busyDays.forEach(({ why }, i) =>
    requireLocales(["calendar", "busyDays", i, "why"], Object.keys(why)),
  );

  if (region.trip) {
    for (const field of ["foodCategories", "indoorCategories"] as const) {
      region.trip[field].forEach((category, i) => {
        if (!categoryKeys.includes(category))
          fail(["trip", field, i], "must name a region category");
      });
    }
  }
  if (region.enabled) {
    for (const field of ["towns", "nameLanguages", "categories"] as const) {
      if (!region[field]) fail([field], "required when the region is enabled");
    }
  }
  checkRoads(region, fail);
}

// An area file declares its label coverage through nameFallback. The registry also validates
// the merged config against the home region's locales.
export const areaRegionSchema = areaObject.superRefine((region, ctx) => {
  checkArea(region, new Set(Object.keys(region.nameFallback)), (path, message) =>
    ctx.addIssue({ code: "custom", path, message }),
  );
});

export const regionSchema = z
  .strictObject({
    ...areaShape,
    locales: z.array(locale).min(1),
    defaultLocale: locale,
    geo: z.strictObject({
      mapStyle: z.strictObject({ adapter: z.enum(["openfreemap"]), url: z.url() }),
      search: z.array(z.enum(["nominatim"])).min(1),
      ...areaGeo.shape,
      /**
       * Aerial photos a pin map can switch to, for telling buildings apart. `credit` links to
       * `creditUrl` while the photos show.
       */
      aerialPhoto: z
        .strictObject({
          tiles: z.string().regex(/^https:\/\/[a-z0-9.-]+\/\S*\{z\}\/\{x\}\/\{y\}\S*$/),
          minZoom: z.number().int().min(0).max(22),
          maxZoom: z.number().int().min(0).max(22),
          credit: z.string().min(1),
          creditUrl: z.url(),
        })
        .optional(),
    }),
    enabledSourceAdapters: z.array(z.enum(SOURCE_ADAPTER_IDS)).min(1),
    consent: z.strictObject({
      textVersion: z.string().min(1),
      text: localised,
      requiredScopes: z.array(z.enum(CONSENT_SCOPES)),
      /**
       * The consent text versions that name Modal. The translation check sends a person's words to
       * Modal, so it runs only on interviews whose recorded consent has one of these versions.
       */
      versionsNamingModal: z.array(z.string().min(1)),
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
    /**
     * The neighbourhood noren collection. The established-account limits live in
     * convex/lib/rateLimit.ts; `newAccount` is what an account gets in its first days.
     */
    collection: z.strictObject({
      panelsPerSet: z.number().int().min(2).max(12),
      /** How near a place's pin a check-in passes, and how much of the phone's error may count. */
      checkInMetres: z.number().positive(),
      accuracyAllowanceMetres: z.number().min(0),
      ...areaCollection.shape,
      newAccount: z.strictObject({
        days: z.number().int().positive(),
        perDay: z.strictObject({
          story: dailyLimit,
          place: dailyLimit,
          post: dailyLimit,
          preview: dailyLimit,
          draft: dailyLimit,
          check: dailyLimit,
          report: dailyLimit,
          photo: dailyLimit,
          voice: dailyLimit.default(5),
        }),
      }),
    }),
    /** Photos on a written story (specs/003-story-photos). Off means no control and no route. */
    photos: z.strictObject({
      enabled: z.boolean(),
      maxPerStory: z.number().int().positive(),
      /** The longest side of a stored photo, and of what the browser sends. */
      maxEdgePixels: z.number().int().positive(),
      /** A picture with more pixels than this is refused before it is decoded in full. */
      maxInputPixels: z.number().int().positive(),
      maxUploadBytes: z.number().int().positive(),
      jpegQuality: z.number().int().min(1).max(100),
      /** An established member's daily limit; a new member's is in collection.newAccount.perDay. */
      perDay: dailyLimit,
      /** How long a photo may wait for its story before the cron removes it. */
      unattachedHours: z.number().positive(),
      /** How long the upload permit lasts. */
      permitSeconds: z.number().int().positive(),
      /** How long a browser or the CDN may keep a served photo, so a removal takes effect by then. */
      cacheSeconds: z.number().int().positive(),
      /** A key from cautionVocabulary: the owner has said no photos. */
      refusingCaution: z.string().min(1),
    }),
    /** Sharing a story beyond Noren (a picture of it, and Noren's own accounts). */
    sharing: z.strictObject({
      /** Off hides the written-story tick that lets Noren feature a story on its own accounts. */
      norenAccount: z.boolean(),
      /**
       * On lets a steward's approval post a story by itself to Noren's Instagram, through Instagram's
       * own interface, once its credentials are set. Off (the default) keeps the share kit by hand.
       */
      autoPost: z.boolean().default(false),
      /**
       * Optional pacing of automatic posts: at most `perDay` each Japan-time day, none before
       * `hourJst` o'clock. Absent means an approved post goes out at once.
       */
      autoPostSchedule: z
        .strictObject({
          perDay: z.number().int().min(1).max(25),
          hourJst: z.number().int().min(0).max(23),
        })
        .optional(),
    }),
    voice: z
      .strictObject({
        enabled: z.boolean(),
        maxSeconds: z.number().int().positive().max(120),
      })
      .default({ enabled: false, maxSeconds: 120 }),
    /**
     * Switches for parts of the product that ship dark, each off until the privacy notice names it.
     * `connector`: the read-only Noren connector at /api/mcp (people add it to Claude or ChatGPT by
     * its address); off, the route answers 404. `planner`: the in-app "plan my day" chat and the
     * "What Noren remembers" page. `walk`: walk mode, with the omikuji and first-story quests.
     * `thread`: "three doors", a question carried to another place and a slip that leads on to two
     * more doors. It works only while `walk` is on too (src/lib/slip/carry.ts, threadOn).
     * `postcard`: a member picks moments from places they went to and sends a private link to a
     * card for someone they love (specs/004-trip-postcard). Off, its pages answer 404 and its
     * functions answer not found.
     */
    features: z
      .strictObject({
        connector: z.boolean(),
        planner: z.boolean().default(false),
        walk: z.boolean().default(false),
        thread: z.boolean().default(false),
        postcard: z.boolean().default(false),
        trip: z.enum(["off", "trial", "open"]).default("off"),
        facts: z.boolean().default(false),
      })
      .default({
        connector: false,
        planner: false,
        walk: false,
        thread: false,
        postcard: false,
        trip: "off",
        facts: false,
      }),
    legal: z.strictObject({
      /** Named legal operator shown on notices; null until decided (blocks real people's stories). */
      operatorName: z.string().min(1).nullable(),
      launchPackComplete: z.boolean(),
      /** Anyone old enough may make an account. It changes no other launch rule. */
      accountsOpen: z.boolean(),
      /**
       * Search engines and AI crawlers may read the public pages. The owner turned it on once the
       * launch pack's documents existed; it changes no other launch rule (real businesses keep the
       * draft rule until `launchPackComplete`).
       */
      searchOpen: z.boolean().default(false),
      /** The date of the published terms and privacy notice; null while neither page exists. */
      documentsVersion: z.string().min(1).nullable(),
    }),
  })
  .superRefine((region, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const locales = new Set(region.locales);
    checkArea(region, locales, fail);

    if (locales.size !== region.locales.length) fail(["locales"], "locales must be unique");
    if (!locales.has(region.defaultLocale)) fail(["defaultLocale"], "must be one of locales");
    for (const lang of locales) {
      if (!Object.hasOwn(region.consent.text, lang))
        fail(["consent", "text"], `missing locale "${lang}"`);
    }
    for (const lang of Object.keys(region.consent.text)) {
      if (!locales.has(lang)) fail(["consent", "text"], `"${lang}" is not in locales`);
    }

    // A link card is the fallback for any URL no adapter matches (FR-005).
    if (!region.enabledSourceAdapters.includes("link_card")) {
      fail(["enabledSourceAdapters"], 'must include "link_card"');
    }
    if (new Set(region.enabledSourceAdapters).size !== region.enabledSourceAdapters.length) {
      fail(["enabledSourceAdapters"], "adapters must not repeat");
    }

    const keys = region.cautionVocabulary.map((c) => c.key);
    if (!keys.includes(region.photos.refusingCaution)) {
      fail(["photos", "refusingCaution"], "must be a key from cautionVocabulary");
    }
    if (region.photos.maxInputPixels < region.photos.maxEdgePixels ** 2) {
      fail(["photos", "maxInputPixels"], "must allow a square picture at maxEdgePixels");
    }

    // A processor reaches people's words only when the text they agreed to names it. Older texts
    // are gone, but the current one is here: if it is listed as naming Modal, it must.
    const { consent } = region;
    if (consent.versionsNamingModal.includes(consent.textVersion)) {
      for (const [l, text] of Object.entries(consent.text)) {
        if (!text.includes("Modal")) {
          fail(
            ["consent", "text", l],
            `must name Modal: "${consent.textVersion}" is listed in versionsNamingModal`,
          );
        }
      }
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

    // Search opens only with the same things in place: the documents, an operator and a contact.
    if (region.legal.searchOpen) {
      if (region.legal.documentsVersion === null) {
        fail(["legal", "documentsVersion"], "required once searchOpen is true");
      }
      if (region.legal.operatorName === null) {
        fail(["legal", "operatorName"], "required once searchOpen is true");
      }
      if (region.takedown.contact === null) {
        fail(["takedown", "contact"], "required once searchOpen is true");
      }
    }

    // Constitution: sign-up opens only with the documents, a named operator and a way to ask for removal.
    if (region.legal.accountsOpen) {
      if (region.legal.documentsVersion === null) {
        fail(["legal", "documentsVersion"], "required once accountsOpen is true");
      }
      if (region.legal.operatorName === null) {
        fail(["legal", "operatorName"], "required once accountsOpen is true");
      }
      if (region.takedown.contact === null) {
        fail(["takedown", "contact"], "required once accountsOpen is true");
      }
    }
  });

export type RegionConfig = z.infer<typeof regionSchema>;
export type AreaRegion = z.infer<typeof areaRegionSchema>;

/** Combine just the app-wide settings with the area's map and vocabulary. */
export function overlayAreaRegion(home: RegionConfig, area: AreaRegion) {
  const {
    locales,
    defaultLocale,
    legal,
    features,
    sharing,
    photos,
    voice,
    minimumAge,
    takedown,
    demo,
    consent,
    retention,
    enabledSourceAdapters,
    collection,
    geo: { mapStyle, search },
  } = home;
  return regionSchema.safeParse({
    locales,
    defaultLocale,
    legal,
    features,
    sharing,
    photos,
    voice,
    minimumAge,
    takedown,
    demo,
    consent,
    retention,
    enabledSourceAdapters,
    ...area,
    geo: { mapStyle, search, ...area.geo },
    collection: { ...collection, ...area.collection },
  });
}

export type Neighbourhood = NonNullable<RegionConfig["neighbourhoods"]>[number];
export type Town = NonNullable<RegionConfig["towns"]>[number];
export type AerialPhoto = NonNullable<RegionConfig["geo"]["aerialPhoto"]>;

export type RegionPolicy = {
  inviteOnly: boolean;
  noindex: boolean;
  allowPilotVisibility: boolean;
  /** Before launch, real businesses stay in `draft` except openly licensed OSM listings. */
  realBusinessesDraftOnly: boolean;
};

/**
 * `launchPackComplete: false` forces noindex on every page (unless `searchOpen`), no `pilot` visibility and real
 * businesses in `draft` except openly licensed OSM listings (constitution, Privacy and Legal
 * Constraints). The listing exception never exposes real people's stories. Accounts stay
 * invite-only unless the launch pack is complete or `accountsOpen` is on, which changes nothing else.
 */
export function deriveRegionPolicy(region: RegionConfig): RegionPolicy {
  const open = region.legal.launchPackComplete;
  return {
    inviteOnly: !(open || region.legal.accountsOpen),
    noindex: !(open || region.legal.searchOpen),
    allowPilotVisibility: open,
    realBusinessesDraftOnly: !open,
  };
}
