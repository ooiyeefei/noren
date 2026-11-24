import { expect, it } from "vitest";
import { buildTripShare } from "@/lib/trip/share";
import { storedPartySchema, storedTripSchema } from "@/lib/trip/storage";

const party = storedPartySchema.parse({
  id: "group",
  name: "Demo family",
  kept: false,
  travellers: [
    {
      key: "t1",
      label: "Demo turn-taker",
      ageBand: "teen",
      rules: ["vegan"],
      likes: ["history"],
      skips: ["nature"],
    },
    { key: "t2", label: "Demo sibling", ageBand: "older", rules: ["quiet"], likes: [], skips: [] },
  ],
});
const checks = [
  { rule: "quiet", verdict: "not_known", reason: "no_record" },
  { rule: "vegan", verdict: "met", restsOn: { kind: "member", factId: "fact" } },
];
const turn = {
  kind: "stop",
  slot: "d1.open1",
  at: "11:00",
  minutes: 30,
  place: { placeId: "map-id", slug: "private-slug" },
  checks,
  because: { kind: "turn", for: "t1", likes: ["history"] },
  confirmed: true,
  hasStory: true,
};
const pin = {
  ...turn,
  slot: "d1.pin.p1",
  place: { pinId: "p1" },
  because: { kind: "pin" },
  checks: [],
};
const trip = storedTripSchema.parse({
  id: "trip",
  regionId: "malaysia-west",
  partyId: party.id,
  start: "kl",
  end: "kl",
  days: 1,
  purpose: "Demo purpose",
  pins: [{ id: "p1", pin: { lat: 3, lng: 101 }, day: 1, minutes: 30, label: "Demo meeting point" }],
  changes: [],
  status: "planning",
  seed: "private-seed",
  plan: {
    days: [
      {
        index: 1,
        date: "2026-11-24",
        calendar: [],
        items: [turn, pin],
        driveMinutes: 0,
        notes: [],
      },
    ],
    unmet: [{ what: "rule", detail: "private unmet explanation", choices: [] }],
  },
});

it("shares only the selected title, itinerary, turn label, pin words and anonymous checks", () => {
  const share = buildTripShare(trip, party, "Demo itinerary");
  expect(share).toEqual({
    deviceTripId: "trip",
    title: "Demo itinerary",
    days: [
      {
        index: 1,
        date: "2026-11-24",
        items: [
          {
            kind: "stop",
            at: "11:00",
            minutes: 30,
            placeId: "map-id",
            turnLabel: "Demo turn-taker",
            checks,
          },
          { kind: "stop", at: "11:00", minutes: 30, pinLabel: "Demo meeting point", checks: [] },
        ],
      },
    ],
  });
  const wire = JSON.stringify(share);
  for (const value of [
    "t1",
    "t2",
    "Demo sibling",
    "teen",
    "older",
    "history",
    "nature",
    trip.purpose,
    party.name,
    "private-",
  ])
    expect(wire).not.toContain(value);
});

it("refuses oversize shares without silently cutting stops", () => {
  expect(() => buildTripShare(trip, party, "x".repeat(81))).toThrow("share_limit");
  const day = trip.plan!.days[0]!;
  const large = {
    ...trip,
    plan: { ...trip.plan!, days: [{ ...day, items: Array(13).fill(day.items[0]) }] },
  };
  expect(() => buildTripShare(large, party, "Demo")).toThrow("share_limit");
});
