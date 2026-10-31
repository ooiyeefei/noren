/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  addPerson,
  addPlace,
  errorCode,
  newBackend,
  ruleOf,
  type Backend,
} from "../tests/convex/fixtures";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;
beforeEach(() => {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
});
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "check-steward", "steward");
  const member = await addPerson(b, "check-member", "user");
  const placeId = await addPlace(b, {
    createdBy: steward,
    visibility: "public",
    slug: "check-place",
  });
  return { b, steward, member, placeId };
}
const placeOf = (b: Backend, placeId: Id<"place">) =>
  b.t.run((ctx) => ctx.db.get("place", placeId));
const checksOf = (b: Backend, placeId: Id<"place">) =>
  b.t.run((ctx) =>
    ctx.db
      .query("placeCheck")
      .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", placeId))
      .collect(),
  );
const audits = (b: Backend, action: string) =>
  b.t.run(async (ctx) =>
    (await ctx.db.query("auditLog").collect()).filter((row) => row.action === action),
  );

it("'Still here' records who and when, once a day per person, and shows on the page and the map", async () => {
  const { b, member, placeId } = await setup();
  expect((await placeOf(b, placeId))?.confirmedAt).toBeUndefined();
  const before = Date.now();
  await b.as("check-member").mutation(api.checks.confirm, { placeId });
  const confirmed = await placeOf(b, placeId);
  expect(confirmed?.confirmedBy).toBe(member);
  expect(confirmed?.confirmedAt).toBeGreaterThanOrEqual(before);

  // Pressing again the same day records nothing new.
  await b.as("check-member").mutation(api.checks.confirm, { placeId });
  expect(await checksOf(b, placeId)).toHaveLength(1);
  await b.t.run((ctx) => ctx.db.patch("place", placeId, { confirmedAt: before - 2 * DAY }));
  await b.as("check-member").mutation(api.checks.confirm, { placeId });
  const checks = await checksOf(b, placeId);
  expect(checks).toHaveLength(2);
  expect(checks.map(({ verdict, problem, note }) => ({ verdict, problem, note }))).toEqual([
    { verdict: "still_here", problem: undefined, note: undefined },
    { verdict: "still_here", problem: undefined, note: undefined },
  ]);
  expect(await audits(b, "place.confirm")).toHaveLength(2);

  const shownAt = (await placeOf(b, placeId))!.confirmedAt;
  expect(shownAt).toBeGreaterThanOrEqual(before);
  const detail = await b.t.query(api.places.getBySlug, {
    regionId: "nagasaki",
    slug: "check-place",
  });
  expect(detail?.confirmedAt).toBe(shownAt);
  const map = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
  expect(map.find((place) => place._id === placeId)?.confirmedAt).toBe(shownAt);
});

it("only a signed-in member who can read the place may check it, and demo accounts check only demo places", async () => {
  const { b, steward, placeId } = await setup();
  expect(await errorCode(b.t.mutation(api.checks.confirm, { placeId }))).toBe("unauthenticated");
  expect(await errorCode(b.t.mutation(api.checks.report, { placeId, problem: "closed" }))).toBe(
    "unauthenticated",
  );
  await addPerson(b, "demo-member", "user", { isMock: true });
  expect(await errorCode(b.as("demo-member").mutation(api.checks.confirm, { placeId }))).toBe(
    "forbidden",
  );
  const draft = await addPlace(b, { createdBy: steward });
  expect(
    await errorCode(b.as("check-member").mutation(api.checks.confirm, { placeId: draft })),
  ).toBe("not_found");
  expect(await checksOf(b, placeId)).toEqual([]);
});

it("a report changes nothing in public until a steward keeps the place or hides it", async () => {
  const { b, steward, member, placeId } = await setup();
  const asMember = b.as("check-member");
  const asSteward = b.as("check-steward");
  expect(
    await errorCode(
      asMember.mutation(api.checks.report, { placeId, problem: "closed", note: "x".repeat(501) }),
    ),
  ).toBe("invalid_input");
  await asMember.mutation(api.checks.report, {
    placeId,
    problem: "closed",
    note: "  Shutters down since summer.  ",
  });
  let open = await asSteward.query(api.checks.listOpenReports, { regionId: "nagasaki" });
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({
    placeId,
    slug: "check-place",
    problem: "closed",
    note: "Shutters down since summer.",
    reporterName: "Test Person (check-member)",
    isMock: false,
  });
  expect(open[0]!.names.length).toBeGreaterThan(0);

  // Sending again replaces the open report rather than adding a second one.
  await asMember.mutation(api.checks.report, { placeId, problem: "moved", note: "   " });
  open = await asSteward.query(api.checks.listOpenReports, { regionId: "nagasaki" });
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({ problem: "moved" });
  expect(open[0]!.note).toBeUndefined();
  expect(await placeOf(b, placeId)).toMatchObject({ visibility: "public" });
  expect((await placeOf(b, placeId))?.confirmedAt).toBeUndefined();
  expect(await audits(b, "place.report")).toHaveLength(2);

  expect(
    await errorCode(asMember.query(api.checks.listOpenReports, { regionId: "nagasaki" })),
  ).toBe("forbidden");
  expect(
    await errorCode(
      asMember.mutation(api.checks.resolveReport, { checkId: open[0]!._id, outcome: "hidden" }),
    ),
  ).toBe("forbidden");

  await asSteward.mutation(api.checks.resolveReport, { checkId: open[0]!._id, outcome: "hidden" });
  expect(await placeOf(b, placeId)).toMatchObject({
    visibility: "draft",
    hiddenReason: "reported",
  });
  // Off the map for stewards too, who otherwise see drafts there.
  expect(await asSteward.query(api.places.listForMap, { regionId: "nagasaki" })).toEqual([]);
  expect(await asSteward.query(api.checks.listOpenReports, { regionId: "nagasaki" })).toEqual([]);
  const [hidden] = await checksOf(b, placeId);
  expect(hidden).toMatchObject({ outcome: "hidden", reviewedBy: steward, personId: member });
  expect(
    await errorCode(
      asSteward.mutation(api.checks.resolveReport, { checkId: open[0]!._id, outcome: "kept" }),
    ),
  ).toBe("conflict");
  expect((await audits(b, "place.report_resolved"))[0]?.diff).toEqual({
    outcome: "hidden",
    problem: "moved",
    visibility: { from: "public", to: "draft" },
  });
});

