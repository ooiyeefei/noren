import { travellerLabels } from "./snapshot";
import type { StoredParty, StoredTrip } from "./storage";
import type { Stop } from "./types";

function sharedCheck(check: Stop["checks"][number]) {
  if (check.verdict === "not_known") {
    return { rule: check.rule, verdict: check.verdict, reason: check.reason };
  }
  const { kind, factId } = check.restsOn;
  return { rule: check.rule, verdict: check.verdict, restsOn: { kind, ...(factId && { factId }) } };
}

/** Arguments to tripShare.create. The mutation supplies the owner, region and link code. */
export function buildTripShare(trip: StoredTrip, party: StoredParty, title: string) {
  if (!trip.plan) throw new Error("missing_plan");
  if (trip.partyId !== party.id) throw new Error("wrong_party");
  if (title.length > 80 || trip.plan.days.length > 7) throw new Error("share_limit");
  const labels = travellerLabels(party);
  const pins = new Map(trip.pins.map((pin) => [pin.id, pin]));
  const days = trip.plan.days.map((day) => {
    if (day.items.length > 12) throw new Error("share_limit");
    const items = day.items.map((item) => {
      if (item.kind === "drive") {
        return {
          kind: item.kind,
          from: item.from,
          to: item.to,
          minutes: item.minutes,
          kilometres: item.kilometres,
          estimated: item.estimated,
        };
      }
      if (item.kind === "rest") {
        return { kind: item.kind, at: item.at, minutes: item.minutes, why: item.why };
      }
      const shared = {
        kind: item.kind,
        at: item.at,
        minutes: item.minutes,
        checks: item.checks.map(sharedCheck),
      };
      const turn =
        item.because.kind === "turn" || item.because.kind === "paired"
          ? labels[item.because.for]
          : undefined;
      const turnFields = turn ? { turnLabel: turn } : {};
      if ("placeId" in item.place) return { ...shared, ...turnFields, placeId: item.place.placeId };
      const pin = pins.get(item.place.pinId);
      if (!pin) throw new Error("missing_pin");
      return {
        ...shared,
        ...turnFields,
        ...(pin.placeId ? { placeId: pin.placeId } : { pinLabel: pin.label }),
      };
    });
    return {
      index: day.index,
      ...(day.date && { date: day.date }),
      ...(day.night && { night: day.night }),
      items,
    };
  });
  return { deviceTripId: trip.id, title, days };
}
