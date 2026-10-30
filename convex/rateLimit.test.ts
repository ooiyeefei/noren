/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { newBackend } from "../tests/convex/fixtures";
import { consumeRateLimit } from "./lib/rateLimit";

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
