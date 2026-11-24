import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { getRegionConfig } from "../src/lib/region/registry";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { hideFact } from "./facts";
import { writeAudit } from "./lib/audit";
import { currentPerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { consumeRateLimit } from "./lib/rateLimit";
import { enabledRegionIds, isRegionOn } from "./lib/region";
import { takedownStatusValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";
import { factStatus, factValue } from "./tables/facts";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CODE = /^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function randomCode(): string {
  let code = "";
  while (code.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(24))) {
      if (byte < Math.floor(256 / ALPHABET.length) * ALPHABET.length) {
        code += ALPHABET[byte % ALPHABET.length];
        if (code.length === 12) break;
      }
    }
  }
  return code;
}

async function uniqueCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await ctx.db
      .query("takedownRequest")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (existing === null) return code;
  }
  throw appError("conflict", "Could not create a receipt code. Please try again later.");
}

function reasonedText(value: string, field: string): string {
  const text = value.trim();
  if (text.length < 10 || text.length > 2000) {
    throw appError("invalid_input", `${field} must be 10 to 2000 characters after trimming.`);
  }
  return text;
}

function targetPath(text: string): { path: string; slug?: string } {
  let path = text.trim().split(/[?#]/, 1)[0] ?? "";
  try {
    const url = new URL(text.trim(), "https://noren.yooi.me");
    path = url.pathname;
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["noren.yooi.me", "localhost"].includes(url.hostname) ||
      url.username ||
      url.password ||
      (!text.trim().startsWith("/") && !/^https?:\/\//i.test(text.trim()))
    ) {
      return { path: path.slice(0, 300) };
    }
    const match = /^\/(?:ja|en)\/places\/([^/]+)\/?$/.exec(path);
    return {
      path: path.slice(0, 300),
      slug: match?.[1] ? decodeURIComponent(match[1]) : undefined,
    };
  } catch {
    return { path: path.slice(0, 300) };
  }
}

async function enforceLimit(
  ctx: MutationCtx,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
) {
  const result = await consumeRateLimit(ctx, { key, limit, windowMs, now });
  if (!result.ok) {
    throw appError("rate_limited", "Too many requests. Please try again later.");
  }
}

export const submit = mutation({
  args: {
    pageUrl: v.string(),
    factId: v.optional(v.id("placeFact")),
    details: v.string(),
    privacyOrMinor: v.boolean(),
    contact: v.optional(v.string()),
    locale: v.union(v.literal("ja"), v.literal("en")),
    website: v.optional(v.string()),
  },
  returns: v.object({
    code: v.string(),
    hidden: v.boolean(),
    matchedPlace: v.boolean(),
    receivedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.website !== undefined && args.website.length > 0) {
      return { code: randomCode(), hidden: false, matchedPlace: false, receivedAt: now };
    }
    const details = reasonedText(args.details, "Details");
    if (args.pageUrl.length > 500) {
      throw appError("invalid_input", "The page address must be at most 500 characters.");
    }
    if (args.contact !== undefined && args.contact.length > 200) {
      throw appError("invalid_input", "Contact must be at most 200 characters.");
    }
    const target = targetPath(args.pageUrl);
    let place: Doc<"place"> | null = null;
    const slug = target.slug;
    if (slug !== undefined) {
      for (const regionId of enabledRegionIds()) {
        place = await ctx.db
          .query("place")
          .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", regionId).eq("slug", slug))
          .unique();
        if (place !== null) break;
      }
    }
    const factId = args.factId;
    if (factId !== undefined) {
      const fact = await ctx.db.get("placeFact", factId);
      if (
        !place ||
        fact?.placeId !== place._id ||
        !isRegionOn(fact.regionId) ||
        fact.status !== "live" ||
        fact.isMock !== place.isMock ||
        !(await canReadPlace(ctx, await currentPerson(ctx), place))
      )
        throw appError("not_found", "Practical fact not found on that page.");
    }
    await enforceLimit(ctx, "takedown:submit", 30, HOUR, now);
    if (place !== null) await enforceLimit(ctx, `takedown:place:${place._id}`, 5, DAY, now);
    const code = await uniqueCode(ctx);
    const hidden =
      factId === undefined &&
      args.privacyOrMinor &&
      place !== null &&
      ["public", "demo_public", "pilot"].includes(place.visibility);
    const requestId = await ctx.db.insert("takedownRequest", {
      targetType: factId === undefined ? "place" : "fact",
      targetId: factId ?? place?._id ?? target.path,
      reason: details,
      privacyOrMinor: args.privacyOrMinor,
      requesterContact: args.contact?.trim() ?? "",
      status: hidden ? "hidden" : "received",
      receivedAt: now,
      acknowledgedAt: now,
      code,
      locale: args.locale,
      ...(hidden && place !== null
        ? { hiddenPlaceId: place._id, previousVisibility: place.visibility }
        : {}),
    });
    if (hidden && place !== null) {
      // The reason keeps a member's place out of the waiting list, one press from going back up.
      await ctx.db.patch("place", place._id, {
        visibility: "draft",
        demoPublicBasis: undefined,
        hiddenReason: "reported",
      });
      await writeAudit(ctx, {
        actorKind: "system",
        action: "takedown.auto_hide",
        targetType: "place",
        targetId: place._id,
        diff: { visibility: { from: place.visibility, to: "draft" } },
      });
    }
    await writeAudit(ctx, {
      actorKind: "system",
      action: "takedown.submit",
      targetType: "takedownRequest",
      targetId: requestId,
      diff: { privacyOrMinor: args.privacyOrMinor, matchedPlace: place !== null },
    });
    return { code, hidden, matchedPlace: place !== null, receivedAt: now };
  },
});

async function targetOf(ctx: QueryCtx, request: Doc<"takedownRequest">) {
  const factId =
    request.targetType === "fact" ? ctx.db.normalizeId("placeFact", request.targetId) : null;
  const fact = factId === null ? null : await ctx.db.get("placeFact", factId);
  const placeId =
    request.hiddenPlaceId ??
    fact?.placeId ??
    (request.targetType === "place" ? ctx.db.normalizeId("place", request.targetId) : null);
  const place = placeId === null ? null : await ctx.db.get("place", placeId);
  const visible =
    (fact === null || isRegionOn(fact.regionId)) && (place === null || isRegionOn(place.regionId));
  return { fact, place, visible };
}

export const statusByCode = query({
  args: { code: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: takedownStatusValidator,
      receivedAt: v.number(),
      acknowledgedAt: v.optional(v.number()),
      decidedAt: v.optional(v.number()),
      outcome: v.optional(v.string()),
      appealed: v.boolean(),
    }),
  ),
  handler: async (ctx, { code }) => {
    code = code.trim().toLowerCase();
    if (!CODE.test(code)) return null;
    const request = await ctx.db
      .query("takedownRequest")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (request === null || !(await targetOf(ctx, request)).visible) return null;
    return {
      status: request.status,
      receivedAt: request.receivedAt,
      acknowledgedAt: request.acknowledgedAt,
      decidedAt: request.decidedAt,
      outcome: request.outcome,
      appealed: request.appealedAt !== undefined,
    };
  },
});

