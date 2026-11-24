import { keyedUniform } from "../draw/rng";
import { interestsFor, normaliseTag, resolveInterests } from "../draw/rules";
import { sampleWithoutReplacement } from "../draw/sample";
import { drawWeight, TASTE_TILT } from "../draw/weights";
import { needsServed } from "../facts/rules";
import { checksFor, travellersOn } from "./checks";
import { placeKey } from "./checker";
import type { RouteDay } from "./days";
import type { SlotEdit } from "./engine";
import { closestPoint, detourMetres } from "./roads";
import { clockMinutes, giveTurn, keptSlots, mealMinutes, type Slot } from "./slots";
import type { Draft } from "./times";
import type { DayTurns } from "./turns";
import type { Candidate, LatLng, PartySnapshot, Plan, Stop, TripRequest, World } from "./types";

export function pickFor(
  slot: Slot,
  candidates: readonly Candidate[],
  unavailable: ReadonlySet<string>,
  travellers: PartySnapshot["travellers"],
  world: World,
  date: string,
): { candidate: Candidate; checks: Stop["checks"] } | undefined {
  const { region } = world;
  const turn = slot.kind === "open" && slot.because.kind === "turn" ? slot.because : undefined;
  const interests = resolveInterests(turn?.likes ?? [], region);
  const traveller = travellers.find(({ key }) => key === turn?.for);
  const skips = resolveInterests(traveller?.skips ?? [], region);
  const pool = candidates.flatMap((candidate) => {
    if (unavailable.has(candidate.placeId)) return [];
    if (slot.kind === "meal" && !region.trip?.foodCategories.includes(candidate.category ?? ""))
      return [];
    if (slot.kind === "need" && !needsServed(candidate.facts, region, date).has(slot.need))
      return [];
    const { allowed, checks } = checksFor(candidate, travellers, region, date);
    return allowed ? [{ candidate, checks }] : [];
  });

  return sampleWithoutReplacement(
    pool,
    1,
    ({ candidate, checks }) =>
      drawWeight(
        {
          recentSuggestions: candidate.recentSuggestions,
          hasStory: candidate.hasStory,
          matchesInterest: interestsFor(interests, candidate.category).length > 0,
        },
        {
          wildCard: slot.kind === "open" && slot.because.kind === "wild",
          meetsMustHave: checks.some(({ verdict }) => verdict === "met"),
        },
      ) / (interestsFor(skips, candidate.category).length ? TASTE_TILT : 1),
    ({ candidate }) => keyedUniform(`${world.seed}|${slot.id}`, candidate.placeId),
  )[0];
}

function drawnBecause(slot: Slot): Stop["because"] {
  if (slot.kind === "open") return slot.because;
  if (slot.kind === "meal") return { kind: "need", need: "meal" };
  if (slot.kind === "need") return { kind: "need", need: slot.need };
  return { kind: "wild" };
}

function stopDraft(
  slot: Slot,
  place: Stop["place"],
  minutes: number,
  because: Stop["because"],
  candidate?: Candidate,
  checks: Stop["checks"] = [],
  pin = candidate?.pin,
): Draft {
  return {
    slot,
    point: slot.point,
    pin,
    fixed: slot.fixed,
    item: {
      kind: "stop",
      slot: slot.id,
      place,
      minutes,
      because,
      checks,
      confirmed: candidate?.confirmed ?? false,
      hasStory: candidate?.hasStory ?? false,
    },
  };
}

function drawDraft(
  slot: Slot,
  pool: Candidate[],
  unavailable: Set<string>,
  travellers: ReturnType<typeof travellersOn>,
  world: World,
  date: string,
): Draft | undefined {
  const trip = world.region.trip!;
  const drawn = pickFor(slot, pool, unavailable, travellers, world, date);
  if (drawn) {
    const { candidate, checks } = drawn;
    const minutes =
      slot.minutes ??
      trip.minutesAtStop[candidate.category ?? "other"] ??
      trip.minutesAtStop.other ??
      45;
    return stopDraft(
      slot,
      { placeId: candidate.placeId, slug: candidate.slug },
      minutes,
      drawnBecause(slot),
      candidate,
      checks,
    );
  }
  if (slot.kind === "open") return undefined;
  return {
    slot,
    point: slot.point,
    fixed: slot.fixed,
    item: {
      kind: "rest",
      minutes: slot.minutes ?? mealMinutes(trip),
      why: slot.kind === "meal" ? "meal" : slot.kind === "after_lunch" ? "after_lunch" : "need",
    },
  };
}

