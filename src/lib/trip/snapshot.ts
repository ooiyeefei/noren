import { fillGuesses, parseTripRequest } from "./request";
import type { StoredParty, StoredTrip } from "./storage";
import type { Pin, RegionTripSettings, TripRequest } from "./types";

/** Keep the assigned keys even when a card moves or another traveller leaves. */
export function travellerLabels(party: StoredParty): Record<string, string> {
  return Object.fromEntries(party.travellers.map((t) => [t.key, t.label]));
}

function requestPin({ id, day, at, minutes, pin, placeId }: Pin): Pin {
  return {
    id,
    day,
    minutes,
    pin: { lat: pin.lat, lng: pin.lng },
    ...(at !== undefined && { at }),
    ...(placeId !== undefined && { placeId }),
  };
}

export function buildTripRequest(
  trip: StoredTrip,
  party: StoredParty,
  region: RegionTripSettings,
  change: Pick<TripRequest, "keep" | "ops"> = {},
): TripRequest {
  if (trip.partyId !== party.id) throw new Error("wrong_party");
  const request = {
    regionId: trip.regionId,
    start: trip.start,
    end: trip.end,
    days: trip.days,
    ...(trip.startDate && { startDate: trip.startDate }),
    ...(trip.nights && { nights: trip.nights }),
    ...(trip.via && { via: trip.via }),
    avoid: trip.avoid,
    party: fillGuesses(
      { ...party, travellers: [...party.travellers].sort((a, b) => a.key.localeCompare(b.key)) },
      region,
    ),
    pins: trip.pins.map(requestPin),
    ...(change.keep && { keep: change.keep }),
    ...(change.ops && {
      ops: change.ops.map((op) =>
        op.op === "add_pin" ? { op: op.op, pin: requestPin(op.pin) } : op,
      ),
    }),
  };
  const result = parseTripRequest(request, region);
  if (!result.ok) throw new Error(result.code);
  return result.request;
}