export const appeal = mutation({
  args: { code: v.string(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { code, note }) => {
    code = code.trim().toLowerCase();
    const appealNote = reasonedText(note, "Appeal note");
    const request = CODE.test(code)
      ? await ctx.db
          .query("takedownRequest")
          .withIndex("by_code", (q) => q.eq("code", code))
          .unique()
      : null;
    if (
      request === null ||
      !(await targetOf(ctx, request)).visible ||
      request.status !== "decided"
    ) {
      throw appError(
        "conflict",
        "An appeal is available only after a request has a decided outcome.",
      );
    }
    const now = Date.now();
    await enforceLimit(ctx, `takedown:appeal:${code}`, 5, DAY, now);
    await ctx.db.patch("takedownRequest", request._id, {
      appealNote,
      appealedAt: now,
      status: "appealed",
    });
    await writeAudit(ctx, {
      actorKind: "system",
      action: "takedown.appeal",
      targetType: "takedownRequest",
      targetId: request._id,
      diff: { status: { from: request.status, to: "appealed" } },
    });
    return null;
  },
});

const listItem = v.object({
  _id: v.id("takedownRequest"),
  code: v.optional(v.string()),
  placeId: v.optional(v.id("place")),
  placeSlug: v.optional(v.string()),
  placeName: v.optional(v.string()),
  fact: v.optional(
    v.object({
      id: v.id("placeFact"),
      wording: v.object({ en: v.string(), ja: v.string() }),
      value: factValue,
      reporterName: v.string(),
      status: factStatus,
    }),
  ),
  details: v.string(),
  privacyOrMinor: v.boolean(),
  contact: v.optional(v.string()),
  status: takedownStatusValidator,
  outcome: v.optional(v.string()),
  receivedAt: v.number(),
  decidedAt: v.optional(v.number()),
  appealNote: v.optional(v.string()),
  hiddenPlaceId: v.optional(v.id("place")),
});

export const list = query({
  args: { status: v.optional(takedownStatusValidator), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(listItem),
  handler: async (ctx, { status, paginationOpts }) => {
    await requireRole(ctx, ["steward"]);
    const result =
      status === undefined
        ? await ctx.db
            .query("takedownRequest")
            .withIndex("by_creation_time")
            .order("desc")
            .paginate(paginationOpts)
        : await ctx.db
            .query("takedownRequest")
            .withIndex("by_status_and_receivedAt", (q) => q.eq("status", status))
            .order("desc")
            .paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (request) => {
        const { fact, place, visible } = await targetOf(ctx, request);
        if (!visible) return null;
        const names =
          place === null
            ? []
            : await ctx.db
                .query("placeName")
                .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", place._id))
                .take(20);
        const name =
          names.find((name) => name.isPrimary && name.lang === request.locale) ??
          names.find((name) => name.isPrimary);
        const labels =
          fact &&
          getRegionConfig(fact.regionId)?.factVocabulary?.find(({ key }) => key === fact.key)
            ?.labels;
        const reporter = fact?.personId
          ? (await ctx.db.get("person", fact.personId))?.displayName
          : fact?.sourceId
            ? (await ctx.db.get("source", fact.sourceId))?.authorHandle
            : undefined;
        return {
          _id: request._id,
          code: request.code,
          placeId: place?._id,
          placeSlug: place?.slug,
          placeName: name?.value,
          fact: fact
            ? {
                id: fact._id,
                wording: { en: labels?.en ?? fact.key, ja: labels?.ja ?? fact.key },
                value: fact.value,
                reporterName: reporter ?? "",
                status: fact.status,
              }
            : undefined,
          details: request.reason,
          privacyOrMinor: request.privacyOrMinor,
          contact: request.requesterContact || undefined,
          status: request.status,
          outcome: request.outcome,
          receivedAt: request.receivedAt,
          decidedAt: request.decidedAt,
          appealNote: request.appealNote,
          hiddenPlaceId: request.hiddenPlaceId,
        };
      }),
    );
    return { ...result, page: page.filter((item) => item !== null) };
  },
});

