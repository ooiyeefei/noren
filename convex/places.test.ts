/// <reference types="vite/client" />
import type { ApiFromModules } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nagasaki from "../regions/nagasaki.json";
import type { Script } from "../src/lib/domain/constants";
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
} from "../tests/convex/fixtures";
import { api as generatedApi } from "./_generated/api";
import * as region from "./lib/region";
import { slugBase, uniqueSlug } from "./lib/slug";

// Keep the new module typed while the orchestrator owns post-wave codegen.
const api = generatedApi as typeof generatedApi &
  ApiFromModules<{ places: typeof import("./places") }>;
const modules = import.meta.glob("./**/*.ts");
const pin = { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng };
const names = [
  { lang: "ja", script: "kanji" as const, value: "架空のテスト店" },
  { lang: "en", script: "latin" as const, value: "  Mock Ōura Test Shop  " },
];
const input = { regionId: "nagasaki", kind: "business" as const, names, pin };

async function setup(options: { isMock?: boolean } = {}) {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator", options);
  const other = await addPerson(b, "other", "creator");
  const steward = await addPerson(b, "steward", "steward");
  const owner = await addPerson(b, "owner", "business_owner");
  const user = await addPerson(b, "user", "user");
  const create = () => b.as("creator").mutation(api.places.create, input);
  const audits = (action: string) =>
    b.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(200)).filter((entry) => entry.action === action),
    );
  return { ...b, creator, other, steward, owner, user, create, audits };
}

afterEach(() => vi.restoreAllMocks());

