/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRegionConfig } from "../src/lib/region/registry";
import { addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const features = () => getRegionConfig("nagasaki")!.features;

async function world() {
  const b = newBackend(modules);
  await addPerson(b, "writer", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "other", "user");
  await addPerson(b, "steward", "steward");
  const editor = await addPerson(b, "editor", "creator");
  const placeId = await addPlace(b, { createdBy: editor, visibility: "public" });
  return { b, placeId };
}
type World = Awaited<ReturnType<typeof world>>;
const tell = (w: World, connectorAllowed?: boolean) =>
  w.b.as("writer").mutation(api.stories.add, {
    placeId: w.placeId as never,
    body: "The tram stop here is older than the street.",
    lang: "en",
    ...(connectorAllowed === undefined ? {} : { connectorAllowed }),
  });
const row = (w: World, storyId: Id<"story">) => w.b.run((ctx) => ctx.db.get("story", storyId));
const audits = (w: World) =>
  w.b.run(async (ctx) =>
    (await ctx.db.query("auditLog").take(50)).map((a) => [a.action, a.diff, a.actorKind]),
  );

beforeEach(() => {
  features().connector = true;
});
afterEach(() => {
  features().connector = false;
});

describe("the connector tick when a story is written", () => {
  it("is stored with its time only when ticked", async () => {
    const w = await world();
    const ticked = await tell(w, true);
    const plain = await tell(w);
    const unticked = await tell(w, false);
    expect((await row(w, ticked))?.connectorAllowedAt).toEqual(expect.any(Number));
    expect((await row(w, plain))?.connectorAllowedAt).toBeUndefined();
    expect((await row(w, unticked))?.connectorAllowedAt).toBeUndefined();
    expect((await row(w, ticked))?.shareConsentAt).toBeUndefined();
  });

  it("is audited without the story's words, and the story is not shared on Instagram by it", async () => {
    const w = await world();
    await tell(w, true);
    expect(await audits(w)).toEqual([
      ["story.connector_allowed", { connectorAllowed: true }, "person"],
    ]);
  });

  it("is refused while the region has the connector off", async () => {
    const w = await world();
    features().connector = false;
    expect(await errorCode(tell(w, true))).toBe("invalid_input");
    // Unticked is fine, and leaves no mark.
    const plain = await tell(w, false);
    expect((await row(w, plain))?.connectorAllowedAt).toBeUndefined();
  });
});

describe("changing the connector choice on a story already written", () => {
  it("starts off, and the writer turns it on and off, each time stamped and audited", async () => {
    const w = await world();
    const storyId = await tell(w);
    const choice = () => w.b.as("writer").query(api.storyConnector.choiceOf, { storyId });
    expect(await choice()).toEqual({ allowed: false });
    await w.b.as("writer").mutation(api.storyConnector.setAllowed, { storyId, on: true });
    expect(await choice()).toEqual({ allowed: true });
    expect((await row(w, storyId))?.connectorAllowedAt).toEqual(expect.any(Number));
    await w.b.as("writer").mutation(api.storyConnector.setAllowed, { storyId, on: false });
    expect(await choice()).toEqual({ allowed: false });
    expect((await row(w, storyId))?.connectorAllowedAt).toBeUndefined();
    expect(await audits(w)).toEqual([
      ["story.connector_allowed", { connectorAllowed: true }, "person"],
      ["story.connector_withdrawn", { connectorAllowed: false }, "person"],
    ]);
  });

  it("changes and records nothing when the story is already as asked", async () => {
    const w = await world();
    const storyId = await tell(w, true);
    const before = (await row(w, storyId))?.connectorAllowedAt;
    await w.b.as("writer").mutation(api.storyConnector.setAllowed, { storyId, on: true });
    expect((await row(w, storyId))?.connectorAllowedAt).toBe(before);
    const plain = await tell(w);
    await w.b.as("writer").mutation(api.storyConnector.setAllowed, { storyId: plain, on: false });
    expect(await audits(w)).toHaveLength(1);
  });

  it("is the writer's alone: not a steward, the place's editor or another member, and not a visitor", async () => {
    const w = await world();
    const storyId = await tell(w, true);
    for (const who of ["steward", "editor", "other"]) {
      for (const on of [true, false])
        expect(
          await errorCode(w.b.as(who).mutation(api.storyConnector.setAllowed, { storyId, on })),
        ).toBe("forbidden");
    }
    await expect(
      w.b.t.mutation(api.storyConnector.setAllowed, { storyId, on: false }),
    ).rejects.toBeDefined();
    await expect(
      w.b.t.mutation(api.storyConnector.setAllowed, { storyId, on: true }),
    ).rejects.toBeDefined();
    expect((await row(w, storyId))?.connectorAllowedAt).toEqual(expect.any(Number));
    expect(await audits(w)).toHaveLength(1);
  });

  it("is refused for turning on while the region has the connector off, and for a story taken down", async () => {
    const w = await world();
    const storyId = await tell(w);
    features().connector = false;
    expect(
      await errorCode(
        w.b.as("writer").mutation(api.storyConnector.setAllowed, { storyId, on: true }),
      ),
    ).toBe("invalid_input");
    expect((await row(w, storyId))?.connectorAllowedAt).toBeUndefined();
    features().connector = true;
    await w.b.as("writer").mutation(api.stories.remove, { storyId });
    expect(
      await errorCode(
        w.b.as("writer").mutation(api.storyConnector.setAllowed, { storyId, on: true }),
      ),
    ).toBe("conflict");
  });

  it("can always be turned off, even after the region switches the connector off", async () => {
    const w = await world();
    const storyId = await tell(w, true);
    features().connector = false;
    await w.b.as("writer").mutation(api.storyConnector.setAllowed, { storyId, on: false });
    expect((await row(w, storyId))?.connectorAllowedAt).toBeUndefined();
  });

  it("answers the writer alone, and nobody while the connector is off", async () => {
    const w = await world();
    const storyId = await tell(w, true);
    const ask = (who: string | null) =>
      (who === null ? w.b.t : w.b.as(who)).query(api.storyConnector.choiceOf, { storyId });
    expect(await ask("writer")).toEqual({ allowed: true });
    for (const who of ["other", "steward", "editor", null]) expect(await ask(who)).toBeNull();
    features().connector = false;
    expect(await ask("writer")).toBeNull();
  });
});
