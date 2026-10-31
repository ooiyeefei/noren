/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { runDemo } from "../scripts/seed-demo";
import { parseDemoData } from "../scripts/lib/demo-plan";
import { ROLES } from "../src/lib/domain/constants";
import nagasaki from "../regions/nagasaki.json";
import { addInterview, addOwner, addPerson, addPlace, newBackend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const args = { clerkUserId: "mock-creator", role: "creator" as const, regionId: "nagasaki" };
describe("seed", () => {
  it("markMockPerson sets the role, the mock flag and the region's label and writes one system audit entry", async () => {
    const b = newBackend(modules);
    const personId = await addPerson(b, args.clerkUserId, "user");
    await b.t.mutation(internal.seed.markMockPerson, args);
    expect(await b.t.run((ctx) => ctx.db.get("person", personId))).toMatchObject({
      role: "creator",
      isMock: true,
      displayName: nagasaki.demo.mockAccountLabels.creator,
    });
    const entries = await b.t.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorKind: "system",
      action: "person.mark_mock",
      targetId: personId,
      diff: { role: { from: "user", to: "creator" }, isMock: { from: false, to: true } },
    });
    expect(await b.t.query(internal.seed.personIdFor, { clerkUserId: args.clerkUserId })).toEqual({
      personId,
      role: "creator",
      isMock: true,
    });
  });
  it("it is idempotent", async () => {
    const b = newBackend(modules);
    await addPerson(b, args.clerkUserId, "user");
    await b.t.mutation(internal.seed.markMockPerson, { ...args, role: "steward" });
    await b.t.mutation(internal.seed.markMockPerson, { ...args, role: "steward" });
    expect(await b.t.run((ctx) => ctx.db.query("auditLog").take(10))).toHaveLength(1);
  });
  it("an unknown Clerk id is not_found", async () => {
    const b = newBackend(modules);
    await expect(b.t.mutation(internal.seed.markMockPerson, args)).rejects.toThrow(/not_found/);
  });
  it.each(["place", "interview", "ownership"])(
    "a real person who has already created a %s is refused",
    async (kind) => {
      const b = newBackend(modules);
      const personId = await addPerson(b, args.clerkUserId, "creator");
      const steward = await addPerson(b, "steward", "steward");
      const placeId = await addPlace(b, { createdBy: kind === "place" ? personId : steward });
      if (kind === "interview") await addInterview(b, { interviewerId: personId, placeId });
      if (kind === "ownership") await addOwner(b, placeId, personId, steward);
      await expect(b.t.mutation(internal.seed.markMockPerson, args)).rejects.toThrow(/conflict/);
      expect(await b.t.run((ctx) => ctx.db.get("person", personId))).toMatchObject({
        isMock: false,
      });
      expect(await b.t.run((ctx) => ctx.db.query("auditLog").take(10))).toHaveLength(0);
    },
  );
  it("rows the mock creator inserts afterwards are mock", async () => {
    const b = newBackend(modules);
    await addPerson(b, args.clerkUserId, "user");
    await b.t.mutation(internal.seed.markMockPerson, args);
    const { placeId } = await b.as(args.clerkUserId).mutation(api.places.create, {
      regionId: "nagasaki",
      kind: "business",
      names: [{ lang: "en", script: "latin", value: "Mock Test Cafe", isPrimary: true }],
      pin: { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng },
    });
    expect(await b.t.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({ isMock: true });
    await b.t.mutation(internal.seed.markMockPerson, args);
  });
  it("personIdFor returns null for an unknown id", async () => {
    expect(
      await newBackend(modules).t.query(internal.seed.personIdFor, { clerkUserId: "unknown" }),
    ).toBeNull();
  });
});

it("the walkthrough runs through the public gates and produces a signed-out bilingual mock page", async () => {
  const b = newBackend(modules);
  const accounts = {
    user: "mock-user",
    creator: "mock-creator",
    business_owner: "mock-owner",
    steward: "mock-steward",
  };
  for (const role of ROLES) {
    await addPerson(b, accounts[role], "user");
    await b.t.mutation(internal.seed.markMockPerson, {
      clerkUserId: accounts[role],
      role,
      regionId: "nagasaki",
    });
  }
  const data = parseDemoData({
    regionId: "nagasaki",
    issuerNote: "test fixture",
    accounts,
    place: {
      names: [{ lang: "en", script: "latin", value: "Demo Cafe (mock)", isPrimary: true }],
      pin: { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng },
    },
    interview: {
      language: "ja",
      segments: [{ start: 0, end: 1, text: "架空の店です。模擬の物語です。" }],
    },
    claims: [
      {
        kind: "fact",
        quote: "架空の店です。",
        textOriginal: "架空の店です。",
        translations: { en: "This is a fictional shop." },
      },
      {
        kind: "story",
        quote: "模擬の物語です。",
        textOriginal: "模擬の物語です。",
        translations: { en: "This is a mock story." },
      },
    ],
    sources: [
      {
        url: "https://example.com/consented-mock",
        title: "Mock consented link",
        authorAgreed: true,
      },
      {
        url: "https://example.com/unconsented-mock",
        title: "Mock private link",
        authorAgreed: false,
      },
    ],
  });
  await runDemo(
    data,
    { issuer: "https://clerk.test.invalid", prod: false, dryRun: false },
    async (fn, args, options) => {
      const client = options?.identity ? b.t.withIdentity(options.identity) : b.t;
      const input = args as Record<string, Value>;
      if (["seed:personIdFor", "people:current", "places:listMine"].includes(fn))
        return await client.query(makeFunctionReference<"query">(fn), input);
      return await client.mutation(makeFunctionReference<"mutation">(fn), input);
    },
    () => {},
  );
  const places = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
  expect(places).toHaveLength(1);
  const placeId = places[0]!._id;
  expect(places[0]).toMatchObject({
    isMock: true,
    visibility: "demo_public",
    demoPublicBasis: "fictional",
  });
  const page = await b.t.query(api.pages.getPublished, { placeId });
  expect(page).not.toBeNull();
  expect(page?.claims).toHaveLength(2);
  expect(page?.claims.every((c) => c.isMock && c.status === "published")).toBe(true);
  expect(new Set(page?.sentences.map((s) => s.lang))).toEqual(new Set(["ja", "en"]));
  // A linked post is already public where it was posted; it shows without the author's agreement,
  // which the walkthrough still records for the one author who gave it (FR-033).
  expect(await b.t.query(api.sources.listForPlace, { placeId })).toHaveLength(2);
});
