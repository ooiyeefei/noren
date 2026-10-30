/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiFromModules } from "convex/server";
import { addPerson, addPlace, errorCode, newBackend, type Backend } from "../tests/convex/fixtures";
import { api as generatedApi } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
// Keep the real runtime proxy and infer this module until the orchestrator runs codegen.
const api = generatedApi as typeof generatedApi &
  ApiFromModules<{ takedown: typeof import("./takedown") }>;
const details = "Please review this page for removal.";
const contact = "private contact token";
const input = {
  pageUrl: "/en/places/missing",
  details,
  privacyOrMinor: false,
  locale: "en" as const,
};
const outcome = "We reviewed the request and will keep this page hidden.";
const note = "Please reconsider the reason given in the decision.";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

afterEach(() => vi.restoreAllMocks());

async function setup(visibility: Doc<"place">["visibility"] = "public") {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const placeId = await addPlace(b, { createdBy: steward, slug: "mock-shop", visibility });
  return { b, steward, placeId, args: { ...input, pageUrl: "/en/places/mock-shop" } };
}

async function requestByCode(b: Backend, code: string) {
  const request = await b.run((ctx) =>
    ctx.db
      .query("takedownRequest")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique(),
  );
  if (request === null) throw new Error("Missing test request");
  return request;
}

async function expectLimited(work: Promise<unknown>) {
  await expect(work).rejects.toMatchObject({
    data: { code: "rate_limited", message: expect.stringMatching(/try again later/i) },
  });
}