describe("places.create", () => {
  it("a creator cannot create a landmark", async () => {
    const b = await setup();
    for (const caller of ["creator", "other"]) {
      await expect(
        b.as(caller).mutation(api.places.create, { ...input, kind: "landmark" }),
      ).rejects.toMatchObject({
        data: { code: "forbidden", message: expect.stringContaining("steward") },
      });
    }
    expect(await b.run((ctx) => ctx.db.query("place").take(10))).toEqual([]);
    expect(await b.audits("place.create")).toEqual([]);
  });

  it("a steward can create a landmark and set the kind later", async () => {
    const b = await setup();
    const created = await b
      .as("steward")
      .mutation(api.places.create, { ...input, kind: "landmark" });
    expect(await b.run((ctx) => ctx.db.get("place", created.placeId))).toMatchObject({
      kind: "landmark",
      visibility: "draft",
    });
    const { placeId } = await b.create();
    expect(
      await errorCode(b.as("creator").mutation(api.places.setKind, { placeId, kind: "landmark" })),
    ).toBe("forbidden");
    await b.as("steward").mutation(api.places.setKind, { placeId, kind: "landmark" });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({ kind: "landmark" });
    expect(await b.audits("place.set_kind")).toMatchObject([
      {
        actorPersonId: b.steward,
        targetId: placeId,
        diff: { kind: { from: "business", to: "landmark" } },
      },
    ]);
    await b.as("steward").mutation(api.places.setKind, { placeId, kind: "landmark" });
    expect(await b.audits("place.set_kind")).toHaveLength(1);
    await expect(
      b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "demo_public" }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: expect.stringContaining("may be demo_public") },
    });
    expect(await b.t.query(api.places.get, { placeId })).toBeNull();
    await b.as("steward").mutation(api.places.setKind, { placeId, kind: "business" });
    await b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "draft" });
    await b.as("steward").mutation(api.places.setKind, { placeId, kind: "business" });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({ kind: "business" });
    await b.run((ctx) => ctx.db.delete("place", placeId));
    expect(
      await errorCode(b.as("steward").mutation(api.places.setKind, { placeId, kind: "landmark" })),
    ).toBe("not_found");
  });
  it("a creator creates a draft with names, a pin and a slug from the latin name", async () => {
    const b = await setup();
    const { placeId, slug } = await b.create();
    expect(slug).toBe("mock-oura-test-shop");
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      regionId: "nagasaki",
      createdBy: b.creator,
      kind: "business",
      visibility: "draft",
      isMock: false,
    });
    const stored = await b.run((ctx) =>
      ctx.db
        .query("placeName")
        .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
        .take(20),
    );
    expect(stored).toHaveLength(2);
    expect(stored.every((name) => name.confirmedBy === b.creator)).toBe(true);
    expect(stored.find((name) => name.lang === "en")?.value).toBe("Mock Ōura Test Shop");
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("pin")
          .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
          .unique(),
      ),
    ).toMatchObject({
      ...pin,
      placedBy: b.creator,
      placedAt: expect.any(Number),
    });
  });

  it("a second place with the same name gets slug -2", async () => {
    const b = await setup();
    await b.create();
    expect((await b.create()).slug).toBe("mock-oura-test-shop-2");
  });

  it("a Japanese-only name gives slug place", async () => {
    const b = await setup();
    expect(
      (await b.as("creator").mutation(api.places.create, { ...input, names: [names[0]!] })).slug,
    ).toBe("place");
  });

  it("the first name per language becomes primary", async () => {
    const b = await setup();
    const extra = { lang: "ja", script: "kana" as const, value: "てすと" };
    const { placeId } = await b
      .as("creator")
      .mutation(api.places.create, { ...input, names: [...names, extra] });
    expect((await b.as("creator").query(api.places.get, { placeId }))?.names).toEqual([
      { ...names[1], value: names[1]!.value.trim(), isPrimary: true },
      { ...names[0], isPrimary: true },
      { ...extra, isPrimary: false },
    ]);
  });

  it("a user is forbidden and a signed-out caller unauthenticated", async () => {
    const b = await setup();
    expect(await errorCode(b.as("user").mutation(api.places.create, input))).toBe("forbidden");
    expect(await errorCode(b.t.mutation(api.places.create, input))).toBe("unauthenticated");
  });

  it("a pin outside the region is invalid_input", async () => {
    const b = await setup();
    for (const invalid of [
      { lat: 0, lng: 0 },
      { ...pin, lat: NaN },
      { ...pin, lng: Infinity },
    ]) {
      expect(
        await errorCode(b.as("creator").mutation(api.places.create, { ...input, pin: invalid })),
      ).toBe("invalid_input");
    }
  });

  it("a language the region does not serve is invalid_input", async () => {
    const b = await setup();
    expect(
      await errorCode(
        b.as("creator").mutation(api.places.create, {
          ...input,
          names: [{ ...names[1]!, lang: "fr" }],
        }),
      ),
    ).toBe("invalid_input");
  });

  it("a blank or duplicate name is invalid_input", async () => {
    const b = await setup();
    for (const invalid of [
      [{ ...names[0]!, value: "  " }],
      [names[1]!, { ...names[1]!, value: names[1]!.value.trim() }],
    ]) {
      expect(
        await errorCode(b.as("creator").mutation(api.places.create, { ...input, names: invalid })),
      ).toBe("invalid_input");
    }
  });

  it("rejects too few or too many names, long values and multiple primaries", async () => {
    const b = await setup();
    for (const invalid of [
      [],
      Array.from({ length: 13 }, (_, i) => ({ ...names[1]!, value: `Mock ${i}` })),
      [{ ...names[1]!, value: "x".repeat(121) }],
      [
        { ...names[1]!, isPrimary: true },
        { ...names[1]!, value: "Another mock name", isPrimary: true },
      ],
    ]) {
      expect(
        await errorCode(b.as("creator").mutation(api.places.create, { ...input, names: invalid })),
      ).toBe("invalid_input");
    }
  });

  it("validates the region and accepts its bbox boundary", async () => {
    const b = await setup();
    expect(
      await errorCode(
        b.as("creator").mutation(api.places.create, { ...input, regionId: "missing" }),
      ),
    ).toBe("invalid_input");
    const [west, south] = nagasaki.bbox;
    await expect(
      b.as("creator").mutation(api.places.create, { ...input, pin: { lat: south!, lng: west! } }),
    ).resolves.toHaveProperty("placeId");
  });

  it("a mock creator's place is mock", async () => {
    const b = await setup({ isMock: true });
    const { placeId } = await b.create();
    expect((await b.run((ctx) => ctx.db.get("place", placeId)))?.isMock).toBe(true);
  });

  it("an audit entry is written", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    expect(await b.audits("place.create")).toMatchObject([
      {
        actorKind: "person",
        actorPersonId: b.creator,
        targetType: "place",
        targetId: placeId,
      },
    ]);
  });
});

