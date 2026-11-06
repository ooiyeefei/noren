/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPerson, newBackend, type Backend } from "../tests/convex/fixtures";
import nagasaki from "../regions/nagasaki.json";
import type { Role } from "../src/lib/domain/constants";
import { isNewAccount } from "../src/lib/region/new-account";
import type { Id } from "./_generated/dataModel";
import { consumeRateLimit, limitContribution } from "./lib/rateLimit";

const modules = import.meta.glob("./**/*.ts");

describe("consumeRateLimit", () => {
  it("counts one row per key, refuses without increasing it, and resets at the window boundary", async () => {
    const b = newBackend(modules);
    const consume = (now: number, key = "test") =>
      b.run((ctx) => consumeRateLimit(ctx, { key, limit: 2, windowMs: 1000, now }));
    expect(await consume(100)).toEqual({ ok: true });
    expect(await consume(200)).toEqual({ ok: true });
    expect(await consume(300)).toEqual({ ok: false, retryAfterMs: 800 });
    expect(await consume(1099)).toEqual({ ok: false, retryAfterMs: 1 });
    expect(await consume(300, "other")).toEqual({ ok: true });
    const rows = await b.run((ctx) => ctx.db.query("rateLimit").take(10));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.key === "test")).toMatchObject({ count: 2, windowStart: 100 });
    expect(await consume(1100)).toEqual({ ok: true });
    expect(await consume(1101)).toEqual({ ok: true });
    expect(await consume(1102)).toEqual({ ok: false, retryAfterMs: 998 });
    expect(await consume(10000)).toEqual({ ok: true });
    expect(await b.run((ctx) => ctx.db.query("rateLimit").take(10))).toHaveLength(2);
  });
});

describe("limitContribution", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const { days, perDay } = nagasaki.collection.newAccount;
  const newAccountLimits = Object.entries(perDay) as [keyof typeof perDay, number][];
  const established = {
    place: 20,
    post: 50,
    story: 50,
    preview: 200,
    draft: 30,
    check: 100,
    report: 20,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  /** How many times the person may do this today before being refused. */
  async function allowance(b: Backend, id: Id<"person">, kind: keyof typeof perDay, stop = 300) {
    for (let done = 0; done < stop; done++) {
      try {
        await b.run(async (ctx) => {
          const person = await ctx.db.get("person", id);
          await limitContribution(ctx, person!, kind, "nagasaki");
        });
      } catch (error) {
        expect((error as { data?: { code?: string } }).data?.code).toBe("rate_limited");
        return done;
      }
    }
    return stop;
  }

  it("has a new-account limit for every kind, lower than the established one", () => {
    expect(Object.keys(perDay).sort()).toEqual(Object.keys(established).sort());
    for (const [kind, limit] of newAccountLimits) expect(limit).toBeLessThan(established[kind]);
    expect(perDay).toEqual({
      story: 5,
      place: 3,
      post: 5,
      preview: 20,
      draft: 3,
      check: 10,
      report: 3,
    });
    expect(days).toBe(7);
  });

  it.each(newAccountLimits)("a new member is refused at %s number %i", async (kind, limit) => {
    const b = newBackend(modules);
    const id = await addPerson(b, "newcomer", "user");
    expect(await allowance(b, id, kind)).toBe(limit);
  });

  it.each(Object.entries(established) as [keyof typeof perDay, number][])(
    "after 7 days a member may reach the higher %s limit of %i",
    async (kind, limit) => {
      const b = newBackend(modules);
      const id = await addPerson(b, "regular", "user", { joinedDaysAgo: days + 1 });
      expect(await allowance(b, id, kind)).toBe(limit);
    },
  );

  it("an account stops being new exactly 7 days after joining, and only a plain user is new", () => {
    const joinedAt = Date.UTC(2026, 10, 1, 3, 0);
    const end = joinedAt + days * DAY_MS;
    const isNew = (role: Role, now: number) => isNewAccount({ role, joinedAt }, nagasaki, now);
    expect(isNew("user", joinedAt)).toBe(true);
    expect(isNew("user", end - 1)).toBe(true);
    expect(isNew("user", end)).toBe(false);
    for (const role of ["creator", "business_owner", "steward"] as const)
      expect(isNew(role, joinedAt)).toBe(false);
  });

  it("the higher limit starts on day 8, and that day's count carries over", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1, 3, 0) });
    const b = newBackend(modules);
    const id = await addPerson(b, "newcomer", "user");
    const creationTime = (await b.run((ctx) => ctx.db.get("person", id)))!._creationTime;
    // convex-test moves a fake clock on as it runs, so this stays a little way off the boundary.
    vi.setSystemTime(creationTime + days * DAY_MS - 60 * 60 * 1000);
    expect(await allowance(b, id, "story")).toBe(perDay.story);
    vi.setSystemTime(creationTime + days * DAY_MS);
    expect(await allowance(b, id, "story")).toBe(established.story - perDay.story);
  });

  it.each(["creator", "business_owner"] as const)(
    "a brand-new %s has the higher limits, because a steward vouched for them",
    async (role) => {
      const b = newBackend(modules);
      const id = await addPerson(b, "vouched", role);
      expect(await allowance(b, id, "story")).toBe(established.story);
      expect(await allowance(b, id, "report")).toBe(established.report);
    },
  );

  it("a steward has no limit, new or not, and writes no counter", async () => {
    const b = newBackend(modules);
    const id = await addPerson(b, "steward", "steward");
    for (const [kind] of newAccountLimits) expect(await allowance(b, id, kind, 205)).toBe(205);
    expect(await b.run((ctx) => ctx.db.query("rateLimit").take(1))).toEqual([]);
  });
});
