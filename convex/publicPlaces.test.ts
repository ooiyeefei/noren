/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import nagasaki from "../regions/nagasaki.json";
import {
  addClaim,
  addCorrectedTranscript,
  addDisputePair,
  addInterview,
  addOwner,
  addPage,
  addPerson,
  addPlace,
  addSource,
  errorCode,
  newBackend,
  ruleOf,
} from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { isPubliclyReadablePlace } from "./lib/access";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const input = {
  regionId: "nagasaki",
  kind: "business" as const,
  names: [{ lang: "en", script: "latin" as const, value: "Fictional test fixture" }],
  pin: { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng },
};

async function setup() {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator");
  await addPerson(b, "other", "creator");
  await addPerson(b, "user", "user");
  const owner = await addPerson(b, "owner", "business_owner");
  const demoted = await addPerson(b, "demoted", "business_owner");
  const steward = await addPerson(b, "steward", "steward");
  return { b, creator, owner, demoted, steward };
}

function completeLaunchPack() {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
}

afterEach(() => vi.restoreAllMocks());

const states: {
  label: string;
  visibility: Doc<"place">["visibility"];
  isMock: boolean;
  demoPublicBasis?: "fictional";
  public: boolean;
}[] = [
  { label: "draft", visibility: "draft", isMock: false, public: false },
  { label: "public real", visibility: "public", isMock: false, public: true },
  {
    label: "demo_public mock",
    visibility: "demo_public",
    isMock: true,
    demoPublicBasis: "fictional",
    public: true,
  },
  { label: "invalid public mock", visibility: "public", isMock: true, public: false },
  {
    label: "invalid demo_public without basis",
    visibility: "demo_public",
    isMock: true,
    public: false,
  },
];

describe.each(states)("viewer matrix: $label", (state) => {
  it.each(["anonymous", "user", "creator", "other", "owner", "demoted", "steward"])(
    "%s: get, getBySlug, map, published page and sources agree",
    async (viewer) => {
      const { b, creator, owner, demoted, steward } = await setup();
      const placeId = await addPlace(b, { createdBy: creator, isMock: state.isMock });
      await addOwner(b, placeId, owner, steward);
      await addOwner(b, placeId, demoted, steward);
      await b.run((ctx) => ctx.db.patch("person", demoted, { role: "user" }));
      const claimId = await addClaim(b, {
        placeId,
        status: "published",
        isMock: state.isMock,
        reviewerId: owner,
      });
      const sourceId = await addSource(b, { placeId, addedBy: creator, demoConsentBy: steward });
      await addPage(b, {
        placeId,
        sentences: [{ lang: "ja", text: "Fictional fixture sentence", claimIds: [claimId] }],
      });
      // Raw writes exercise legacy/corrupt rows that bypass the invariant gate.
      await b.t.run((ctx) =>
        ctx.db.patch("place", placeId, {
          visibility: state.visibility,
          demoPublicBasis: state.demoPublicBasis,
        }),
      );
      const stored = await b.t.run((ctx) => ctx.db.get("place", placeId));
      expect(isPubliclyReadablePlace(stored!)).toBe(state.public);
      const caller = viewer === "anonymous" ? b.t : b.as(viewer);
      const allowed = state.public || ["creator", "owner", "steward"].includes(viewer);
      expect((await caller.query(api.places.get, { placeId }))?._id ?? null).toBe(
        allowed ? placeId : null,
      );
      expect(
        (await caller.query(api.places.getBySlug, { regionId: "nagasaki", slug: stored!.slug }))
          ?._id ?? null,
      ).toBe(allowed ? placeId : null);
      expect(
        (await caller.query(api.places.listForMap, { regionId: "nagasaki" })).map((p) => p._id),
      ).toEqual(allowed ? [placeId] : []);
      expect(
        (await caller.query(api.pages.getPublished, { placeId }))?.claims.map((c) => c._id) ?? null,
      ).toEqual(allowed ? [claimId] : null);
      expect((await caller.query(api.sources.listForPlace, { placeId })).map((s) => s._id)).toEqual(
        allowed ? [sourceId] : [],
      );
    },
  );
});