describe("places reads", () => {
  it("a demoted owner loses every owner power: interview transcript, unconsented sources, draft page, listOwned", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    await addOwner(b, placeId, b.owner, b.steward);
    const interviewId = await addInterview(b, { placeId, interviewerId: b.creator });
    const { transcriptId } = await addCorrectedTranscript(b, { interviewId, createdBy: b.creator });
    const claimId = await addClaim(b, {
      placeId,
      origin: "interview",
      transcriptId,
      status: "published",
    });
    await addPage(b, {
      placeId,
      sentences: [{ lang: "ja", text: "架空のテスト文。", claimIds: [claimId] }],
    });
    const sourceId = await addSource(b, { placeId, addedBy: b.creator });
    const caller = b.as("owner");
    expect((await caller.query(api.interviews.get, { interviewId })).latestTranscript?._id).toBe(
      transcriptId,
    );
    expect(
      (await caller.query(api.sources.listForPlace, { placeId })).map((source) => source._id),
    ).toEqual([sourceId]);
    expect(await caller.query(api.pages.getPublished, { placeId })).not.toBeNull();
    expect((await caller.query(api.places.listOwned, {})).map((place) => place._id)).toEqual([
      placeId,
    ]);
    await b.run((ctx) => ctx.db.patch("person", b.owner, { role: "user" }));
    expect(await errorCode(caller.query(api.interviews.get, { interviewId }))).toBe("not_found");
    expect(await caller.query(api.sources.listForPlace, { placeId })).toEqual([]);
    expect(await caller.query(api.pages.getPublished, { placeId })).toBeNull();
    expect(await caller.query(api.places.get, { placeId })).toBeNull();
    expect(await caller.query(api.places.listOwned, {})).toEqual([]);
    expect(await caller.query(api.places.listForMap, { regionId: "nagasaki" })).toEqual([]);
    // A readable place still must not grant the demoted person manager access.
    await b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "pilot" }));
    expect(await errorCode(caller.query(api.interviews.get, { interviewId }))).toBe("forbidden");
    expect(await caller.query(api.sources.listForPlace, { placeId })).toEqual([]);
    expect(await caller.query(api.places.get, { placeId })).toMatchObject({
      canManage: false,
      isOwner: false,
    });
    expect(await caller.query(api.places.listOwned, {})).toEqual([]);
    expect(await errorCode(caller.mutation(api.interviews.withdraw, { interviewId }))).toBe(
      "forbidden",
    );
  });

  it("an owner without a placeOwner row for that place is refused", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const otherPlace = await addPlace(b, { createdBy: b.other });
    await addOwner(b, otherPlace, b.owner, b.steward);
    const interviewId = await addInterview(b, {
      placeId,
      interviewerId: b.creator,
      ownerPersonId: b.owner,
    });
    expect(await b.as("owner").query(api.places.get, { placeId })).toBeNull();
    expect(await errorCode(b.as("owner").query(api.interviews.get, { interviewId }))).toBe(
      "not_found",
    );
    await b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "pilot" }));
    expect(await errorCode(b.as("owner").query(api.interviews.get, { interviewId }))).toBe(
      "forbidden",
    );
    expect(await b.as("owner").query(api.places.get, { placeId })).toMatchObject({
      isOwner: false,
      canManage: false,
    });
    expect((await b.as("owner").query(api.places.listOwned, {})).map((place) => place._id)).toEqual(
      [otherPlace],
    );
  });
  it("getBySlug returns a draft to its creator, a steward and its owner, and null to another creator, a user and a signed-out visitor", async () => {
    const b = await setup();
    const { placeId, slug } = await b.create();
    await addOwner(b, placeId, b.owner, b.steward);
    for (const who of ["creator", "steward", "owner"]) {
      expect(
        await b.as(who).query(api.places.getBySlug, { regionId: "nagasaki", slug }),
      ).toMatchObject({ _id: placeId, hasOwner: true });
      expect(await b.as(who).query(api.places.get, { placeId })).toMatchObject({
        _id: placeId,
        isOwner: who === "owner",
        canEdit: who !== "owner",
        canManage: true,
      });
    }
    for (const caller of [b.as("other"), b.as("user"), b.t]) {
      expect(await caller.query(api.places.getBySlug, { regionId: "nagasaki", slug })).toBeNull();
      expect(await caller.query(api.places.get, { placeId })).toBeNull();
    }
  });

  it("a demo_public place is returned to a signed-out visitor with canEdit false", async () => {
    const b = await setup();
    const placeId = await addPlace(b, {
      createdBy: b.creator,
      kind: "landmark",
      visibility: "demo_public",
    });
    expect(await b.t.query(api.places.get, { placeId })).toMatchObject({
      _id: placeId,
      canEdit: false,
      canManage: false,
      hasOwner: false,
      isOwner: false,
    });
  });

  it("returns null for missing places and hides pilot places from visitors", async () => {
    const b = await setup();
    expect(
      await b.t.query(api.places.getBySlug, { regionId: "nagasaki", slug: "missing" }),
    ).toBeNull();
    const placeId = await addPlace(b, {
      createdBy: b.creator,
      visibility: "pilot",
      withNames: false,
      withPin: false,
    });
    expect(await b.t.query(api.places.get, { placeId })).toBeNull();
    expect(await b.as("user").query(api.places.get, { placeId })).toMatchObject({
      names: [],
      pin: null,
    });
    await b.run((ctx) => ctx.db.delete("place", placeId));
    expect(await b.as("creator").query(api.places.get, { placeId })).toBeNull();
  });

  it("listForMap never contains another creator's draft", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const hidden = await addPlace(b, { createdBy: b.other });
    const visible = await addPlace(b, {
      createdBy: b.other,
      visibility: "demo_public",
      kind: "landmark",
    });
    const found = await b.as("creator").query(api.places.listForMap, { regionId: "nagasaki" });
    expect(found.map((place) => place._id).sort()).toEqual([placeId, visible].sort());
    expect(found.some((place) => place._id === hidden)).toBe(false);
    expect(
      (await b.t.query(api.places.listForMap, { regionId: "nagasaki" })).map((place) => place._id),
    ).toEqual([visible]);
  });

  it("listMine, listOwned and listAll return their sets", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const otherId = await addPlace(b, { createdBy: b.other, visibility: "pilot" });
    const stewardId = await addPlace(b, {
      createdBy: b.steward,
      kind: "landmark",
      visibility: "demo_public",
    });
    await addPlace(b, { createdBy: b.creator, regionId: "another-region" });
    await addOwner(b, placeId, b.owner, b.steward);
    expect(
      (await b.as("creator").query(api.places.listMine, { regionId: "nagasaki" })).map(
        (place) => place._id,
      ),
    ).toEqual([placeId]);
    expect(
      (await b.as("steward").query(api.places.listMine, { regionId: "nagasaki" })).map(
        (place) => place._id,
      ),
    ).toEqual([stewardId]);
    expect((await b.as("owner").query(api.places.listOwned, {})).map((place) => place._id)).toEqual(
      [placeId],
    );
    expect(await b.as("user").query(api.places.listOwned, {})).toEqual([]);
    const all = await b.as("steward").query(api.places.listAll, { regionId: "nagasaki" });
    expect(all.map((place) => place._id).sort()).toEqual([placeId, otherId, stewardId].sort());
    expect(all.find((place) => place._id === placeId)?.ownerCount).toBe(1);
    expect(all.find((place) => place._id === otherId)?.ownerCount).toBe(0);
  });

  it("listAll is forbidden to a creator", async () => {
    const b = await setup();
    expect(
      await errorCode(b.as("creator").query(api.places.listAll, { regionId: "nagasaki" })),
    ).toBe("forbidden");
  });

  it("listForMap caps the total across visibilities at 4000", async () => {
    const b = await setup();
    // Straight to the table: 4,001 rows through every rule would outlast the test timeout.
    await b.t.run(async (ctx) => {
      for (let i = 0; i < 4001; i++)
        await ctx.db.insert("place", {
          regionId: "nagasaki",
          slug: `mock-${i}`,
          visibility: i < 2500 ? "demo_public" : "pilot",
          demoPublicBasis: i < 2500 ? "fictional" : undefined,
          kind: "landmark",
          createdBy: b.creator,
          isMock: true,
          mapNames: [],
          mapPin: null,
          hasPublishedPage: false,
        });
    });
    expect(
      await b.as("steward").query(api.places.listForMap, { regionId: "nagasaki" }),
    ).toHaveLength(4000);
  });
});

