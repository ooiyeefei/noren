import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { samePagePath } from "./lib/pagePath";
import { consumeRateLimit } from "./lib/rateLimit";

const HOUR = 60 * 60 * 1000;
const statusValidator = v.union(v.literal("open"), v.literal("done"));

/**
 * A visitor's bug report. No account is needed and nobody's identity is read or stored. The
 * honeypot (`website`) answers success and writes nothing.
 */
export const submit = mutation({
  args: {
    details: v.string(),
    pagePath: v.string(),
    device: v.string(),
    contact: v.optional(v.string()),
    locale: v.union(v.literal("ja"), v.literal("en")),
    website: v.optional(v.string()),
  },
  returns: v.object({ receivedAt: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.website !== undefined && args.website.length > 0) return { receivedAt: now };
    const details = args.details.trim();
    if (details.length < 10 || details.length > 2000) {
      throw appError("invalid_input", "Details must be 10 to 2000 characters after trimming.");
    }
    if (args.device.length > 300) {
      throw appError("invalid_input", "Device must be at most 300 characters.");
    }
    if (args.contact !== undefined && args.contact.length > 200) {
      throw appError("invalid_input", "Contact must be at most 200 characters.");
    }
    const limit = await consumeRateLimit(ctx, {
      key: "problem:submit",
      limit: 30,
      windowMs: HOUR,
      now,
    });
    if (!limit.ok) throw appError("rate_limited", "Too many requests. Please try again later.");
    await ctx.db.insert("problemReport", {
      details,
      pagePath: samePagePath(args.pagePath),
      device: args.device.trim(),
      contact: args.contact?.trim() ?? "",
      locale: args.locale,
      status: "open",
      receivedAt: now,
    });
    return { receivedAt: now };
  },
});

const listItem = v.object({
  _id: v.id("problemReport"),
  details: v.string(),
  pagePath: v.string(),
  device: v.string(),
  contact: v.optional(v.string()),
  locale: v.union(v.literal("ja"), v.literal("en")),
  status: statusValidator,
  receivedAt: v.number(),
  closedAt: v.optional(v.number()),
});

export const list = query({
  args: { status: statusValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(listItem),
  handler: async (ctx, { status, paginationOpts }) => {
    await requireRole(ctx, ["steward"]);
    const result = await ctx.db
      .query("problemReport")
      .withIndex("by_status_and_receivedAt", (q) => q.eq("status", status))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((report) => ({
        _id: report._id,
        details: report.details,
        pagePath: report.pagePath,
        device: report.device,
        contact: report.contact || undefined,
        locale: report.locale,
        status: report.status,
        receivedAt: report.receivedAt,
        closedAt: report.closedAt,
      })),
    };
  },
});

/** Marks a report done and erases the contact detail. The audit entry holds no words or contact. */
export const close = mutation({
  args: { reportId: v.id("problemReport") },
  returns: v.null(),
  handler: async (ctx, { reportId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const report = await ctx.db.get("problemReport", reportId);
    if (report === null) throw appError("not_found", "Problem report not found.");
    if (report.status === "done") throw appError("conflict", "This report is already done.");
    await ctx.db.patch("problemReport", reportId, {
      status: "done",
      closedAt: Date.now(),
      closedBy: steward._id,
      contact: "",
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "problem.closed",
      targetType: "problemReport",
      targetId: reportId,
      diff: { status: { from: "open", to: "done" } },
    });
    return null;
  },
});