describe("real place publication", () => {
  it.each([undefined, false, true])(
    "a steward publishes a real place with no owner involved (agreementRecorded=%s)",
    async (agreementRecorded) => {
      const { b } = await setup();
      const { placeId, slug } = await b.as("creator").mutation(api.places.create, input);
      completeLaunchPack();
      await expect(
        b
          .as("steward")
          .mutation(api.places.setVisibility, { placeId, visibility: "public", agreementRecorded }),
      ).resolves.toBeNull();
      expect(await b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug })).toMatchObject({
        _id: placeId,
        visibility: "public",
        isMock: false,
        hasOwner: false,
      });
      await b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "public" });
      const audits = await b.run((ctx) => ctx.db.query("auditLog").take(10));
      expect(audits.filter((entry) => entry.action === "place.set_visibility")).toMatchObject([
        { targetId: placeId, diff: { visibility: { from: "draft", to: "public" } } },
      ]);
    },
  );

  it.each([false, true])(
    "publishing needs a confirmed name (unconfirmed name exists=%s)",
    async (withUnconfirmedName) => {
      const { b, creator } = await setup();
      const placeId = await addPlace(b, { createdBy: creator, withNames: false, withPin: false });
      if (withUnconfirmedName)
        await b.run((ctx) =>
          ctx.db.insert("placeName", {
            placeId,
            lang: "en",
            script: "latin",
            value: "Unconfirmed fixture",
            isPrimary: true,
          }),
        );
      await expect(
        b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "public" }),
      ).rejects.toMatchObject({
        data: { code: "conflict", message: expect.stringContaining("confirmed name") },
      });
    },
  );

  it("publishing needs a pin before checking the incomplete launch pack", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, withPin: false });
    await expect(
      b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "public" }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: "a pin is required before a place goes public" },
    });
  });

  it("publishing is refused while the launch pack is incomplete and the message names the launch pack, not an owner", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, { createdBy: creator });
    expect(region.regionPolicy("nagasaki").realBusinessesDraftOnly).toBe(true);
    const work = b.as("steward").mutation(api.places.setVisibility, {
      placeId,
      visibility: "public",
      agreementRecorded: true,
    });
    await expect(work).rejects.toMatchObject({
      data: {
        code: "conflict",
        message: expect.stringMatching(/launch pack.*operator.*takedown contact/),
      },
    });
    await expect(work).rejects.toMatchObject({
      data: { message: expect.not.stringMatching(/owner/i) },
    });
    expect(await b.t.query(api.places.get, { placeId })).toBeNull();
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual([]);
  });

  it("a mock place cannot be public (rule), only demo_public with confirmFictional", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, {
      createdBy: creator,
      isMock: true,
      withNames: false,
      withPin: false,
    });
    await expect(
      b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "public" }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: expect.stringContaining("mock place") },
    });
    expect(
      await ruleOf(b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "public" }))),
    ).toBe("place_public_real_only");
    await b.as("steward").mutation(api.places.updateNames, { placeId, names: input.names });
    expect(
      await errorCode(
        b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "demo_public" }),
      ),
    ).toBe("conflict");
    await b.as("steward").mutation(api.places.setVisibility, {
      placeId,
      visibility: "demo_public",
      confirmFictional: true,
    });
    expect(await b.t.query(api.places.get, { placeId })).toMatchObject({
      visibility: "demo_public",
      demoPublicBasis: "fictional",
    });
  });

  it("the public rule forbids a demo basis on insert and on unrelated patches", async () => {
    const { b, creator } = await setup();
    const fields = {
      regionId: "nagasaki",
      slug: "invalid-fixture",
      visibility: "public" as const,
      isMock: false,
      demoPublicBasis: "fictional" as const,
      createdBy: creator,
    };
    expect(await ruleOf(b.run((ctx) => ctx.db.insert("place", fields)))).toBe(
      "place_public_real_only",
    );
    const placeId = await b.t.run((ctx) => ctx.db.insert("place", fields));
    expect(await ruleOf(b.run((ctx) => ctx.db.patch("place", placeId, { kind: "business" })))).toBe(
      "place_public_real_only",
    );
    await b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "draft" });
    expect((await b.run((ctx) => ctx.db.get("place", placeId)))?.demoPublicBasis).toBeUndefined();
  });

  it.each(["creator", "owner", "other", "user", "anonymous"])(
    "%s cannot publish",
    async (viewer) => {
      const { b, creator, owner, steward } = await setup();
      const placeId = await addPlace(b, { createdBy: creator });
      await addOwner(b, placeId, owner, steward);
      completeLaunchPack();
      const caller = viewer === "anonymous" ? b.t : b.as(viewer);
      expect(
        await errorCode(
          caller.mutation(api.places.setVisibility, { placeId, visibility: "public" }),
        ),
      ).toBe(viewer === "anonymous" ? "unauthenticated" : "forbidden");
    },
  );

  it("a missing place is refused before public workflow checks", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, { createdBy: creator });
    await b.run((ctx) => ctx.db.delete("place", placeId));
    expect(
      await errorCode(
        b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "public" }),
      ),
    ).toBe("not_found");
  });

  it("going back to draft hides it from anonymous callers", async () => {
    const { b, creator, steward } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, visibility: "public" });
    const claimId = await addClaim(b, { placeId, status: "published" });
    await addSource(b, { placeId, addedBy: creator, demoConsentBy: steward });
    await addPage(b, {
      placeId,
      sentences: [{ lang: "ja", text: "Fixture sentence", claimIds: [claimId] }],
    });
    expect(await b.t.query(api.pages.getPublished, { placeId })).not.toBeNull();
    await b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "draft" });
    const stored = await b.run((ctx) => ctx.db.get("place", placeId));
    expect(await b.t.query(api.places.get, { placeId })).toBeNull();
    expect(
      await b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug: stored!.slug }),
    ).toBeNull();
    expect(await b.t.query(api.places.listForMap, { regionId: "nagasaki" })).toEqual([]);
    expect(await b.t.query(api.pages.getPublished, { placeId })).toBeNull();
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
  });
});

