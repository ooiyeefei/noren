import { expect, it } from "vitest";
import { getRegionConfig } from "@/lib/region/registry";
import { fillGuesses, parseTripRequest, tripRequestSchema } from "@/lib/trip/request";

const region = getRegionConfig("malaysia-west")!;
const town = region.roads!.points[0]!.id;
const person = { key: "t1", ageBand: "adult" as const, rules: ["quiet"], likes: [], skips: [] };
const party = fillGuesses({ travellers: [person] }, region);
const base = { regionId: region.id, start: town, end: town, days: 2, party, pins: [] };
const pin = { id: "p1", minutes: 10, pin: { lat: 0, lng: 0 }, day: 1 };
const kept = {
  slot: "d1.open1",
  day: 1,
  place: { pinId: "p1" },
  hold: "time",
  at: "10:00",
  minutes: 10,
  because: { kind: "pin" },
};
const parse = (extra: object) => parseTripRequest({ ...base, ...extra }, region);

it("fills missing settings independently from the region", () => {
  expect(party.guessed).toEqual(["stretch", "dayDrive", "meals", "fullness"]);
  const guesses = region.trip!.guesses;
  expect(
    fillGuesses(
      { limits: { stretchMinutes: 50 }, meals: { lunch: "11:00" }, fullness: "full" },
      region,
    ),
  ).toMatchObject({
    limits: { stretchMinutes: 50, dayDriveMinutes: guesses.dayDriveMinutes },
    meals: { lunch: "11:00", dinner: guesses.dinner },
    guessed: ["dayDrive", "meals"],
  });
  expect(fillGuesses(party, region).guessed).toEqual([]);
});

it("accepts the exact limits and routable points", () => {
  expect(
    parse({
      days: 7,
      startDate: "2028-02-29",
      via: Array(6).fill(town),
      nights: Array(6).fill(town),
      pins: Array.from({ length: 12 }, (_, i) => ({ ...pin, id: String(i) })),
      keep: { stops: Array(84).fill(kept) },
      avoid: Array(60).fill("place"),
      ops: Array(20).fill({ op: "quieter" }),
      party: {
        ...party,
        travellers: Array.from({ length: 8 }, (_, i) => ({ ...person, key: "t" + (i + 1) })),
      },
    }).ok,
  ).toBe(true);
});

it.each([
  { days: 8 },
  { days: 0 },
  { startDate: "2026-02-30" },
  { nights: [] },
  { via: Array(7).fill(town) },
  { pins: Array(13).fill(pin) },
  { pins: [{ ...pin, at: "24:00" }] },
  { pins: [{ ...pin, pin: { lat: Infinity, lng: 1 } }] },
  { pins: [{ ...pin, pin: { lat: 0, lng: 181 } }] },
  { keep: { stops: Array(85).fill(kept) } },
  { avoid: Array(61).fill("place") },
  { ops: Array(21).fill({ op: "quieter" }) },
  { party: { ...party, travellers: [person, person] } },
  { party: { ...party, travellers: [{ ...person, key: "t9" }] } },
  ...[
    { rules: Array(9).fill("quiet") },
    { likes: Array(9).fill("history") },
    { skips: Array(5).fill("history") },
  ].map((extra) => ({ party: { ...party, travellers: [{ ...person, ...extra }] } })),
  { purpose: "private" },
  { party: { ...party, name: "private" } },
  { pins: [{ ...pin, label: "private" }] },
  { ops: [{ op: "add_pin", pin: { ...pin, pin: { lat: 0, lng: 0, label: "private" } } }] },
  { keep: { stops: [{ ...kept, because: { kind: "pin", words: "private" } }] } },
])("refuses invalid or private fields (%#)", (extra) => {
  expect(tripRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
});

it("returns stable codes without echoing input", () => {
  for (const extra of [
    { start: "absent" },
    { end: "absent" },
    { nights: ["absent"] },
    { via: ["absent"] },
    { ops: [{ op: "move_night", night: 1, to: "absent" }] },
  ]) {
    expect(parse(extra)).toEqual({ ok: false, code: "unknown_road_point" });
  }
  for (const field of ["rules", "likes", "skips"]) {
    expect(
      parse({ party: { ...party, travellers: [{ ...person, [field]: ["private"] }] } }),
    ).toEqual({ ok: false, code: "unknown_tag" });
  }
  expect(parse({ party: { ...party, travellers: Array(9).fill(person) } })).toEqual({
    ok: false,
    code: "too_many_travellers",
  });
});