describe("public takedown", () => {
  it("a signed-out visitor can submit and gets a code", async () => {
    const b = newBackend(modules);
    const result = await b.t.mutation(api.takedown.submit, {
      ...input,
      details: `  ${details}  `,
      contact: `  ${contact}  `,
    });
    expect(result).toMatchObject({
      code: expect.stringMatching(/^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/),
      hidden: false,
      matchedPlace: false,
      receivedAt: expect.any(Number),
    });
    expect(await requestByCode(b, result.code)).toMatchObject({
      status: "received",
      reason: details,
      requesterContact: contact,
      locale: "en",
      receivedAt: result.receivedAt,
      acknowledgedAt: result.receivedAt,
    });
  });

  it("a privacy request on a public place hides it at once and records previousVisibility", async () => {
    const { b, placeId, args } = await setup();
    expect(
      await b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug: "mock-shop" }),
    ).not.toBeNull();
    const result = await b.t.mutation(api.takedown.submit, { ...args, privacyOrMinor: true });
    expect(result).toMatchObject({ hidden: true, matchedPlace: true });
    expect(await requestByCode(b, result.code)).toMatchObject({
      targetType: "place",
      targetId: placeId,
      status: "hidden",
      hiddenPlaceId: placeId,
      previousVisibility: "public",
    });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "draft",
    });
    expect(
      await b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug: "mock-shop" }),
    ).toBeNull();
    const audit = await b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audit).toContainEqual(
      expect.objectContaining({
        action: "takedown.auto_hide",
        actorKind: "system",
        targetType: "place",
        targetId: placeId,
      }),
    );
    expect(audit).toContainEqual(
      expect.objectContaining({
        action: "takedown.submit",
        actorKind: "system",
        diff: { privacyOrMinor: true, matchedPlace: true },
      }),
    );
  });

  it("a non-privacy request does not hide", async () => {
    const { b, placeId, args } = await setup();
    const result = await b.t.mutation(api.takedown.submit, args);
    expect(result).toMatchObject({ hidden: false, matchedPlace: true });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "public",
    });
    expect(await requestByCode(b, result.code)).toMatchObject({ status: "received" });
  });

  it("a request for an address that matches no place is accepted and hides nothing", async () => {
    const b = newBackend(modules);
    const result = await b.t.mutation(api.takedown.submit, { ...input, privacyOrMinor: true });
    expect(result).toMatchObject({ hidden: false, matchedPlace: false });
    expect(await requestByCode(b, result.code)).toMatchObject({
      targetType: "place",
      targetId: input.pageUrl,
      status: "received",
      requesterContact: "",
    });
  });

  it("a place already in draft is not touched", async () => {
    const { b, placeId, args } = await setup("draft");
    const before = await b.run((ctx) => ctx.db.get("place", placeId));
    const result = await b.t.mutation(api.takedown.submit, { ...args, privacyOrMinor: true });
    expect(result).toMatchObject({ hidden: false, matchedPlace: true });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toEqual(before);
    const request = await requestByCode(b, result.code);
    expect(request.hiddenPlaceId).toBeUndefined();
    expect(request.previousVisibility).toBeUndefined();
    expect(
      (await b.run((ctx) => ctx.db.query("auditLog").take(10))).map((entry) => entry.action),
    ).toEqual(["takedown.submit"]);
  });

  it("the honeypot writes nothing and still answers success", async () => {
    const { b, placeId, args } = await setup();
    const before = await b.run((ctx) => ctx.db.get("place", placeId));
    const result = await b.t.mutation(api.takedown.submit, {
      ...args,
      privacyOrMinor: true,
      website: "bot",
    });
    expect(result).toMatchObject({
      hidden: false,
      matchedPlace: false,
      code: expect.stringMatching(/^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/),
      receivedAt: expect.any(Number),
    });
    await b.t.mutation(api.takedown.submit, {
      ...input,
      details: "",
      pageUrl: "x".repeat(501),
      website: "bot",
    });
    expect(await b.run((ctx) => ctx.db.query("takedownRequest").take(10))).toEqual([]);
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual([]);
    expect(await b.run((ctx) => ctx.db.query("rateLimit").take(10))).toEqual([]);
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toEqual(before);
  });

  it("details too short or too long, pageUrl too long: invalid_input", async () => {
    const b = newBackend(modules);
    for (const change of [
      { details: "   short   " },
      { details: "x".repeat(2001) },
      { pageUrl: "x".repeat(501) },
      { contact: "x".repeat(201) },
    ]) {
      expect(await errorCode(b.t.mutation(api.takedown.submit, { ...input, ...change }))).toBe(
        "invalid_input",
      );
    }
    for (const size of [10, 2000])
      await b.t.mutation(api.takedown.submit, { ...input, details: "x".repeat(size) });
  });

  it("codes are unique and 12 characters from the alphabet", async () => {
    const b = newBackend(modules);
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const result = await b.t.mutation(api.takedown.submit, input);
      expect(result.code).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/);
      codes.add(result.code);
    }
    expect(codes.size).toBe(20);
  });

  it("checks by_code for collisions before issuing a code", async () => {
    const b = newBackend(modules);
    const random = vi.spyOn(crypto, "getRandomValues");
    random.mockImplementationOnce((bytes) => {
      if (bytes instanceof Uint8Array) bytes.fill(0);
      return bytes;
    });
    const first = await b.t.mutation(api.takedown.submit, input);
    random.mockImplementationOnce((bytes) => {
      if (bytes instanceof Uint8Array) bytes.fill(0);
      return bytes;
    });
    const second = await b.t.mutation(api.takedown.submit, input);
    expect(first.code).toBe("2".repeat(12));
    expect(second.code).not.toBe(first.code);
  });

  it("resolves approved hosts, bare paths and encoded slugs only in the active region", async () => {
    const { b, args } = await setup();
    for (const pageUrl of [
      "https://noren.yooi.me/ja/places/mock-shop?x=1#section",
      "http://localhost:3000/en/places/mock-shop/",
      "/en/places/%6dock-shop",
    ]) {
      expect(await b.t.mutation(api.takedown.submit, { ...args, pageUrl })).toMatchObject({
        matchedPlace: true,
      });
    }
    for (const pageUrl of [
      "https://elsewhere.invalid/en/places/mock-shop",
      "https://noren.yooi.me.evil.invalid/en/places/mock-shop",
      "/en/places/%zz",
      "/fr/places/mock-shop",
      "/other/" + "x".repeat(400),
    ]) {
      const result = await b.t.mutation(api.takedown.submit, {
        ...args,
        pageUrl,
        privacyOrMinor: true,
      });
      expect(result).toMatchObject({ matchedPlace: false, hidden: false });
      expect((await requestByCode(b, result.code)).targetId.length).toBeLessThanOrEqual(300);
    }
    const person = await addPerson(b, "elsewhere", "creator");
    await addPlace(b, { createdBy: person, regionId: "other-region", slug: "other-shop" });
    expect(
      await b.t.mutation(api.takedown.submit, { ...input, pageUrl: "/en/places/other-shop" }),
    ).toMatchObject({ matchedPlace: false });
  });

  it("statusByCode returns null for unknown or malformed codes and never leaks contact or details", async () => {
    const b = newBackend(modules);
    const result = await b.t.mutation(api.takedown.submit, { ...input, contact });
    for (const code of ["", "bad", "0".repeat(12), "z".repeat(13), "2".repeat(12)])
      expect(await b.t.query(api.takedown.statusByCode, { code })).toBeNull();
    const status = await b.t.query(api.takedown.statusByCode, {
      code: `  ${result.code.toUpperCase()}  `,
    });
    expect(status).toEqual({
      status: "received",
      receivedAt: result.receivedAt,
      acknowledgedAt: result.receivedAt,
      appealed: false,
    });
  });

  it("a demo_public mock place can be hidden the same way and its basis is cleared", async () => {
    const { b, placeId, args } = await setup("demo_public");
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      demoPublicBasis: "fictional",
      isMock: true,
    });
    const result = await b.t.mutation(api.takedown.submit, { ...args, privacyOrMinor: true });
    expect(result.hidden).toBe(true);
    const place = await b.run((ctx) => ctx.db.get("place", placeId));
    expect(place?.visibility).toBe("draft");
    expect(place?.demoPublicBasis).toBeUndefined();
    expect(await requestByCode(b, result.code)).toMatchObject({
      previousVisibility: "demo_public",
    });
  });

  it("a pilot place is hidden immediately too", async () => {
    const { b, args } = await setup("pilot");
    expect(
      await b.t.mutation(api.takedown.submit, { ...args, privacyOrMinor: true }),
    ).toMatchObject({ hidden: true });
  });
});