describe("public real-place content", () => {
  it("an owner-confirmed published claim shows on a public place to an anonymous caller and a proposed one does not", async () => {
    const { b, creator, owner, steward } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, visibility: "public" });
    await addOwner(b, placeId, owner, steward);
    const interviewId = await addInterview(b, {
      placeId,
      interviewerId: creator,
      ownerPersonId: owner,
    });
    const { transcriptId } = await addCorrectedTranscript(b, { interviewId, createdBy: creator });
    const published = await addClaim(b, { placeId, origin: "interview", transcriptId });
    await b.as("owner").mutation(api.claims.review, { claimId: published, action: "confirm" });
    await b.as("steward").mutation(api.pages.compose, { placeId });
    const proposed = await addClaim(b, { placeId, origin: "interview", transcriptId });
    const unpublished = await addClaim(b, {
      placeId,
      origin: "interview",
      transcriptId,
      status: "owner_confirmed",
      reviewerId: owner,
    });
    const hidden = await addClaim(b, {
      placeId,
      origin: "interview",
      transcriptId,
      status: "hidden",
    });
    const mock = await addClaim(b, { placeId, status: "published", isMock: true });
    const { first, second } = await addDisputePair(b, { placeId }, { placeId });
    const { first: uncited } = await addDisputePair(b, { placeId }, { placeId });
    // Compose cannot create these invalid citations; a legacy version must still be safe to read.
    const pageVersionId = await b.t.run((ctx) =>
      ctx.db.insert("pageVersion", {
        placeId,
        version: 2,
        status: "published",
        generatedBy: "fixture",
      }),
    );
    await b.t.run(async (ctx) => {
      for (const [ordinal, id] of [
        published,
        proposed,
        unpublished,
        hidden,
        mock,
        first,
        second,
      ].entries()) {
        await ctx.db.insert("pageSentence", {
          pageVersionId,
          lang: "ja",
          ordinal,
          text: "Fixture sentence",
          claimIds: [id],
          held: false,
        });
      }
    });
    const page = await b.t.query(api.pages.getPublished, { placeId });
    expect(page?.claims.map((c) => c._id).sort()).toEqual([published, first, second].sort());
    expect(page?.claims.some((c) => c._id === uncited)).toBe(false);
    expect(page?.sentences).toHaveLength(3);
    await b.as("owner").mutation(api.interviews.withdraw, { interviewId });
    const after = await b.t.query(api.pages.getPublished, { placeId });
    expect(after?.claims.map((c) => c._id).sort()).toEqual([first, second].sort());
    expect(after?.sentences).toHaveLength(2);
  });

  it("a hidden claim's sentences are gone for anonymous callers after the cascade", async () => {
    const { b, creator, owner, steward } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, visibility: "public" });
    await addOwner(b, placeId, owner, steward);
    const interviewId = await addInterview(b, {
      placeId,
      interviewerId: creator,
      ownerPersonId: owner,
    });
    const { transcriptId } = await addCorrectedTranscript(b, { interviewId, createdBy: creator });
    const claimId = await addClaim(b, {
      placeId,
      origin: "interview",
      transcriptId,
      status: "owner_confirmed",
      reviewerId: owner,
    });
    const { pageVersionId } = await b.as("steward").mutation(api.pages.compose, { placeId });
    expect((await b.t.query(api.pages.getPublished, { placeId }))?.sentences).toHaveLength(2);
    await b.as("owner").mutation(api.claims.review, { claimId, action: "remove" });
    expect((await b.run((ctx) => ctx.db.get("claim", claimId)))?.status).toBe("hidden");
    const sentences = await b.run((ctx) =>
      ctx.db
        .query("pageSentence")
        .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) =>
          q.eq("pageVersionId", pageVersionId),
        )
        .take(10),
    );
    expect(sentences.every((s) => s.held)).toBe(true);
    expect(await b.t.query(api.pages.getPublished, { placeId })).toMatchObject({
      sentences: [],
      claims: [],
    });
  });

  it("public real places still show only live sources with recorded author agreement", async () => {
    const { b, creator, steward } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, visibility: "public" });
    await addSource(b, { placeId, addedBy: creator });
    const consented = await addSource(b, { placeId, addedBy: creator, demoConsentBy: steward });
    await addSource(b, { placeId, addedBy: creator, demoConsentBy: steward, status: "gone" });
    await addSource(b, { placeId, addedBy: creator, demoConsentBy: steward, status: "hidden" });
    expect((await b.t.query(api.sources.listForPlace, { placeId })).map((s) => s._id)).toEqual([
      consented,
    ]);
    await b.as("steward").mutation(api.sources.revokeDemoConsent, { sourceId: consented });
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toEqual([]);
  });
});