describe("places edits", () => {
  it("the creator renames the place and one primary per language remains", async () => {
    const b = await setup();
    const { placeId, slug } = await b.create();
    const replacement = [
      { lang: "ja", script: "kanji" as const, value: "架空" },
      { lang: "ja", script: "kana" as const, value: "かくう", isPrimary: true },
      { lang: "en", script: "latin" as const, value: "Renamed Mock" },
    ];
    await b.as("creator").mutation(api.places.updateNames, { placeId, names: replacement });
    const place = await b.as("creator").query(api.places.get, { placeId });
    expect(place?.slug).toBe(slug);
    expect(place?.names).toHaveLength(3);
    expect(place?.names.filter((name) => name.isPrimary)).toEqual([
      { ...replacement[2], isPrimary: true },
      { ...replacement[1] },
    ]);
    expect(place?.names.some((name) => name.value === "Mock Ōura Test Shop")).toBe(false);
    await expect(
      b.as("creator").mutation(api.places.updateNames, { placeId, names: replacement }),
    ).resolves.toBeNull();
  });

  it("another creator gets not_found", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    expect(
      await errorCode(b.as("other").mutation(api.places.updateNames, { placeId, names })),
    ).toBe("not_found");
    expect(await errorCode(b.as("other").mutation(api.places.movePin, { placeId, ...pin }))).toBe(
      "not_found",
    );
  });

  it("the owner is forbidden", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    await addOwner(b, placeId, b.owner, b.steward);
    expect(
      await errorCode(b.as("owner").mutation(api.places.updateNames, { placeId, names })),
    ).toBe("forbidden");
    expect(await errorCode(b.as("owner").mutation(api.places.movePin, { placeId, ...pin }))).toBe(
      "forbidden",
    );
  });

  it("movePin moves the pin and refuses a point outside the region", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const moved = { lat: pin.lat + 0.01, lng: pin.lng + 0.01 };
    await b.as("steward").mutation(api.places.movePin, { placeId, ...moved });
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("pin")
          .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
          .unique(),
      ),
    ).toMatchObject({ ...moved, placedBy: b.steward });
    expect(
      await errorCode(b.as("creator").mutation(api.places.movePin, { placeId, lat: 0, lng: 0 })),
    ).toBe("invalid_input");
    expect((await b.as("creator").query(api.places.get, { placeId }))?.pin).toEqual(moved);
  });

  it("movePin inserts a missing pin", async () => {
    const b = await setup();
    const placeId = await addPlace(b, { createdBy: b.creator, withPin: false });
    await b.as("creator").mutation(api.places.movePin, { placeId, ...pin });
    expect((await b.as("creator").query(api.places.get, { placeId }))?.pin).toEqual(pin);
  });

  it("invalid replacement names leave the original names intact", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const before = await b.as("creator").query(api.places.get, { placeId });
    expect(
      await errorCode(b.as("creator").mutation(api.places.updateNames, { placeId, names: [] })),
    ).toBe("invalid_input");
    expect(await b.as("creator").query(api.places.get, { placeId })).toEqual(before);
  });
});

