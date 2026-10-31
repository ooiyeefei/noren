/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addPage,
  addPerson,
  addPlace,
  addSource,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
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

it("a place is storied on the map while anyone may read a story or post people shared there", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "story-steward", "steward");
  await addPerson(b, "story-member", "user");
  await addPerson(b, "story-demo", "user", { isMock: true });
  const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
  const stored = async () =>
    (await b.t.run((ctx) => ctx.db.get("place", placeId)))?.hasPeopleStories;
  const onMap = async () =>
    (await b.t.query(api.places.listForMap, { regionId: "nagasaki" })).find(
      (place) => place._id === placeId,
    )?.hasStory;
  expect(await onMap()).toBe(false);

  // A demo account's story on a real place is for its writer only.
  await b.as("story-demo").mutation(api.stories.add, { placeId, body: "架空の話。", lang: "ja" });
  expect(await stored()).toBe(false);
  const storyId = await b
    .as("story-member")
    .mutation(api.stories.add, { placeId, body: "架空の話。", lang: "ja" });
  expect(await stored()).toBe(true);
  expect(await onMap()).toBe(true);
  await b.as("story-member").mutation(api.stories.remove, { storyId });
  expect(await stored()).toBe(false);
  expect(await onMap()).toBe(false);

  // A post nobody agreed to show does not count; a shared one does, until its original goes.
  const unshared = await addSource(b, { placeId, addedBy: steward });
  expect(await stored()).toBe(false);
  await b.run((ctx) => ctx.db.patch("source", unshared, { sharedAt: Date.now() }));
  expect(await stored()).toBe(true);
  await b.run((ctx) => ctx.db.patch("source", unshared, { status: "gone" }));
  expect(await stored()).toBe(false);
  await addSource(b, { placeId, addedBy: steward, demoConsentBy: steward });
  expect(await onMap()).toBe(true);
});

it("the backfill marks a place storied when a post shared before the copy existed shows there", async () => {
  const b = newBackend(modules);
  const steward = await addPerson(b, "legacy-steward", "steward");
  const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
  // Written around the triggers, as rows were before the copy existed.
  await b.t.run(async (ctx) => {
    const url = "https://example.com/legacy-post";
    await ctx.db.insert("source", {
      placeId,
      addedBy: steward,
      platform: "web",
      adapter: "link_card",
      url,
      canonicalUrl: url,
      status: "live",
      sharedAt: 1,
      isMock: false,
    });
  });
  const stored = async () =>
    (await b.t.run((ctx) => ctx.db.get("place", placeId)))?.hasPeopleStories;
  expect(await stored()).toBeUndefined();
  await b.t.mutation(internal.mapCopies.backfill, { cursor: null });
  expect(await stored()).toBe(true);
});