describe("categories and open-data credit", () => {
  it("unknown category is refused and the error names the allowed keys", async () => {
    const { b } = await setup();
    await expect(
      b.as("creator").mutation(api.places.create, { ...input, category: "unknown" }),
    ).rejects.toMatchObject({
      data: {
        code: "invalid_input",
        message: expect.stringContaining(nagasaki.categories.map((c) => c.key).join(", ")),
      },
    });
    const { placeId } = await b.as("creator").mutation(api.places.create, input);
    expect(
      await errorCode(
        b.as("creator").mutation(api.places.setCategory, { placeId, category: "unknown" }),
      ),
    ).toBe("invalid_input");
    const config = region.regionConfig("nagasaki");
    vi.spyOn(region, "regionConfig").mockReturnValue({ ...config, categories: undefined });
    await expect(
      b.as("creator").mutation(api.places.setCategory, { placeId, category: "cafe" }),
    ).rejects.toMatchObject({
      data: { code: "invalid_input", message: expect.stringContaining("allowed keys: none") },
    });
  });

  it("category round-trips through create, setCategory, listForMap and the category filter", async () => {
    const { b } = await setup();
    const { placeId, slug } = await b
      .as("creator")
      .mutation(api.places.create, { ...input, category: "cafe" });
    completeLaunchPack();
    await b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "public" });
    expect(await b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug })).toMatchObject({
      category: "cafe",
      isMock: false,
    });
    await expect(
      b.as("creator").mutation(api.places.setCategory, { placeId, category: "bar" }),
    ).resolves.toBeNull();
    await b.as("steward").mutation(api.places.setCategory, { placeId, category: "bar" });
    expect(
      await b.t.query(api.places.listForMap, { regionId: "nagasaki", category: "cafe" }),
    ).toEqual([]);
    expect(
      await b.t.query(api.places.listForMap, { regionId: "nagasaki", category: "bar" }),
    ).toMatchObject([{ _id: placeId, category: "bar", isMock: false }]);
    expect(
      await b.t.query(api.places.listForMap, { regionId: "nagasaki", category: "unknown" }),
    ).toEqual([]);
    expect(
      await b.as("creator").query(api.places.listMine, { regionId: "nagasaki" }),
    ).toMatchObject([{ category: "bar" }]);
    expect(await b.as("steward").query(api.places.listAll, { regionId: "nagasaki" })).toMatchObject(
      [{ category: "bar" }],
    );
    expect((await b.t.query(api.places.get, { placeId }))?.category).toBe("bar");
    for (const args of [{}, { clear: false }, { category: "cafe", clear: true }])
      expect(
        await errorCode(b.as("creator").mutation(api.places.setCategory, { placeId, ...args })),
      ).toBe("invalid_input");
    await b.as("steward").mutation(api.places.setCategory, { placeId, clear: true });
    expect(
      (await b.t.query(api.places.listForMap, { regionId: "nagasaki" }))[0]?.category,
    ).toBeUndefined();
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(20));
    expect(audits.filter((entry) => entry.action === "place.set_category")).toMatchObject([
      { targetId: placeId, diff: { category: { from: "cafe", to: "bar" } } },
      { targetId: placeId, diff: { category: { from: "bar", to: null } } },
    ]);
  });

  it.each(["anonymous", "user", "other", "owner"])(
    "setCategory refuses %s who cannot edit the place",
    async (viewer) => {
      const { b, creator, owner, steward } = await setup();
      const placeId = await addPlace(b, { createdBy: creator, visibility: "public" });
      await addOwner(b, placeId, owner, steward);
      expect(
        await errorCode(
          (viewer === "anonymous" ? b.t : b.as(viewer)).mutation(api.places.setCategory, {
            placeId,
            category: "cafe",
          }),
        ),
      ).toBe(viewer === "anonymous" ? "unauthenticated" : "forbidden");
    },
  );

  it("dataSources lists the OSM reference with attribution and caps references at five", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, visibility: "public" });
    await b.run(async (ctx) => {
      for (let i = 0; i < 7; i++)
        await ctx.db.insert("placeExternalRef", {
          placeId,
          provider: "osm",
          ref: `node/${i}`,
          licence: "ODbL-1.0",
          attribution: "© OpenStreetMap contributors",
          retrievedAt: 1,
        });
    });
    const place = await b.t.query(api.places.get, { placeId });
    expect(place?.dataSources).toHaveLength(5);
    expect(place?.dataSources[0]).toEqual({
      provider: "osm",
      ref: "node/0",
      licence: "ODbL-1.0",
      attribution: "© OpenStreetMap contributors",
    });
    expect(place?.dataSources[0]).not.toHaveProperty("retrievedAt");
  });
});

