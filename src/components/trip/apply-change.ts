import { buildTripRequest } from "@/lib/trip/snapshot";
import { recordChange, type StoredParty, type StoredTrip, type TripData } from "@/lib/trip/storage";
import type {
  ChangeOp,
  KeptStop,
  Pin,
  Plan,
  RegionTripSettings,
  Stop,
  TripRequest,
} from "@/lib/trip/types";

// Making one change to a plan kept on this phone, shared by the plan page ("Draw another", "Skip",
// a turn, a pin) and the change page (the buttons and the typed words). Pure apart from the call to
// the planning action it is handed: nothing here reads or writes the device.

/** The stops the engine must leave alone while it changes one thing: all but the slots named. */
export function keepStops(
  plan: Pick<Plan, "days">,
  done: readonly string[],
  except: readonly string[],
): KeptStop[] {
  const finished = new Set(done);
  return plan.days.flatMap((day) =>
    day.items.flatMap((item): KeptStop[] =>
      item.kind !== "stop" ||
      except.includes(item.slot) ||
      item.because.kind === "pin" ||
      !("placeId" in item.place)
        ? []
        : [
            {
              slot: item.slot,
              day: day.index,
              place: item.place,
              hold: finished.has(item.slot) ? "time" : "place",
              at: item.at,
              minutes: item.minutes,
              because: item.because,
            },
          ],
    ),
  );
}

export function planStops(plan: Pick<Plan, "days">): Stop[] {
  return plan.days.flatMap((d) => d.items.filter((i): i is Stop => i.kind === "stop"));
}

/** The planning action, as the pages call it. */
export type PlanCall = (args: {
  request: TripRequest;
  seed: string;
  consentVersion: string;
}) => Promise<{ plan: unknown; seed: string }>;

export type ChangeResult =
  | { kind: "refused"; unmet: Plan["unmet"] }
  | {
      kind: "applied";
      plan: Plan;
      /** Places that left the plan because of the change, so they are not drawn again. */
      left: string[];
      added: Pin[];
      /** Stops the change could not reach, with the reason; the rest of the change was made. */
      unmet: Plan["unmet"];
    };

/**
 * Asks the engine for one change. A refused change comes back with the reason and the choices and
 * is never applied: the engine returns the plan as it was with one more entry in `unmet`, and no
 * stop moved. A change that moved something and could not reach some stops is applied, and those
 * stops are listed.
 */
export async function requestChange(input: {
  trip: StoredTrip;
  party: StoredParty;
  settings: RegionTripSettings;
  plan: PlanCall;
  consentVersion: string;
  ops: ChangeOp[];
  /** Slots whose place the organiser has given up (they are drawn again, not kept). */
  replaced?: readonly string[];
}): Promise<ChangeResult> {
  const { trip, party, settings, ops } = input;
  if (!trip.plan || !trip.seed) throw new Error("missing_plan");
  const replaced = input.replaced ?? [];
  const request = buildTripRequest(trip, party, settings, {
    keep: { stops: keepStops(trip.plan, trip.plan.done, replaced) },
    ops,
  });
  const result = await input.plan({ request, seed: trip.seed, consentVersion: input.consentVersion });
  const plan = result.plan as Plan;
  const reasons = plan.unmet.filter((entry) => entry.what === "change");
  if ((plan.moved ?? []).length === 0 && reasons.length > 0) {
    return { kind: "refused", unmet: reasons };
  }
  const stillThere = new Set(
    planStops(plan).flatMap((s) => ("placeId" in s.place ? [s.place.placeId] : [])),
  );
  const left = replaced.flatMap((slot) => {
    const old = planStops(trip.plan!).find((s) => s.slot === slot);
    return old && "placeId" in old.place && !stillThere.has(old.place.placeId)
      ? [old.place.placeId]
      : [];
  });
  const added = ops.flatMap((op) => (op.op === "add_pin" ? [op.pin] : []));
  return { kind: "applied", plan, left, added, unmet: reasons };
}

/** The device's data after an applied change, with the plan before it kept so it can be undone. */
export function commitChange(
  data: TripData,
  tripId: string,
  result: Extract<ChangeResult, { kind: "applied" }>,
  change: { saidAs: string; ops: ChangeOp[] },
  pinLabels: ReadonlyMap<string, string> = new Map(),
  now = Date.now(),
): TripData {
  const current = data.trips.find((t) => t.id === tripId);
  if (!current) return data;
  const updated = recordChange(
    current,
    {
      plan: {
        ...result.plan,
        done: current.plan?.done ?? [],
        skipped: [
          ...(current.plan?.skipped ?? []),
          ...change.ops.flatMap((op) => (op.op === "skip" ? [op.slot] : [])),
        ],
      },
      avoid: [...new Set([...current.avoid, ...result.left])].slice(-60),
      pins: [
        ...current.pins,
        ...result.added.map((pin) => ({ ...pin, label: pinLabels.get(pin.id) ?? "" })),
      ],
    },
    { at: now, saidAs: change.saidAs.slice(0, 700), ops: change.ops, moved: result.plan.moved ?? [] },
  );
  return { ...data, trips: data.trips.map((t) => (t.id === tripId ? updated : t)) };
}

/** The day to offer first: the day whose date is today, else the first day with work left. */
export function dayForToday(plan: Pick<Plan, "days">, done: readonly string[], today: string): number {
  const dated = plan.days.find((d) => d.date === today);
  if (dated) return dated.index;
  const open = plan.days.find((d) =>
    d.items.some((i) => i.kind === "stop" && !done.includes(i.slot)),
  );
  return open?.index ?? plan.days[0]?.index ?? 1;
}

/** A trip is over once the last day it planned has passed. */
export function lastDayPassed(plan: Pick<Plan, "days">, today: string): boolean {
  const last = plan.days.at(-1)?.date;
  return last !== undefined && last < today;
}

/** Marking a stop done is not a change to the plan: the stop is held by time from now on. */
export function recordDone(data: TripData, tripId: string, slot: string, saidAs: string): TripData {
  const current = data.trips.find((t) => t.id === tripId);
  if (!current?.plan) return data;
  const updated = recordChange(
    current,
    { plan: { ...current.plan, done: [...current.plan.done, slot] }, status: "under_way" },
    { at: Date.now(), saidAs, ops: [], moved: [{ slot, why: "done" }] },
  );
  return { ...data, trips: data.trips.map((t) => (t.id === tripId ? updated : t)) };
}