describe("places visibility", () => {
  it("a real business marked landmark by its creator never becomes demo_public", async () => {
    const b = await setup();
    expect(
      await errorCode(b.as("creator").mutation(api.places.create, { ...input, kind: "landmark" })),
    ).toBe("forbidden");
    const { placeId } = await b.create();
    expect(
      await errorCode(b.as("creator").mutation(api.places.setKind, { placeId, kind: "landmark" })),
    ).toBe("forbidden");
    expect(
      await errorCode(
        b.as("steward").mutation(api.places.setVisibility, {
          placeId,
          visibility: "demo_public",
          agreementRecorded: true,
          confirmFictional: true,
        }),
      ),
    ).toBe("conflict");
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      kind: "business",
      visibility: "draft",
      isMock: false,
    });
    expect(await b.t.query(api.places.get, { placeId })).toBeNull();
    expect(await b.audits("place.set_visibility")).toEqual([]);
  });

  it("a mock place becomes demo_public only with confirmFictional and the audit says so", async () => {
    const b = await setup({ isMock: true });
    const { placeId } = await b.create();
    for (const confirmFictional of [undefined, false]) {
      expect(
        await errorCode(
          b.as("steward").mutation(api.places.setVisibility, {
            placeId,
            visibility: "demo_public",
            confirmFictional,
          }),
        ),
      ).toBe("conflict");
    }
    expect(await b.audits("place.set_visibility")).toEqual([]);
    await b.as("steward").mutation(api.places.setVisibility, {
      placeId,
      visibility: "demo_public",
      confirmFictional: true,
    });
    expect(await b.t.query(api.places.get, { placeId })).toMatchObject({
      visibility: "demo_public",
      isMock: true,
    });
    expect(await b.audits("place.set_visibility")).toMatchObject([
      { actorPersonId: b.steward, targetId: placeId, diff: { demoPublicBasis: "fictional" } },
    ]);
  });

  it.each([false, true])(
    "a landmark label never makes a place public (mock=%s)",
    async (isMock) => {
      const b = await setup();
      const placeId = await addPlace(b, { createdBy: b.creator, kind: "landmark", isMock });
      await expect(
        b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "demo_public" }),
      ).rejects.toMatchObject({
        data: { code: "conflict", message: expect.stringContaining("may be demo_public") },
      });
      expect(await b.t.query(api.places.get, { placeId })).toBeNull();
      expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
        visibility: "draft",
        kind: "landmark",
        isMock,
      });
      expect(await b.audits("place.set_visibility")).toEqual([]);
    },
  );

  it("a real business cannot join the public demo", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    await expect(
      b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "demo_public" }),
    ).rejects.toMatchObject({
      data: {
        code: "conflict",
        message: expect.stringContaining("may be demo_public"),
      },
    });
  });

  it("a real business cannot go to pilot even with agreementRecorded while the launch pack is incomplete", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    await expect(
      b.as("steward").mutation(api.places.setVisibility, {
        placeId,
        visibility: "pilot",
        agreementRecorded: true,
      }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: expect.stringContaining("launch pack") },
    });
    expect((await b.as("creator").query(api.places.get, { placeId }))?.visibility).toBe("draft");
  });

  it("a place without a confirmed name cannot leave draft", async () => {
    const b = await setup();
    const placeId = await addPlace(b, {
      createdBy: b.creator,
      kind: "landmark",
      withNames: false,
      isMock: true,
    });
    await b.run((ctx) =>
      ctx.db.insert("placeName", {
        placeId,
        lang: "en",
        script: "latin",
        value: "Unconfirmed mock name",
        isPrimary: true,
      }),
    );
    await expect(
      b.as("steward").mutation(api.places.setVisibility, {
        placeId,
        visibility: "demo_public",
        confirmFictional: true,
      }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: expect.stringContaining("confirmed name") },
    });
  });

  it("a creator is forbidden", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    expect(
      await errorCode(
        b.as("creator").mutation(api.places.setVisibility, { placeId, visibility: "demo_public" }),
      ),
    ).toBe("forbidden");
  });

  it("moving back to draft is allowed", async () => {
    const b = await setup();
    const placeId = await addPlace(b, {
      createdBy: b.creator,
      visibility: "pilot",
      withNames: false,
    });
    await expect(
      b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "draft" }),
    ).resolves.toBeNull();
    expect((await b.as("creator").query(api.places.get, { placeId }))?.visibility).toBe("draft");
  });

  it("each change writes an audit entry", async () => {
    const b = await setup({ isMock: true });
    const { placeId } = await b.create();
    for (const visibility of ["demo_public", "demo_public", "draft"] as const) {
      await b.as("steward").mutation(api.places.setVisibility, {
        placeId,
        visibility,
        agreementRecorded: true,
        confirmFictional: true,
      });
    }
    const entries = await b.audits("place.set_visibility");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      actorPersonId: b.steward,
      targetId: placeId,
      diff: { visibility: { from: "draft", to: "demo_public" }, agreementRecorded: true },
    });
    expect(entries[1]).toMatchObject({
      diff: { visibility: { from: "demo_public", to: "draft" } },
    });
  });

  it("a disabled public demo is refused", async () => {
    const b = await setup({ isMock: true });
    const { placeId } = await b.create();
    const config = region.regionConfig("nagasaki");
    vi.spyOn(region, "regionConfig").mockReturnValue({
      ...config,
      demo: { ...config.demo, publicDemoEnabled: false },
    });
    await expect(
      b.as("steward").mutation(api.places.setVisibility, {
        placeId,
        visibility: "demo_public",
        confirmFictional: true,
      }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: expect.stringContaining("disabled") },
    });
  });

  it.each(["business", "landmark"] as const)(
    "a real %s with owner agreement reaches pilot, not demo_public",
    async (kind) => {
      const b = await setup();
      const { placeId } = await b.create();
      await b.as("steward").mutation(api.places.setKind, { placeId, kind });
      await addOwner(b, placeId, b.owner, b.steward);
      const policy = vi.spyOn(region, "regionPolicy").mockReturnValue({
        inviteOnly: true,
        noindex: true,
        allowPilotVisibility: true,
        realBusinessesDraftOnly: true,
      });
      await expect(
        b.as("steward").mutation(api.places.setVisibility, {
          placeId,
          visibility: "pilot",
          agreementRecorded: true,
        }),
      ).rejects.toMatchObject({
        data: { code: "conflict", message: expect.stringContaining("stay in draft") },
      });
      policy.mockReturnValue({
        inviteOnly: false,
        noindex: false,
        allowPilotVisibility: true,
        realBusinessesDraftOnly: false,
      });
      await expect(
        b.as("steward").mutation(api.places.setVisibility, { placeId, visibility: "pilot" }),
      ).rejects.toMatchObject({
        data: { code: "conflict", message: expect.stringContaining("agreement") },
      });
      await b.as("steward").mutation(api.places.setVisibility, {
        placeId,
        visibility: "pilot",
        agreementRecorded: true,
      });
      expect((await b.as("user").query(api.places.get, { placeId }))?.visibility).toBe("pilot");
      expect((await b.as("owner").query(api.places.get, { placeId }))?.visibility).toBe("pilot");
      expect(await b.t.query(api.places.get, { placeId })).toBeNull();
      await expect(
        b.as("owner").mutation(api.places.setVisibility, {
          placeId,
          visibility: "pilot",
          agreementRecorded: true,
        }),
      ).rejects.toMatchObject({ data: { code: "forbidden" } });
      await expect(
        b.as("steward").mutation(api.places.setVisibility, {
          placeId,
          visibility: "demo_public",
          agreementRecorded: true,
          confirmFictional: true,
        }),
      ).rejects.toMatchObject({
        data: { code: "conflict", message: expect.stringContaining("may be demo_public") },
      });
      expect((await b.as("owner").query(api.places.get, { placeId }))?.visibility).toBe("pilot");
    },
  );
});

