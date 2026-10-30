import { z } from "zod";
import { transcriptText } from "../../src/lib/claims/transcript-text";
import { ROLES, SCRIPTS } from "../../src/lib/domain/constants";
import type { RegionConfig } from "../../src/lib/region/schema";

const text = z.string().trim().min(1);
export const namesSchema = z
  .array(
    z.strictObject({
      lang: text,
      script: z.enum(SCRIPTS),
      value: text.max(120),
      isPrimary: z.boolean(),
    }),
  )
  .min(1)
  .max(12);
export const pinSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const schema = z.strictObject({
  regionId: text,
  issuerNote: text,
  accounts: z.strictObject({ user: text, creator: text, business_owner: text, steward: text }),
  place: z.strictObject({ names: namesSchema, pin: pinSchema, category: text.optional() }),
  interview: z.strictObject({
    language: text,
    segments: z
      .array(
        z
          .strictObject({
            start: z.number().nonnegative(),
            end: z.number().nonnegative(),
            speaker: text.optional(),
            text: z.string().max(5000),
          })
          .refine((s) => s.end >= s.start, "end precedes start"),
      )
      .min(1)
      .max(2000),
  }),
  claims: z
    .array(
      z.strictObject({
        kind: z.enum(["story", "fact", "caution"]),
        cautionType: text.optional(),
        quote: z
          .string()
          .min(1)
          .refine((s) => !!s.trim()),
        textOriginal: text.max(1000),
        translations: z.record(text, text.max(1000)).optional(),
      }),
    )
    .min(1)
    .max(100),
  sources: z
    .array(
      z.strictObject({
        url: z.url(),
        title: text.max(200).optional(),
        note: text.max(1000).optional(),
        noteLang: text.optional(),
        authorHandle: text.optional(),
        authorUrl: z.url().optional(),
        authorAgreed: z.boolean(),
      }),
    )
    .optional(),
});
export type DemoData = z.infer<typeof schema>;
export type DemoStep = {
  label: string;
  fn: string;
  args: unknown;
  as: "creator" | "business_owner" | "steward" | "admin";
  saveAs?: string;
};

export function parseDemoData(json: unknown): DemoData {
  const data = schema.parse(json);
  if (new Set(Object.values(data.accounts)).size !== ROLES.length)
    throw new Error("Use four distinct mock accounts");
  const transcript = transcriptText(data.interview.segments);
  data.claims.forEach((claim, i) => {
    const start = transcript.indexOf(claim.quote);
    if (start < 0 || transcript.indexOf(claim.quote, start + 1) >= 0)
      throw new Error(`claim ${i}: quote must occur exactly once`);
    if ((claim.kind === "caution") !== (claim.cautionType !== undefined))
      throw new Error(`claim ${i}: only cautions require cautionType`);
  });
  return data;
}

export function demoSteps(data: DemoData, region: RegionConfig): DemoStep[] {
  if (region.id !== data.regionId) throw new Error("Region mismatch");
  for (const lang of [
    data.interview.language,
    ...data.place.names.map((n) => n.lang),
    ...data.claims.flatMap((c) => Object.keys(c.translations ?? {})),
  ]) {
    if (!region.locales.includes(lang)) throw new Error(`Unknown region language: ${lang}`);
  }
  for (const [i, claim] of data.claims.entries()) {
    if (claim.translations?.[data.interview.language])
      throw new Error(`claim ${i}: translation must use a different language`);
    if (claim.cautionType && !region.cautionVocabulary.some((c) => c.key === claim.cautionType))
      throw new Error(`claim ${i}: unknown cautionType`);
  }
  const steps: DemoStep[] = [];
  const add = (fn: string, args: unknown, as: DemoStep["as"], saveAs?: string, label = fn) =>
    steps.push({ label, fn, args, as, ...(saveAs ? { saveAs } : {}) });
  for (const role of ROLES)
    add(
      "seed:personIdFor",
      { clerkUserId: data.accounts[role] },
      "admin",
      `${role}Person`,
      `Preflight mock ${role}`,
    );
  // The user preflight also needs a user identity; its label carries the role without adding a write identity to DemoStep.
  for (const role of ROLES)
    add(
      "people:current",
      {},
      role === "user" ? "admin" : role,
      undefined,
      `Preflight identity ${role}`,
    );
  add("places:listMine", { regionId: data.regionId }, "creator");
  add(
    "places:create",
    { regionId: data.regionId, kind: "business", ...data.place },
    "creator",
    "placeId",
  );
  add("places:attachOwner", { placeId: "$placeId", personId: "$business_ownerPerson" }, "steward");
  add(
    "interviews:create",
    { placeId: "$placeId", language: data.interview.language },
    "creator",
    "interviewId",
  );
  add(
    "interviews:recordConsent",
    {
      interviewId: "$interviewId",
      scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
      textVersion: region.consent.textVersion,
      textLang: data.interview.language,
      assisted: false,
    },
    "creator",
  );
  add(
    "interviews:saveCorrection",
    { interviewId: "$interviewId", segments: data.interview.segments },
    "creator",
    "transcriptId",
  );
  const transcript = transcriptText(data.interview.segments);
  data.claims.forEach((claim, i) => {
    const spanStart = transcript.indexOf(claim.quote);
    add(
      "claims:proposeFromSpan",
      {
        transcriptId: "$transcriptId",
        spanStart,
        spanEnd: spanStart + claim.quote.length,
        textOriginal: claim.textOriginal,
        kind: claim.kind,
        ...(claim.cautionType ? { cautionType: claim.cautionType } : {}),
      },
      "creator",
      `claim${i}`,
    );
  });
  data.claims.forEach((_, i) =>
    add("claims:review", { claimId: `$claim${i}`, action: "confirm" }, "business_owner"),
  );
  data.claims.forEach((claim, i) => {
    for (const [lang, text] of Object.entries(claim.translations ?? {}))
      add("claims:setHumanTranslation", { claimId: `$claim${i}`, lang, text }, "steward");
  });
  data.sources?.forEach(({ authorAgreed, ...source }, i) => {
    add("sources:add", { placeId: "$placeId", ...source }, "creator", `source${i}`);
    if (authorAgreed) add("sources:recordDemoConsent", { sourceId: `$source${i}` }, "steward");
  });
  add(
    "places:setVisibility",
    { placeId: "$placeId", visibility: "demo_public", confirmFictional: true },
    "steward",
  );
  add("pages:compose", { placeId: "$placeId" }, "steward");
  return steps;
}

export function resolveArgs(args: unknown, saved: Readonly<Record<string, unknown>>): unknown {
  if (typeof args === "string" && /^\$[A-Za-z][A-Za-z0-9_]*$/.test(args)) {
    const key = args.slice(1);
    if (!Object.hasOwn(saved, key)) throw new Error(`Missing saved result: ${args}`);
    return saved[key];
  }
  if (Array.isArray(args)) return args.map((a) => resolveArgs(a, saved));
  if (args !== null && typeof args === "object")
    return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, resolveArgs(v, saved)]));
  return args;
}
