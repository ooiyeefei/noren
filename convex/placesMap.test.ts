/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import { addPage, addPerson, addPlace, newBackend } from "../tests/convex/fixtures";

const modules = import.meta.glob("./**/*.ts");
it("only published pages mark readable map places as having a story", async () => {
  const b = newBackend(modules);
  const creator = await addPerson(b, "map-creator", "creator");
  const published = await addPlace(b, {
    createdBy: creator,
    visibility: "public",
    category: "cafe",
  });
  const held = await addPlace(b, { createdBy: creator, visibility: "public" });
  const none = await addPlace(b, { createdBy: creator, visibility: "public" });
  await addPage(b, { placeId: published, sentences: [] });
  // A newer held version must not hide an existing published story.
  await addPage(b, { placeId: published, status: "held", sentences: [] });
  await addPage(b, { placeId: held, status: "held", sentences: [] });
  const places = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
  expect(places).toHaveLength(3);
  expect(places.find((place) => place._id === published)).toMatchObject({
    hasStory: true,
    category: "cafe",
    pin: expect.any(Object),
    names: expect.any(Array),
  });
  expect(places.find((place) => place._id === held)).toMatchObject({ hasStory: false });
  expect(places.find((place) => place._id === none)).toMatchObject({ hasStory: false });
  expect(await b.t.query(api.places.get, { placeId: published })).not.toHaveProperty("hasStory");
  expect(
    await b.t.query(api.places.listForMap, { regionId: "nagasaki", category: "cafe" }),
  ).toHaveLength(1);
});

it("preserves signed-out visibility and region rules, including drafts with published pages", async () => {
  const b = newBackend(modules);
  const creator = await addPerson(b, "visibility-creator", "creator");
  const draft = await addPlace(b, { createdBy: creator });
  await addPage(b, { placeId: draft, sentences: [] });
  await addPlace(b, { createdBy: creator, visibility: "public", regionId: "other-region" });
  const demo = await addPlace(b, { createdBy: creator, visibility: "demo_public" });
  const result = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
  expect(result.map((place) => place._id)).toEqual([demo]);
  expect(
    (await b.as("visibility-creator").query(api.places.listForMap, { regionId: "nagasaki" })).some(
      (place) => place._id === draft,
    ),
  ).toBe(true);
});