describe("places.attachOwner", () => {
  it("attachOwner links a business owner and sets ownerPersonId on its interviews", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const interviewId = await addInterview(b, { placeId, interviewerId: b.creator });
    const existing = await addInterview(b, {
      placeId,
      interviewerId: b.creator,
      ownerPersonId: b.other,
    });
    await b.as("steward").mutation(api.places.attachOwner, { placeId, personId: b.owner });
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("placeOwner")
          .withIndex("by_placeId_and_personId", (q) =>
            q.eq("placeId", placeId).eq("personId", b.owner),
          )
          .unique(),
      ),
    ).toMatchObject({ verifiedBy: b.steward, verifiedAt: expect.any(Number) });
    expect(await b.run((ctx) => ctx.db.get("interview", interviewId))).toMatchObject({
      ownerPersonId: b.owner,
    });
    expect(await b.run((ctx) => ctx.db.get("interview", existing))).toMatchObject({
      ownerPersonId: b.other,
    });
    expect(await b.run((ctx) => ctx.db.get("person", b.owner))).toMatchObject({
      verifiedBy: b.steward,
      verifiedAt: expect.any(Number),
    });
    expect(await b.audits("place.attach_owner")).toHaveLength(1);
  });

  it("attachOwner reopens published open-text claims and holds the sentences citing them, so the owner rule does not fire", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const confirmed = await addClaim(b, {
      placeId,
      origin: "open_text",
      status: "owner_confirmed",
    });
    const claimId = await addClaim(b, { placeId, origin: "open_text", status: "published" });
    const untouched = await addClaim(b, { placeId, status: "published", authorId: b.creator });
    const pageId = await addPage(b, {
      placeId,
      sentences: [
        { lang: "ja", text: "架空のテスト文", claimIds: [claimId] },
        { lang: "en", text: "Fictional test sentence", claimIds: [untouched] },
      ],
    });
    await b.as("steward").mutation(api.places.attachOwner, { placeId, personId: b.owner });
    for (const id of [claimId, confirmed]) {
      const claim = await b.run((ctx) => ctx.db.get("claim", id));
      expect(claim?.status).toBe("proposed");
      expect(claim?.reviewerId).toBeUndefined();
      expect(claim?.confirmedAt).toBeUndefined();
    }
    const sentences = await b.run((ctx) =>
      ctx.db
        .query("pageSentence")
        .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) => q.eq("pageVersionId", pageId))
        .take(20),
    );
    expect(sentences.find((sentence) => sentence.lang === "ja")?.held).toBe(true);
    expect(sentences.find((sentence) => sentence.lang === "en")?.held).toBe(false);
    expect(await b.audits("claim.reopen")).toHaveLength(2);
    expect((await b.as("owner").query(api.places.get, { placeId }))?.isOwner).toBe(true);
  });

  it("reopens both disputed partners even when the first cascade makes its partner published", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    const { first: a, second: c } = await addDisputePair(
      b,
      { placeId, origin: "open_text" },
      { placeId, origin: "open_text" },
    );
    await b.as("steward").mutation(api.places.attachOwner, { placeId, personId: b.owner });
    for (const id of [a, c]) {
      const claim = await b.run((ctx) => ctx.db.get("claim", id));
      expect(claim?.status).toBe("proposed");
      expect(claim?.disputedWith).toBeUndefined();
    }
  });

  it("a person who is not a business_owner is a conflict", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    await expect(
      b.as("steward").mutation(api.places.attachOwner, { placeId, personId: b.user }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: "set the role to business_owner first" },
    });
  });

  it("attaching twice is a no-op", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    await b.run((ctx) =>
      ctx.db.patch("person", b.owner, { verifiedAt: 123, verifiedBy: b.creator }),
    );
    const attach = () =>
      b.as("steward").mutation(api.places.attachOwner, { placeId, personId: b.owner });
    await attach();
    const before = await b.run((ctx) => ctx.db.get("person", b.owner));
    await attach();
    expect(await b.audits("place.attach_owner")).toHaveLength(1);
    expect(await b.run((ctx) => ctx.db.get("person", b.owner))).toEqual(before);
    expect(before).toMatchObject({ verifiedAt: 123, verifiedBy: b.creator });
  });

  it("a creator is forbidden", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    expect(
      await errorCode(
        b.as("creator").mutation(api.places.attachOwner, { placeId, personId: b.owner }),
      ),
    ).toBe("forbidden");
  });

  it("missing target people and places are not_found", async () => {
    const b = await setup();
    const { placeId } = await b.create();
    await b.run((ctx) => ctx.db.delete("person", b.owner));
    expect(
      await errorCode(
        b.as("steward").mutation(api.places.attachOwner, { placeId, personId: b.owner }),
      ),
    ).toBe("not_found");
    await b.run((ctx) => ctx.db.delete("place", placeId));
    expect(
      await errorCode(
        b.as("steward").mutation(api.places.attachOwner, { placeId, personId: b.user }),
      ),
    ).toBe("not_found");
  });
});