it("a kept place stays as it is, and the same member may report it again later", async () => {
  const { b, placeId } = await setup();
  const asMember = b.as("check-member");
  const asSteward = b.as("check-steward");
  await asMember.mutation(api.checks.report, { placeId, problem: "details" });
  const [first] = await asSteward.query(api.checks.listOpenReports, { regionId: "nagasaki" });
  await asSteward.mutation(api.checks.resolveReport, { checkId: first!._id, outcome: "kept" });
  expect(await placeOf(b, placeId)).toMatchObject({ visibility: "public" });
  await asMember.mutation(api.checks.report, { placeId, problem: "closed" });
  const reopened = await asSteward.query(api.checks.listOpenReports, { regionId: "nagasaki" });
  expect(reopened).toHaveLength(1);
  expect(reopened[0]!._id).not.toBe(first!._id);
  expect(await checksOf(b, placeId)).toHaveLength(2);
});

it("the rules keep a confirmation bare and a report complete", async () => {
  const { b, steward, member, placeId } = await setup();
  const base = { placeId, regionId: "nagasaki", personId: member, isMock: false };
  const insert = (row: Partial<Doc<"placeCheck">>) =>
    b.run((ctx) =>
      ctx.db.insert("placeCheck", { ...base, verdict: "still_here", ...row } as Omit<
        Doc<"placeCheck">,
        "_id" | "_creationTime"
      >),
    );
  expect(await ruleOf(insert({ problem: "closed" }))).toBe("place_check_problem");
  expect(await ruleOf(insert({ verdict: "something_wrong" }))).toBe("place_check_problem");
  expect(await ruleOf(insert({ note: "still open" }))).toBe("place_check_confirmation_bare");
  expect(await ruleOf(insert({ outcome: "kept", reviewedBy: steward, reviewedAt: 1 }))).toBe(
    "place_check_confirmation_bare",
  );
  const report = { verdict: "something_wrong" as const, problem: "closed" as const };
  expect(await ruleOf(insert({ ...report, note: "  " }))).toBe("place_check_note");
  expect(await ruleOf(insert({ ...report, note: "x".repeat(501) }))).toBe("place_check_note");
  expect(await ruleOf(insert({ ...report, reviewedBy: steward }))).toBe(
    "place_check_review_complete",
  );
  expect(await ruleOf(insert({ ...report, outcome: "kept", reviewedAt: 1 }))).toBe(
    "place_check_review_complete",
  );
  expect(await checksOf(b, placeId)).toEqual([]);
  await insert({ ...report, note: "gone", outcome: "kept", reviewedBy: steward, reviewedAt: 1 });
  await insert({});
  expect(await checksOf(b, placeId)).toHaveLength(2);
});

it("a place someone makes by hand is confirmed by them; the backfill confirms only hand-made places", async () => {
  const { b, steward, placeId: handMade } = await setup();
  await addPerson(b, "check-creator", "creator");
  const before = Date.now();
  const { placeId: created } = await b.as("check-creator").mutation(api.places.create, {
    regionId: "nagasaki",
    kind: "business",
    names: [{ lang: "ja", script: "kanji", value: "祈りの丘絵本美術館" }],
    pin: { lat: 32.735, lng: 129.87 },
  });
  const made = await placeOf(b, created);
  expect(made?.confirmedBy).toBe(made?.createdBy);
  expect(made?.confirmedAt).toBeGreaterThanOrEqual(before);

  const listed = await addPlace(b, { createdBy: steward, visibility: "public" });
  await b.run((ctx) =>
    ctx.db.insert("placeExternalRef", {
      placeId: listed,
      provider: "osm",
      ref: "node/1",
      licence: "ODbL-1.0",
      attribution: "© OpenStreetMap contributors",
      retrievedAt: 1,
    }),
  );
  expect(await b.t.mutation(internal.checks.backfillHandMade, { cursor: null })).toEqual({
    confirmed: 1,
    isDone: true,
  });
  const backfilled = await placeOf(b, handMade);
  expect(backfilled).toMatchObject({
    confirmedAt: backfilled!._creationTime,
    confirmedBy: steward,
  });
  expect((await placeOf(b, listed))?.confirmedAt).toBeUndefined();
  expect(await placeOf(b, created)).toMatchObject({ confirmedAt: made!.confirmedAt });
});