describe("decisions and appeals", () => {
  async function submitted(privacyOrMinor = false) {
    const s = await setup();
    const result = await s.b.t.mutation(api.takedown.submit, {
      ...s.args,
      privacyOrMinor,
      contact,
    });
    return { ...s, result, request: await requestByCode(s.b, result.code) };
  }

  it("appeal needs a decided request", async () => {
    const { b, request, result } = await submitted();
    expect(await errorCode(b.t.mutation(api.takedown.appeal, { code: result.code, note }))).toBe(
      "conflict",
    );
    for (const status of ["hidden", "closed"] as const) {
      await b.run((ctx) => ctx.db.patch("takedownRequest", request._id, { status, outcome }));
      expect(await errorCode(b.t.mutation(api.takedown.appeal, { code: result.code, note }))).toBe(
        "conflict",
      );
    }
    expect(await errorCode(b.t.mutation(api.takedown.appeal, { code: "unknown", note }))).toBe(
      "conflict",
    );
    await b.run((ctx) => ctx.db.patch("takedownRequest", request._id, { status: "received" }));
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    for (const badNote of ["short", "x".repeat(2001)])
      expect(
        await errorCode(b.t.mutation(api.takedown.appeal, { code: result.code, note: badNote })),
      ).toBe("invalid_input");
    await b.t.mutation(api.takedown.appeal, {
      code: ` ${result.code.toUpperCase()} `,
      note: ` ${note} `,
    });
    expect(await requestByCode(b, result.code)).toMatchObject({
      status: "appealed",
      appealNote: note,
      appealedAt: expect.any(Number),
    });
    expect(await b.t.query(api.takedown.statusByCode, { code: result.code })).toMatchObject({
      appealed: true,
      outcome,
      decidedAt: expect.any(Number),
    });
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
  });

  it("appeal twice is refused", async () => {
    const { b, request, result } = await submitted();
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    await b.t.mutation(api.takedown.appeal, { code: result.code, note });
    expect(await errorCode(b.t.mutation(api.takedown.appeal, { code: result.code, note }))).toBe(
      "conflict",
    );
  });

  it("decide is steward-only", async () => {
    const { b, request } = await submitted();
    const args = { requestId: request._id, status: "decided" as const, outcome };
    expect(await errorCode(b.t.mutation(api.takedown.decide, args))).toBe("unauthenticated");
    for (const role of ["user", "creator", "business_owner"] as const) {
      await addPerson(b, role, role);
      expect(await errorCode(b.as(role).mutation(api.takedown.decide, args))).toBe("forbidden");
    }
    await b.as("steward").mutation(api.takedown.decide, args);
    expect(await errorCode(b.as("steward").mutation(api.takedown.decide, args))).toBe("conflict");
    const audit = await b.run((ctx) => ctx.db.query("auditLog").take(20));
    expect(audit).toContainEqual(
      expect.objectContaining({
        action: "takedown.decide",
        actorKind: "person",
        actorPersonId: expect.any(String),
        diff: { status: { from: "received", to: "decided" } },
      }),
    );
  });

  it("decide needs a reasoned outcome", async () => {
    const { b, request } = await submitted();
    for (const outcome of ["short", "x".repeat(2001), "          "]) {
      await expect(
        b
          .as("steward")
          .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome }),
      ).rejects.toMatchObject({
        data: {
          code: "invalid_input",
          message: expect.stringMatching(/requester reads this; do not include personal data/),
        },
      });
    }
  });

  it("closing clears the contact", async () => {
    const { b, request, result } = await submitted();
    await b.as("steward").mutation(api.takedown.decide, {
      requestId: request._id,
      status: "closed",
      outcome: ` ${outcome} `,
    });
    expect(await requestByCode(b, result.code)).toMatchObject({
      status: "closed",
      outcome,
      requesterContact: "",
      decidedAt: expect.any(Number),
    });
    expect(
      await errorCode(
        b
          .as("steward")
          .mutation(api.takedown.decide, { requestId: request._id, status: "closed", outcome }),
      ),
    ).toBe("conflict");
  });

  it("a decided request can be closed and closing clears the contact", async () => {
    const { b, request, result } = await submitted();
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    expect(await requestByCode(b, result.code)).toMatchObject({
      status: "decided",
      outcome,
      requesterContact: contact,
    });
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "closed", outcome });
    expect(await requestByCode(b, result.code)).toMatchObject({
      status: "closed",
      outcome,
      requesterContact: "",
    });
  });

  it("a decided request cannot be decided again (conflict)", async () => {
    const { b, request, result } = await submitted();
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    const before = await requestByCode(b, result.code);
    expect(before).toMatchObject({ status: "decided", outcome, requesterContact: contact });
    expect(
      await errorCode(
        b.as("steward").mutation(api.takedown.decide, {
          requestId: request._id,
          status: "decided",
          outcome: "This replacement outcome must never be saved.",
        }),
      ),
    ).toBe("conflict");
    expect(await requestByCode(b, result.code)).toEqual(before);
  });

  it("a closed request cannot be decided or closed again (conflict)", async () => {
    const { b, request, result } = await submitted();
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "closed", outcome });
    const before = await requestByCode(b, result.code);
    expect(before).toMatchObject({ status: "closed", outcome, requesterContact: "" });
    for (const status of ["decided", "closed"] as const) {
      expect(
        await errorCode(
          b.as("steward").mutation(api.takedown.decide, {
            requestId: request._id,
            status,
            outcome: "This replacement outcome must never be saved.",
          }),
        ),
      ).toBe("conflict");
      expect(await requestByCode(b, result.code)).toEqual(before);
    }
  });

  it("closing a decided request keeps the original outcome readable by code", async () => {
    const { b, request, result } = await submitted();
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "closed", outcome });
    expect(await b.t.query(api.takedown.statusByCode, { code: result.code })).toMatchObject({
      status: "closed",
      outcome,
      appealed: false,
    });
  });

  it("an appealed request can be decided again and then closed", async () => {
    const { b, request, result } = await submitted();
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    await b.t.mutation(api.takedown.appeal, { code: result.code, note });
    expect(await requestByCode(b, result.code)).toMatchObject({ status: "appealed" });
    const revisedOutcome = "We reconsidered the appeal and will keep this page hidden.";
    await b.as("steward").mutation(api.takedown.decide, {
      requestId: request._id,
      status: "decided",
      outcome: revisedOutcome,
    });
    expect(await requestByCode(b, result.code)).toMatchObject({
      status: "decided",
      outcome: revisedOutcome,
      requesterContact: contact,
    });
    await b.as("steward").mutation(api.takedown.decide, {
      requestId: request._id,
      status: "closed",
      outcome: revisedOutcome,
    });
    expect(await requestByCode(b, result.code)).toMatchObject({
      status: "closed",
      outcome: revisedOutcome,
      requesterContact: "",
    });
  });

  it("decide does not republish the place", async () => {
    const { b, placeId, request } = await submitted(true);
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "draft",
    });
  });

  it("no audit diff contains the contact or the details", async () => {
    const { b, request, result } = await submitted(true);
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    await b.t.mutation(api.takedown.appeal, { code: result.code, note });
    await b
      .as("steward")
      .mutation(api.takedown.decide, { requestId: request._id, status: "closed", outcome });
    const audit = await b.run((ctx) => ctx.db.query("auditLog").take(20));
    expect(audit.map((entry) => entry.action)).toEqual([
      "takedown.auto_hide",
      "takedown.submit",
      "takedown.decide",
      "takedown.appeal",
      "takedown.decide",
    ]);
    for (const entry of audit) {
      const text = JSON.stringify(entry);
      for (const privateText of [
        contact,
        details,
        note,
        outcome,
        "requesterContact",
        "reason",
        "appealNote",
      ])
        expect(text).not.toContain(privateText);
    }
  });

  it("list is steward-only, paginated, newest first", async () => {
    const { b, request, result, placeId } = await submitted();
    const second = await b.t.mutation(api.takedown.submit, { ...input, privacyOrMinor: true });
    const latest = await b.t.mutation(api.takedown.submit, {
      ...input,
      pageUrl: "/ja/places/mock-shop",
      privacyOrMinor: true,
      locale: "ja",
    });
    const opts = { paginationOpts: { numItems: 2, cursor: null } };
    expect(await errorCode(b.t.query(api.takedown.list, opts))).toBe("unauthenticated");
    for (const role of ["user", "creator", "business_owner"] as const) {
      await addPerson(b, role, role);
      expect(await errorCode(b.as(role).query(api.takedown.list, opts))).toBe("forbidden");
    }
    const first = await b.as("steward").query(api.takedown.list, opts);
    expect(first.page.map((row) => row.code)).toEqual([latest.code, second.code]);
    expect(first.isDone).toBe(false);
    expect(first.page[0]).toMatchObject({
      placeId,
      placeSlug: "mock-shop",
      placeName: "テスト店",
      hiddenPlaceId: placeId,
    });
    const next = await b
      .as("steward")
      .query(api.takedown.list, { paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(next.page).toHaveLength(1);
    expect(next.page[0]).toMatchObject({
      _id: request._id,
      code: result.code,
      placeId,
      placeSlug: "mock-shop",
      placeName: "Test Shop",
      details,
      contact,
    });
    expect(next.isDone).toBe(true);
    const filtered = await b
      .as("steward")
      .query(api.takedown.list, { ...opts, status: "received" });
    expect(filtered.page.map((row) => row.code)).toEqual([second.code, result.code]);
  });
});