describe("place slugs", () => {
  it("prefers Latin over romaji, strips diacritics and bounds the base", () => {
    const values = (script: Script, value: string) => ({ script, value });
    expect(slugBase([values("romaji", "Romaji"), values("latin", " Ōura & Test! ")])).toBe(
      "oura-test",
    );
    expect(slugBase([values("romaji", "Ōura")])).toBe("oura");
    expect(slugBase([values("latin", "---")])).toBe("place");
    expect(slugBase([values("latin", "a".repeat(59) + " - end")])).toBe("a".repeat(59));
    expect(slugBase([values("latin", "a".repeat(100))])).toHaveLength(60);
  });

  it("uses the first free suffix in the region and conflicts after 50", async () => {
    const b = await setup();
    await b.run(async (ctx) => {
      for (let i = 1; i <= 50; i++)
        await ctx.db.insert("place", {
          regionId: "nagasaki",
          slug: i === 1 ? "mock" : `mock-${i}`,
          createdBy: b.creator,
          visibility: "draft",
          isMock: false,
        });
    });
    expect(await errorCode(b.run((ctx) => uniqueSlug(ctx, "nagasaki", "mock")))).toBe("conflict");
    expect(await b.run((ctx) => uniqueSlug(ctx, "another-region", "mock"))).toBe("mock");
    await b.run(async (ctx) => {
      const third = await ctx.db
        .query("place")
        .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", "nagasaki").eq("slug", "mock-3"))
        .unique();
      await ctx.db.delete("place", third!._id);
    });
    expect(await b.run((ctx) => uniqueSlug(ctx, "nagasaki", "mock"))).toBe("mock-3");
  });
});
