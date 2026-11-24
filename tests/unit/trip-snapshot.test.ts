import { expect, it } from "vitest";
import { getRegionConfig } from "@/lib/region/registry";
import { buildTripRequest, travellerLabels } from "@/lib/trip/snapshot";
import { storedTripSchema, storedPartySchema } from "@/lib/trip/storage";

const region = getRegionConfig("malaysia-west")!;
const start = region.roads!.points[0]!;
const end = region.roads!.points[1]!;
const pin = { id: "p1", label: "Demo lunch spot", pin: start.pin, day: 1, minutes: 45 };
const trip = storedTripSchema.parse({
  id: "trip",
  regionId: region.id,
  partyId: "party",
  start: start.id,
  end: end.id,
  days: 1,
  pins: [pin, { ...pin, id: "p2", placeId: "map-id", label: "Demo map label" }],
  purpose: "Demo purpose",
  changes: [],
  status: "planning",
});
const traveller = {
  key: "t2",
  label: "Demo little one",
  ageBand: "child",
  rules: ["quiet"],
  likes: ["history"],
  skips: [],
};
const party = storedPartySchema.parse({
  id: "party",
  name: "Demo family",
  kept: true,
  travellers: [traveller, { ...traveller, key: "t1", label: "Demo parent", ageBand: "adult" }],
  needs: [{ kind: "rest", at: "14:00", minutes: 30, who: ["t2"] }],
});

it("keeps assigned keys stable for the plan, needs and the page", () => {
  expect(travellerLabels(party)).toEqual({ t1: "Demo parent", t2: "Demo little one" });
  const result = buildTripRequest(trip, party, region);
  expect(result.party.travellers.map((t) => t.key)).toEqual(["t1", "t2"]);
  expect(result.party.needs[0]?.who).toEqual(["t2"]);
  expect(result).toEqual(
    buildTripRequest(trip, { ...party, travellers: [...party.travellers].reverse() }, region),
  );
});

it("projects map pins and personal pins without sending any local text", () => {
  const result = buildTripRequest(trip, party, region, {
    ops: [{ op: "add_pin", pin: { ...pin, id: "p3" } }],
  });
  expect(result.pins[0]).toEqual({ id: "p1", day: 1, minutes: 45, pin: start.pin });
  expect(result.pins[1]?.placeId).toBe("map-id");
  const wire = JSON.stringify(result);
  for (const text of [
    party.name,
    trip.purpose,
    ...party.travellers.map((t) => t.label),
    ...trip.pins.map((p) => p.label),
  ])
    expect(wire).not.toContain(text);
  expect(() => buildTripRequest(trip, { ...party, id: "different" }, region)).toThrow(
    "wrong_party",
  );
});