describe("takedown rate limits", () => {
  it("the 31st submit in an hour is refused with rate_limited and a readable message; a new window resets", async () => {
    const b = newBackend(modules);
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    for (let i = 0; i < 30; i++) await b.t.mutation(api.takedown.submit, input);
    await expectLimited(b.t.mutation(api.takedown.submit, input));
    expect(await b.t.mutation(api.takedown.submit, { ...input, website: "bot" })).toMatchObject({
      hidden: false,
    });
    now.mockReturnValue(start + HOUR);
    await b.t.mutation(api.takedown.submit, input);
  });

  it("the 6th request about one place in a day is refused with rate_limited; a new window resets", async () => {
    const { b, args } = await setup();
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    for (let i = 0; i < 5; i++) await b.t.mutation(api.takedown.submit, args);
    await expectLimited(b.t.mutation(api.takedown.submit, args));
    now.mockReturnValue(start + HOUR);
    await expectLimited(b.t.mutation(api.takedown.submit, args));
    expect(await b.t.mutation(api.takedown.submit, input)).toMatchObject({ matchedPlace: false });
    now.mockReturnValue(start + DAY + 1000);
    await b.t.mutation(api.takedown.submit, args);
  });

  it("the 6th appeal on one code in a day is refused with rate_limited; a new window resets", async () => {
    const { b, args } = await setup();
    const result = await b.t.mutation(api.takedown.submit, args);
    const request = await requestByCode(b, result.code);
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    const decide = () =>
      b
        .as("steward")
        .mutation(api.takedown.decide, { requestId: request._id, status: "decided", outcome });
    for (let i = 0; i < 5; i++) {
      await decide();
      await b.t.mutation(api.takedown.appeal, { code: result.code, note });
    }
    await decide();
    await expectLimited(b.t.mutation(api.takedown.appeal, { code: result.code, note }));
    now.mockReturnValue(start + DAY + 1000);
    await b.t.mutation(api.takedown.appeal, { code: result.code, note });
  });
});
