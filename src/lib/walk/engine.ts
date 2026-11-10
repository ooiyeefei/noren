import type { Rng } from "@/lib/draw";
import { distanceMetres } from "@/lib/overture/dedupe";
import {
  CARD_LEAVE_METRES,
  DETOUR_CARD_MS,
  DETOUR_FIRST_AFTER_MS,
  DETOUR_GAP_MS,
  FIRST_STORY_NUDGE_GAP_MS,
  SPOKEN_CARD_GAP_MS,
} from "./constants";
import { drawDetour } from "./detour";
import { isUsableFix, placesInRange } from "./proximity";
import type { Fix, WalkPlace } from "./types";

// When a card appears on a walk. A pure function of what the walk has shown so far, the phone's
// reading and the clock, so every rule below is tested with fake positions and a fake clock. It
// touches no network, no storage and no speaker: it only says which card comes up next.

export type CardKind = "story" | "first-story" | "detour";

export type WalkMemory = {
  startedAt: number;
  /** Places that have had a story or first-story card on this walk. A place gets one, ever. */
  seen: readonly string[];
  /** Places already suggested as a detour. A suggested place can still get its own card on arrival. */
  suggested: readonly string[];
  lastSpokenAt: number | null;
  lastNudgeAt: number | null;
  lastDetourAt: number | null;
  /** The card on screen. A story card is never replaced by a nudge or a detour. */
  slot: { kind: CardKind; slug: string; since: number } | null;
};

export function newMemory(startedAt: number): WalkMemory {
  return {
    startedAt,
    seen: [],
    suggested: [],
    lastSpokenAt: null,
    lastNudgeAt: null,
    lastDetourAt: null,
    slot: null,
  };
}

export type WalkEvent =
  | {
      kind: "story";
      place: WalkPlace;
      metres: number;
      /** Read it aloud now: sound is on, a voice exists, and the last spoken card was long enough ago. */
      speak: boolean;
    }
  | { kind: "first-story"; place: WalkPlace; metres: number }
  | { kind: "detour"; place: WalkPlace; metres: number; minutes: number };

export type StepInput = {
  memory: WalkMemory;
  fix: Fix;
  now: number;
  places: readonly WalkPlace[];
  accuracyAllowanceMetres: number;
  soundOn: boolean;
  /** Whether a local voice can read this place's words. */
  canSpeak(place: WalkPlace): boolean;
  rng: Rng;
};

export type StepResult = {
  memory: WalkMemory;
  /** At most one card comes up per reading. */
  event: WalkEvent | null;
  /** The card that was on screen went away because the person walked off. */
  slotCleared: boolean;
};

const due = (last: number | null, gap: number, now: number) => last === null || now - last >= gap;

/** Moves the walk on by one reading. */
export function step(input: StepInput): StepResult {
  const { fix, now, places, accuracyAllowanceMetres } = input;
  let memory = input.memory;
  if (!isUsableFix(fix)) return { memory, event: null, slotCleared: false };

  // A card goes away when the person has left the place it was about (or a detour's time is up).
  let slotCleared = false;
  if (memory.slot !== null) {
    const { slot } = memory;
    const place = places.find((candidate) => candidate.slug === slot.slug);
    const gone =
      place === undefined ||
      (slot.kind === "detour"
        ? now - slot.since >= DETOUR_CARD_MS
        : distanceMetres(fix, place.pin) > CARD_LEAVE_METRES);
    if (gone) {
      memory = { ...memory, slot: null };
      slotCleared = true;
    }
  }

  const seen = new Set(memory.seen);
  const inRange = placesInRange(fix, places, accuracyAllowanceMetres).filter(
    ({ place }) => !seen.has(place.slug),
  );
  const storyShowing = memory.slot?.kind === "story";

  // 1. A place with a story, nearest first, unless a story card is still on screen.
  const withStory = inRange.find(({ place }) => place.hasStory);
  if (withStory !== undefined && !storyShowing) {
    const { place, metres } = withStory;
    const speak =
      input.soundOn &&
      place.snippet !== undefined &&
      input.canSpeak(place) &&
      due(memory.lastSpokenAt, SPOKEN_CARD_GAP_MS, now);
    return {
      memory: {
        ...memory,
        seen: [...memory.seen, place.slug],
        lastSpokenAt: speak ? now : memory.lastSpokenAt,
        slot: { kind: "story", slug: place.slug, since: now },
      },
      event: { kind: "story", place, metres, speak },
      slotCleared,
    };
  }

  // 2. A place with no story: one nudge in twenty minutes, and never over a story card.
  const withoutStory = inRange.find(({ place }) => !place.hasStory);
  if (
    withoutStory !== undefined &&
    !storyShowing &&
    due(memory.lastNudgeAt, FIRST_STORY_NUDGE_GAP_MS, now)
  ) {
    const { place, metres } = withoutStory;
    return {
      memory: {
        ...memory,
        seen: [...memory.seen, place.slug],
        lastNudgeAt: now,
        slot: { kind: "first-story", slug: place.slug, since: now },
      },
      event: { kind: "first-story", place, metres },
      slotCleared,
    };
  }

  // 3. A detour: one in twenty minutes, not before the walk is a few minutes old, and only when
  // nothing else is on screen.
  const detourDue =
    memory.lastDetourAt === null
      ? now - memory.startedAt >= DETOUR_FIRST_AFTER_MS
      : now - memory.lastDetourAt >= DETOUR_GAP_MS;
  if (memory.slot === null && detourDue) {
    // A place that already had a card on this walk is not suggested as a detour.
    const detour = drawDetour({
      fix,
      places,
      suggested: new Set([...memory.suggested, ...memory.seen]),
      rng: input.rng,
    });
    if (detour !== null) {
      return {
        memory: {
          ...memory,
          suggested: [...memory.suggested, detour.place.slug],
          lastDetourAt: now,
          slot: { kind: "detour", slug: detour.place.slug, since: now },
        },
        event: { kind: "detour", ...detour },
        slotCleared,
      };
    }
  }

  return { memory, event: null, slotCleared };
}

/** The person closed the card. */
export function dismissed(memory: WalkMemory): WalkMemory {
  return memory.slot === null ? memory : { ...memory, slot: null };
}
