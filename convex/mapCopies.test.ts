/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addPage, addPerson, newBackend, type Backend } from "../tests/convex/fixtures";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.restoreAllMocks());

async function copies(b: Backend, placeId: Id<"place">) {
  const place = await b.t.run((ctx) => ctx.db.get("place", placeId));
  return { names: place?.mapNames, pin: place?.mapPin, hasPublishedPage: place?.hasPublishedPage };
}

it("the place row's copies follow every write to its names, pin and pages", async () => {
  const b = newBackend(modules);
  await addPerson(b, "copy-creator", "creator");
  const creator = b.as("copy-creator");
  const { placeId } = await creator.mutation(api.places.create, {
    regionId: "nagasaki",
    kind: "business",
    names: [{ lang: "ja", script: "kanji", value: "祈りの丘絵本美術館" }],
    pin: { lat: 32.735, lng: 129.87 },
  });
  expect(await copies(b, placeId)).toEqual({
    names: [{ lang: "ja", script: "kanji", value: "祈りの丘絵本美術館", isPrimary: true }],
    pin: { lat: 32.735, lng: 129.87 },
    hasPublishedPage: undefined,
  });

  await creator.mutation(api.places.updateNames, {
    placeId,
    names: [
      { lang: "ja", script: "kanji", value: "祈りの丘絵本美術館" },
      { lang: "en", script: "latin", value: "Inori no Oka Picture Book Museum" },
    ],
  });
  await creator.mutation(api.places.movePin, { placeId, lat: 32.7352, lng: 129.8697 });
  expect(await copies(b, placeId)).toMatchObject({
    names: [
      { lang: "en", value: "Inori no Oka Picture Book Museum" },
      { lang: "ja", value: "祈りの丘絵本美術館" },
    ],
    pin: { lat: 32.7352, lng: 129.8697 },
  });

  await addPage(b, { placeId, status: "held", sentences: [] });
  expect((await copies(b, placeId)).hasPublishedPage).toBe(false);
  await addPage(b, { placeId, sentences: [] });
  expect((await copies(b, placeId)).hasPublishedPage).toBe(true);

  await b.run(async (ctx) => {
    const pin = await ctx.db
      .query("pin")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .unique();
    await ctx.db.delete("pin", pin!._id);
  });
  expect((await copies(b, placeId)).pin).toBeNull();
});

it("a place row without copies shows the same on the map, and the backfill copies it", async () => {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
  const b = newBackend(modules);
  const creator = await addPerson(b, "legacy-creator", "creator");
  // Written around the triggers, as rows were before the copies existed.
  const placeId = await b.t.run(async (ctx) => {
    const id = await ctx.db.insert("place", {
      regionId: "nagasaki",
      slug: "legacy-place",
      visibility: "public",
      category: "museum",
      createdBy: creator,
      isMock: false,
    });
    await ctx.db.insert("placeName", {
      placeId: id,
      lang: "ja",
      script: "kanji",
      value: "音浴博物館",
      isPrimary: true,
      confirmedBy: creator,
    });
    await ctx.db.insert("pin", {
      placeId: id,
      lat: 32.9,
      lng: 129.7,
      placedBy: creator,
      placedAt: 0,
    });
    await ctx.db.insert("pageVersion", {
      placeId: id,
      version: 1,
      status: "published",
      generatedBy: "test-fixture",
    });
    return id;
  });
  const before = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
  expect(await copies(b, placeId)).toEqual({
    names: undefined,
    pin: undefined,
    hasPublishedPage: undefined,
  });

  await b.t.mutation(internal.mapCopies.backfill, { cursor: null });
  expect(await copies(b, placeId)).toEqual({
    names: [{ lang: "ja", script: "kanji", value: "音浴博物館", isPrimary: true }],
    pin: { lat: 32.9, lng: 129.7 },
    hasPublishedPage: true,
  });
  const after = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
  expect(after).toEqual(before);
  expect(after[0]).toMatchObject({ hasStory: true, pin: { lat: 32.9, lng: 129.7 } });
});