it("listForMap makes a bounded number of reads (does not scan)", async () => {
  const b = newBackend(modules, { transactionLimits: { documentsRead: 20, databaseQueries: 20 } });
  const creator = await addPerson(b, "creator", "creator");
  const real = await addPlace(b, { createdBy: creator, visibility: "public" });
  const mock = await addPlace(b, { createdBy: creator, visibility: "demo_public" });
  await b.t.run(async (ctx) => {
    for (let i = 0; i < 600; i++)
      await ctx.db.insert("place", {
        regionId: i % 2 ? "elsewhere" : "nagasaki",
        slug: `fixture-${i}`,
        visibility: i % 2 ? "public" : "draft",
        createdBy: creator,
        isMock: false,
      });
  });
  expect(
    (await b.t.query(api.places.listForMap, { regionId: "nagasaki" })).map((p) => p._id).sort(),
  ).toEqual([real, mock].sort());
});

it("listForMap caps the public visibility and the combined result at 200", async () => {
  // A read budget, far under Convex's real 4,096 ranges: three index ranges per place (names, pin and
  // whether a published page exists for the yellow "story" tab) plus a few for the visibility queries.
  const b = newBackend(modules, {
    transactionLimits: { documentsRead: 210, databaseQueries: 610 },
  });
  const creator = await addPerson(b, "creator", "creator");
  await b.t.run(async (ctx) => {
    for (let i = 0; i < 201; i++)
      await ctx.db.insert("place", {
        regionId: "nagasaki",
        slug: `fixture-${i}`,
        visibility: "public",
        createdBy: creator,
        isMock: false,
      });
  });
  expect(await b.t.query(api.places.listForMap, { regionId: "nagasaki" })).toHaveLength(200);
});