export const decide = mutation({
  args: {
    requestId: v.id("takedownRequest"),
    status: v.union(v.literal("decided"), v.literal("closed")),
    outcome: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { requestId, status, outcome }) => {
    const steward = await requireRole(ctx, ["steward"]);
    outcome = reasonedText(
      outcome,
      "Outcome (the requester reads this; do not include personal data)",
    );
    const request = await ctx.db.get("takedownRequest", requestId);
    if (request === null || !(await targetOf(ctx, request)).visible)
      throw appError("not_found", "Takedown request not found.");
    // A decided request that nobody appealed is finished by closing it, so decided -> closed is allowed.
    const decidable = ["received", "hidden", "appealed"].includes(request.status);
    if (!decidable && !(request.status === "decided" && status === "closed")) {
      throw appError(
        "conflict",
        "Only a received, hidden or appealed request can be decided, and a decided one can be closed.",
      );
    }
    if (request.targetType === "fact" && status === "decided") {
      const factId = ctx.db.normalizeId("placeFact", request.targetId);
      // The writer may have deleted their account while the request was in the queue.
      if (factId && (await ctx.db.get("placeFact", factId)))
        await hideFact(ctx, steward, factId, outcome);
    }
    await ctx.db.patch("takedownRequest", requestId, {
      status,
      outcome,
      decidedAt: Date.now(),
      ...(status === "closed" ? { requesterContact: "" } : {}),
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "takedown.decide",
      targetType: "takedownRequest",
      targetId: requestId,
      diff: { status: { from: request.status, to: status } },
    });
    return null;
  },
});
