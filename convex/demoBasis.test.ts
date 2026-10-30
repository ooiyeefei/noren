/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addClaim,
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
import { canSeeSource, isPublicDemoPlace, loadReadablePlace } from "./lib/access";
import { currentPerson } from "./lib/auth";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
type BasisFields = Pick<Doc<"place">, "visibility" | "kind" | "isMock" | "demoPublicBasis">;

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const creator = await addPerson(b, "creator", "creator");
  const owner = await addPerson(b, "owner", "business_owner");
  const other = await addPerson(b, "other", "creator");
  await addPerson(b, "visitor", "user");
  const rawPlace = (fields: BasisFields) =>
    b.t.run((ctx) =>
      ctx.db.insert("place", {
        regionId: "nagasaki",
        slug: "mock-basis-test",
        createdBy: creator,
        ...fields,
      }),
    );
  return { b, steward, creator, owner, other, rawPlace };
}

afterEach(() => vi.restoreAllMocks());

describe("recorded public demo basis", () => {
  it.each([undefined, "business", "landmark"] as const)(
    "the public demo fixture defaults to a consistent fictional mock (kind=%s)",
    async (kind) => {
      const { b, creator } = await setup();
      const placeId = await addPlace(b, { createdBy: creator, visibility: "demo_public", kind });
      expect(await b.t.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
        visibility: "demo_public",
        demoPublicBasis: "fictional",
        isMock: true,
      });
      expect((await b.t.query(api.places.get, { placeId }))?._id).toBe(placeId);
    },
  );

  it("a demo_public row inserted without a basis through the raw db is not publicly readable", async () => {
    const { b, rawPlace } = await setup();
    const placeId = await rawPlace({ visibility: "demo_public", kind: "landmark", isMock: true });
    expect(await b.t.query(api.places.get, { placeId })).toBeNull();
    expect(await errorCode(b.t.run((ctx) => loadReadablePlace(ctx, null, placeId)))).toBe(
      "not_found",
    );
    expect(
      await errorCode(
        b
          .as("visitor")
          .run(async (ctx) => loadReadablePlace(ctx, await currentPerson(ctx), placeId)),
      ),
    ).toBe("not_found");
  });

  it.each([
    { kind: "business", isMock: false, demoPublicBasis: "fictional" },
    { kind: "landmark", isMock: false, demoPublicBasis: "fictional" },
  ] as const)(
    "a fictional basis that disagrees with isMock is not publicly readable: %j",
    async (fields) => {
      const { b, rawPlace } = await setup();
      const placeId = await rawPlace({ visibility: "demo_public", ...fields });
      expect(await b.t.query(api.places.get, { placeId })).toBeNull();
      expect(await errorCode(b.t.run((ctx) => loadReadablePlace(ctx, null, placeId)))).toBe(
        "not_found",
      );
    },
  );

  it("a gated write that makes a place demo_public without a basis is refused by the rule", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, kind: "landmark" });
    expect(
      await ruleOf(b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "demo_public" }))),
    ).toBe("place_demo_public_needs_basis");
    expect(
      await ruleOf(
        b.run((ctx) =>
          ctx.db.insert("place", {
            regionId: "nagasaki",
            slug: "mock-gated-insert",
            createdBy: creator,
            kind: "landmark",
            isMock: true,
            visibility: "demo_public",
          }),
        ),
      ),
    ).toBe("place_demo_public_needs_basis");
  });

  it.each([
    { visibility: "demo_public", kind: "business", isMock: false, demoPublicBasis: "fictional" },
    { visibility: "demo_public", kind: "landmark", isMock: false, demoPublicBasis: "fictional" },
    { visibility: "draft", kind: "landmark", isMock: true, demoPublicBasis: "fictional" },
    { visibility: "pilot", kind: "business", isMock: true, demoPublicBasis: "fictional" },
  ] as const)("the gate refuses an inconsistent or non-public basis: %j", async (fields) => {
    const { b, creator } = await setup();
    expect(
      await ruleOf(
        b.run((ctx) =>
          ctx.db.insert("place", {
            regionId: "nagasaki",
            slug: "mock-invalid-basis",
            createdBy: creator,
            ...fields,
          }),
        ),
      ),
    ).toBe("place_demo_public_needs_basis");
  });

  it.each([
    { kind: undefined, isMock: true, basis: "fictional" },
    { kind: "landmark", isMock: true, basis: "fictional" },
    { kind: "business", isMock: true, basis: "fictional" },
  ] as const)(
    "setVisibility records the basis and the audit entry names it: %j",
    async ({ kind, isMock, basis }) => {
      const { b, creator, steward } = await setup();
      const placeId = await addPlace(b, { createdBy: creator, kind, isMock });
      const setPublic = () =>
        b.as("steward").mutation(api.places.setVisibility, {
          placeId,
          visibility: "demo_public",
          confirmFictional: basis === "fictional",
        });
      for (const confirmFictional of [undefined, false]) {
        await expect(
          b.as("steward").mutation(api.places.setVisibility, {
            placeId,
            visibility: "demo_public",
            confirmFictional,
          }),
        ).rejects.toMatchObject({
          data: { code: "conflict", message: expect.stringContaining("may be demo_public") },
        });
      }
      expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual([]);
      await setPublic();
      expect(await b.t.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
        visibility: "demo_public",
        demoPublicBasis: basis,
      });
      expect(await b.as("steward").query(api.places.listAll, { regionId: "nagasaki" })).toEqual([
        expect.objectContaining({ _id: placeId, demoPublicBasis: basis }),
      ]);
      expect(await b.t.query(api.places.get, { placeId })).toMatchObject({
        demoPublicBasis: basis,
      });
      await setPublic();
      expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
        {
          actorPersonId: steward,
          action: "place.set_visibility",
          targetId: placeId,
          diff: { visibility: { from: "draft", to: "demo_public" }, demoPublicBasis: basis },
        },
      ]);
    },
  );

  it("setVisibility repairs a legacy row even when its visibility is unchanged", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, { createdBy: creator, kind: "landmark", isMock: true });
    await b.t.run((ctx) => ctx.db.patch("place", placeId, { visibility: "demo_public" }));
    await b.as("steward").mutation(api.places.setVisibility, {
      placeId,
      visibility: "demo_public",
      confirmFictional: true,
    });
    expect(await b.t.query(api.places.get, { placeId })).toMatchObject({
      demoPublicBasis: "fictional",
    });
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      { diff: { demoPublicBasis: "fictional" } },
    ]);
  });

  it.each(["draft", "pilot"] as const)(
    "leaving demo_public clears the basis: %s",
    async (visibility) => {
      const { b, creator } = await setup();
      const placeId = await addPlace(b, {
        createdBy: creator,
        visibility: "demo_public",
        isMock: true,
      });
      vi.spyOn(region, "regionPolicy").mockReturnValue({
        ...region.regionPolicy("nagasaki"),
        allowPilotVisibility: true,
      });
      await b.as("steward").mutation(api.places.setVisibility, { placeId, visibility });
      const place = await b.t.run((ctx) => ctx.db.get("place", placeId));
      expect(place?.visibility).toBe(visibility);
      expect(place?.demoPublicBasis).toBeUndefined();
      expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
        { diff: { visibility: { from: "demo_public", to: visibility } } },
      ]);
    },
  );

  it.each([false, true])(
    "a landmark label never makes a place public (mock=%s)",
    async (isMock) => {
      const { b, creator, steward } = await setup();
      const visibility = isMock ? "demo_public" : "draft";
      const placeId = await addPlace(b, {
        createdBy: creator,
        kind: "landmark",
        isMock,
        visibility,
      });
      for (const kind of ["business", "landmark"] as const) {
        await b.as("steward").mutation(api.places.setKind, { placeId, kind });
        expect(await b.t.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
          kind,
          visibility,
        });
        expect((await b.t.run((ctx) => ctx.db.get("place", placeId)))?.demoPublicBasis).toBe(
          isMock ? "fictional" : undefined,
        );
        expect((await b.t.query(api.places.get, { placeId })) !== null).toBe(isMock);
      }
      expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
        {
          actorPersonId: steward,
          action: "place.set_kind",
          diff: { kind: { from: "landmark", to: "business" } },
        },
        {
          actorPersonId: steward,
          action: "place.set_kind",
          diff: { kind: { from: "business", to: "landmark" } },
        },
      ]);
    },
  );

  it.each([undefined, "business", "landmark"] as const)(
    "a steward cannot make a real place demo_public with or without confirmFictional (kind=%s)",
    async (kind) => {
      const { b, creator, rawPlace } = await setup();
      const placeId = await addPlace(b, { createdBy: creator, kind, isMock: false });
      const legacyId = await rawPlace({
        visibility: "demo_public",
        kind,
        isMock: false,
        demoPublicBasis: "fictional",
      });
      for (const id of [placeId, legacyId]) {
        for (const confirmFictional of [undefined, false, true]) {
          await expect(
            b.as("steward").mutation(api.places.setVisibility, {
              placeId: id,
              visibility: "demo_public",
              confirmFictional,
              agreementRecorded: true,
            }),
          ).rejects.toMatchObject({
            data: { code: "conflict", message: expect.stringContaining("may be demo_public") },
          });
          expect(await b.t.query(api.places.get, { placeId: id })).toBeNull();
        }
      }
      expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual([]);
    },
  );

  it("the gate rechecks the basis on every patch, including unrelated changes", async () => {
    const { b, creator } = await setup();
    const placeId = await addPlace(b, {
      createdBy: creator,
      isMock: true,
      visibility: "demo_public",
    });
    for (const patch of [
      { isMock: false },
      { demoPublicBasis: undefined },
      { visibility: "draft" as const },
    ]) {
      expect(await ruleOf(b.run((ctx) => ctx.db.patch("place", placeId, patch)))).toBe(
        "place_demo_public_needs_basis",
      );
    }
    await b.t.run((ctx) => ctx.db.patch("place", placeId, { demoPublicBasis: undefined }));
    expect(
      await ruleOf(b.run((ctx) => ctx.db.patch("place", placeId, { slug: "mock-renamed" }))),
    ).toBe("place_demo_public_needs_basis");
  });

  it.each([
    {
      name: "real landmark label",
      visibility: "demo_public",
      kind: "landmark",
      isMock: false,
      demoPublicBasis: "fictional",
      public: false,
    },
    {
      name: "confirmed fictional mock",
      visibility: "demo_public",
      kind: "business",
      isMock: true,
      demoPublicBasis: "fictional",
      public: true,
    },
    { name: "legacy", visibility: "demo_public", kind: "landmark", isMock: true, public: false },
    {
      name: "mock without basis",
      visibility: "demo_public",
      kind: "business",
      isMock: true,
      public: false,
    },
    {
      name: "mismatched fictional",
      visibility: "demo_public",
      kind: "business",
      isMock: false,
      demoPublicBasis: "fictional",
      public: false,
    },
    { name: "draft", visibility: "draft", kind: "landmark", isMock: true, public: false },
    {
      name: "confirmed fictional legacy label",
      visibility: "demo_public",
      kind: "landmark",
      isMock: true,
      demoPublicBasis: "fictional",
      public: true,
    },
  ] as const)(
    "list, getBySlug, get, sources and the published page all agree through isPublicDemoPlace: $name",
    async (row) => {
      const { b, creator, steward, rawPlace } = await setup();
      const allowed = row.public;
      const placeId = await rawPlace({
        visibility: row.visibility,
        kind: row.kind,
        isMock: row.isMock,
        demoPublicBasis: "demoPublicBasis" in row ? row.demoPublicBasis : undefined,
      });
      const claimId = await addClaim(b, {
        placeId,
        origin: "open_text",
        status: "published",
        isMock: false,
      });
      const sourceId = await addSource(b, { placeId, addedBy: creator, demoConsentBy: steward });
      await addPage(b, {
        placeId,
        sentences: [{ lang: "ja", text: "Mock licensed test text.", claimIds: [claimId] }],
      });
      const place = await b.t.run((ctx) => ctx.db.get("place", placeId));
      const source = await b.t.run((ctx) => ctx.db.get("source", sourceId));
      if (place === null || source === null) throw new Error("missing fixture row");
      expect(isPublicDemoPlace(place)).toBe(allowed);
      expect(await b.t.run((ctx) => canSeeSource(ctx, null, place, source))).toBe(allowed);
      for (const caller of [b.t, b.as("visitor"), b.as("other")]) {
        expect(
          (await caller.query(api.places.listForMap, { regionId: "nagasaki" })).map((p) => p._id),
        ).toEqual(allowed ? [placeId] : []);
        expect(
          (await caller.query(api.places.getBySlug, { regionId: "nagasaki", slug: place.slug }))
            ?._id ?? null,
        ).toBe(allowed ? placeId : null);
        expect((await caller.query(api.places.get, { placeId }))?._id ?? null).toBe(
          allowed ? placeId : null,
        );
        expect(
          (await caller.query(api.sources.listForPlace, { placeId })).map((s) => s._id),
        ).toEqual(allowed ? [sourceId] : []);
        expect(
          (await caller.query(api.pages.getPublished, { placeId }))?.sentences.length ?? null,
        ).toBe(allowed ? 1 : null);
      }
    },
  );

  it("a manager still reads a place whose basis is invalid", async () => {
    const { b, creator, steward, owner, other, rawPlace } = await setup();
    const placeId = await rawPlace({
      visibility: "demo_public",
      kind: "business",
      isMock: false,
      demoPublicBasis: "fictional",
    });
    await addOwner(b, placeId, owner, steward);
    const sourceId = await addSource(b, { placeId, addedBy: other });
    const claimId = await addClaim(b, {
      placeId,
      authorId: creator,
      status: "published",
      isMock: true,
    });
    await addPage(b, {
      placeId,
      sentences: [{ lang: "ja", text: "Mock private text.", claimIds: [claimId] }],
    });
    for (const viewer of ["creator", "steward", "owner"]) {
      const caller = b.as(viewer);
      expect((await caller.query(api.places.get, { placeId }))?._id, viewer).toBe(placeId);
      expect(
        (
          await caller.query(api.places.getBySlug, {
            regionId: "nagasaki",
            slug: "mock-basis-test",
          })
        )?._id,
        viewer,
      ).toBe(placeId);
      expect(
        (await caller.query(api.places.listForMap, { regionId: "nagasaki" })).map((p) => p._id),
        viewer,
      ).toEqual([placeId]);
      expect(
        (await caller.query(api.sources.listForPlace, { placeId })).map((s) => s._id),
        viewer,
      ).toEqual([sourceId]);
      expect(
        (await caller.query(api.pages.getPublished, { placeId }))?.sentences,
        viewer,
      ).toHaveLength(1);
    }
    await b.run((ctx) => ctx.db.patch("person", owner, { role: "user" }));
    expect(await b.as("owner").query(api.places.get, { placeId })).toBeNull();
    expect(await b.as("owner").query(api.places.listForMap, { regionId: "nagasaki" })).toEqual([]);
  });
});