export function fillDay(
  request: TripRequest,
  world: World,
  day: RouteDay,
  slots: Slot[],
  locations: {
    all: ReadonlyMap<string, Candidate>;
    near: (point: string, open?: boolean) => Candidate[];
  },
  used: Set<string>,
  roadPins: ReadonlyMap<string, LatLng>,
  turns: DayTurns,
  exempt: ReadonlySet<string>,
  edits: ReadonlyMap<string, SlotEdit>,
) {
  const { all, near } = locations;
  const travellers = travellersOn(request.party, day.index);
  const date = request.startDate ?? world.today;
  const keeps = request.keep?.stops.filter(({ day: index }) => index === day.index) ?? [];
  const bySlot = new Map(keeps.map((keep) => [keep.slot, keep]));
  const drafts: Draft[] = [];
  const moved: NonNullable<Plan["moved"]> = [];
  const unmet: Plan["unmet"] = [];
  const replaced = new Set<string>();
  const held = new Set<string>();
  const poolFor = (slot: Slot) => near(day.points[slot.point]!.id, slot.kind === "open");
  const acceptTurn = (slot: string, because: Stop["because"]) => {
    if (because.kind === "turn" && !exempt.has(slot)) turns.accept(because);
  };
  const draw = (slot: Slot, unavailable = used) => {
    const edit = edits.get(slot.id);
    const pool = poolFor(slot);
    const draft = drawDraft(
      slot,
      edit?.accepts ? pool.filter(edit.accepts) : pool,
      unavailable,
      travellers,
      world,
      date,
    );
    if (draft?.item.kind === "stop" && edit?.because) draft.item.because = edit.because;
    return draft;
  };

  const extra = [...edits.values()].flatMap(({ prior }) =>
    prior?.day === day.index ? [prior] : [],
  );
  for (const original of keptSlots([...keeps, ...extra], slots, day, world.region.trip!)) {
    const keep = bySlot.get(original.id);
    const forced = edits.get(original.id)?.because ?? keep?.because;
    const partner = forced?.kind === "paired" && travellers.find(({ key }) => key === forced.for);
    const turn =
      forced?.kind === "turn"
        ? forced
        : partner
          ? { kind: "turn" as const, for: partner.key, likes: partner.likes }
          : forced
            ? undefined
            : turns.next();
    const slot = giveTurn(original, turn);
    if (slot.kind === "pin") {
      const candidate = slot.pin.placeId ? all.get(slot.pin.placeId) : undefined;
      const checks = candidate ? checksFor(candidate, travellers, world.region, date).checks : [];
      drafts.push({
        ...stopDraft(
          slot,
          { pinId: slot.pin.id },
          slot.pin.minutes,
          { kind: "pin" },
          candidate,
          checks,
          slot.pin.pin,
        ),
        keepTime: slot.fixed !== undefined,
      });
      continue;
    }
    if (slot.kind === "after_lunch") {
      drafts.push(drawDraft(slot, [], used, travellers, world, date)!);
      continue;
    }
    if (keep && "pinId" in keep.place) {
      const draft = stopDraft(slot, keep.place, keep.minutes, keep.because);
      draft.fixed = keep.hold === "time" ? clockMinutes(keep.at) : slot.fixed;
      draft.keepTime = keep.hold === "time";
      drafts.push(draft);
      held.add(slot.id);
      continue;
    }
    if (keep && "placeId" in keep.place) {
      const candidate = all.get(keep.place.placeId);
      const result = candidate && checksFor(candidate, travellers, world.region, date);
      if (keep.hold === "time" || result?.allowed) {
        const draft = stopDraft(
          slot,
          keep.place,
          keep.minutes,
          keep.because,
          candidate,
          result?.checks,
        );
        draft.fixed = keep.hold === "time" ? clockMinutes(keep.at) : slot.fixed;
        draft.keepTime = keep.hold === "time";
        if (candidate && !poolFor(slot).some(({ placeId }) => placeId === candidate.placeId)) {
          draft.point = closestPoint(day.points, candidate.pin, roadPins);
        }
        drafts.push(draft);
        held.add(slot.id);
        acceptTurn(slot.id, keep.because);
        continue;
      }
      replaced.add(slot.id);
      moved.push({
        slot: slot.id,
        was: keep.place.placeId,
        why: candidate ? "kept_rule_not_met" : "kept_place_unavailable",
      });
    }
    const draft = draw(slot);
    if (draft) drafts.push(draft);
    if (draft?.item.kind === "stop") {
      used.add(placeKey(draft.item.place));
      acceptTurn(slot.id, draft.item.because);
    } else if (!draft)
      unmet.push({
        what: "turn",
        day: day.index,
        slot: slot.id,
        detail: "no_open_place_in_reach",
        choices: [],
      });
  }

  return { drafts, moved, unmet, replaced, held, draw };
}

export function pickPairedStop(
  draft: Draft,
  pool: Candidate[],
  unavailable: Set<string>,
  travellers: PartySnapshot["travellers"],
  world: World,
  date: string,
): Draft | undefined {
  const { item, slot, pin } = draft;
  if (slot.kind !== "open" || item.kind !== "stop" || item.because.kind !== "turn" || !pin) return;
  const turn = item.because;
  const category = pool.find(({ placeId }) => placeId === placeKey(item.place))?.category;
  const interests = resolveInterests(turn.likes, world.region);
  const drawnOn = new Set(interestsFor(interests, category).map(normaliseTag));
  const partner = travellers.find(
    ({ key, likes, skips }) =>
      key !== turn.for && likes.length && skips.some((skip) => drawnOn.has(normaliseTag(skip))),
  );
  if (!partner) return;

  const trip = world.region.trip!;
  const nearby = pool.filter((place) => detourMetres(pin, place.pin, trip) <= trip.walkLimitMetres);
  const pairSlot: Slot = {
    ...slot,
    id: `${slot.id}.pair`,
    target: (draft.fixed ?? slot.target) + 0.001,
    fixed: undefined,
    because: { kind: "turn", for: partner.key, likes: partner.likes },
  };
  const result = drawDraft(pairSlot, nearby, unavailable, travellers, world, date);
  if (result?.item.kind !== "stop") return;
  result.item.because = { kind: "paired", for: partner.key, with: turn.for };
  return result;
}
