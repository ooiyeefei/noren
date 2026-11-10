import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/draw";
import {
  CARD_LEAVE_METRES,
  DETOUR_CARD_MS,
  DETOUR_FIRST_AFTER_MS,
  DETOUR_GAP_MS,
  DETOUR_MAX_METRES,
  DETOUR_MIN_METRES,
  FIRST_STORY_NUDGE_GAP_MS,
  MAX_USABLE_ACCURACY_METRES,
  SPOKEN_CARD_GAP_MS,
  STORY_RADIUS_METRES,
} from "@/lib/walk/constants";
import { drawDetour } from "@/lib/walk/detour";
import { dismissed, newMemory, step, type StepInput } from "@/lib/walk/engine";
import { isInRange, isUsableFix, placesInRange } from "@/lib/walk/proximity";
import type { WalkPlace } from "@/lib/walk/types";
import { MINUTE, ORIGIN, fixAt, northOf, walkPlace } from "../fixtures/walk";

const ALLOWANCE = 30;

describe("the 60 m trigger and the phone's own error", () => {
  const near = (metres: number, accuracy: number) =>
    placesInRange(fixAt(ORIGIN, accuracy), [walkPlace("p", northOf(ORIGIN, metres))], ALLOWANCE);

  it("is a named constant of 60 m", () => {
    expect(STORY_RADIUS_METRES).toBe(60);
  });

  it("brings a place in at 60 m and not a little past it", () => {
    expect(near(55, 10)).toHaveLength(1);
    expect(near(60, 0)).toHaveLength(1);
    expect(near(75, 10)).toHaveLength(0);
    expect(near(120, 10)).toHaveLength(0);
  });

  it("lets the phone's error help, up to the collection's allowance and no further", () => {
    // 80 m away, ±40 m: the reading may be 30 m off in our favour, so 50 m counts.
    expect(near(80, 40)).toHaveLength(1);
    // The same 80 m with a tight reading does not.
    expect(near(80, 10)).toHaveLength(0);
    // A wild reading cannot reach across the street: 100 m is 70 m after the allowance.
    expect(near(100, 100)).toHaveLength(0);
  });

  it("ignores a reading whose error is over the limit, however near the place looks", () => {
    expect(MAX_USABLE_ACCURACY_METRES).toBe(100);
    expect(near(5, MAX_USABLE_ACCURACY_METRES)).toHaveLength(1);
    expect(near(5, MAX_USABLE_ACCURACY_METRES + 1)).toHaveLength(0);
    expect(isUsableFix({ lat: NaN, lng: 1, accuracy: 5 })).toBe(false);
    expect(isUsableFix({ lat: 1, lng: 1, accuracy: Number.NaN })).toBe(false);
    expect(isUsableFix({ lat: 1, lng: 1, accuracy: -1 })).toBe(false);
  });

  it("is the collection's rule: distance less the allowed error, within the radius", () => {
    expect(isInRange(90, 30, ALLOWANCE)).toBe(true);
    expect(isInRange(91, 30, ALLOWANCE)).toBe(false);
    expect(isInRange(90, 500, ALLOWANCE)).toBe(true);
    expect(isInRange(91, 500, ALLOWANCE)).toBe(false);
  });

  it("lists the nearest first", () => {
    const places = [
      walkPlace("far", northOf(ORIGIN, 50)),
      walkPlace("near", northOf(ORIGIN, 10)),
      walkPlace("mid", northOf(ORIGIN, 30)),
    ];
    expect(placesInRange(fixAt(ORIGIN), places, ALLOWANCE).map((p) => p.place.slug)).toEqual([
      "near",
      "mid",
      "far",
    ]);
  });
});

/** A walk driven by hand: a memory, a clock in minutes and a fixed random source. */
function walkOf(places: readonly WalkPlace[], defaults: Partial<StepInput> = {}) {
  let memory = newMemory(0);
  return {
    get memory() {
      return memory;
    },
    dismiss() {
      memory = dismissed(memory);
    },
    at(minutes: number, pin = ORIGIN, extra: Partial<StepInput> = {}) {
      const result = step({
        memory,
        fix: fixAt(pin),
        now: minutes * MINUTE,
        places,
        accuracyAllowanceMetres: ALLOWANCE,
        soundOn: true,
        canSpeak: () => true,
        rng: mulberry32(1),
        ...defaults,
        ...extra,
      });
      memory = result.memory;
      return result;
    },
  };
}

describe("a place with a story", () => {
  it("shows a card inside 60 m and nothing outside it", () => {
    const walk = walkOf([walkPlace("a", ORIGIN, { story: true })]);
    expect(walk.at(0, northOf(ORIGIN, 150)).event).toBeNull();
    const event = walk.at(0.1, northOf(ORIGIN, 55)).event;
    expect(event).toMatchObject({ kind: "story", place: { slug: "a" }, speak: true });
  });

  it("never shows the same place twice on one walk, even after leaving and coming back", () => {
    const walk = walkOf([walkPlace("a", ORIGIN, { story: true })]);
    expect(walk.at(0).event?.kind).toBe("story");
    walk.dismiss();
    expect(walk.at(1).event).toBeNull();
    expect(walk.at(2, northOf(ORIGIN, 400)).event).toBeNull();
    expect(walk.at(3).event).toBeNull();
    expect(walk.at(60).event).toBeNull();
  });

  it("reads a card aloud at most once in two minutes, however many cards there are", () => {
    expect(SPOKEN_CARD_GAP_MS).toBe(2 * MINUTE);
    const places = [
      walkPlace("a", ORIGIN, { story: true }),
      walkPlace("b", northOf(ORIGIN, 500), { story: true }),
      walkPlace("c", northOf(ORIGIN, 1000), { story: true }),
    ];
    const walk = walkOf(places);
    expect(walk.at(0, places[0]!.pin).event).toMatchObject({ kind: "story", speak: true });
    walk.dismiss();
    // A minute later: the card shows, but it is not read.
    expect(walk.at(1, places[1]!.pin).event).toMatchObject({
      kind: "story",
      place: { slug: "b" },
      speak: false,
    });
    walk.dismiss();
    // A card that was only shown does not use up the gap, so two minutes after the last READ one
    // the next is read.
    expect(walk.at(2, places[2]!.pin).event).toMatchObject({
      kind: "story",
      place: { slug: "c" },
      speak: true,
    });
  });

  it("measures the gap from the last card that was read, to the millisecond", () => {
    const places = [
      walkPlace("a", ORIGIN, { story: true }),
      walkPlace("b", northOf(ORIGIN, 500), { story: true }),
    ];
    const early = walkOf(places);
    early.at(0, places[0]!.pin);
    early.dismiss();
    expect(early.at((SPOKEN_CARD_GAP_MS - 1) / MINUTE, places[1]!.pin).event).toMatchObject({
      speak: false,
    });

    const exact = walkOf(places);
    exact.at(0, places[0]!.pin);
    exact.dismiss();
    expect(exact.at(SPOKEN_CARD_GAP_MS / MINUTE, places[1]!.pin).event).toMatchObject({
      speak: true,
    });
  });

  it("is not read when sound is off, when there are no words, or when no local voice can read them", () => {
    const withWords = walkPlace("a", ORIGIN, { story: true });
    const noWords = walkPlace("b", ORIGIN, { hasStory: true });
    expect(noWords.snippet).toBeUndefined();
    expect(walkOf([withWords]).at(0, ORIGIN, { soundOn: false }).event).toMatchObject({
      kind: "story",
      speak: false,
    });
    expect(walkOf([noWords]).at(0).event).toMatchObject({ kind: "story", speak: false });
    const silent = walkOf([withWords]);
    expect(silent.at(0, ORIGIN, { canSpeak: () => false }).event).toMatchObject({ speak: false });
    // Not being read does not use up the gap.
    expect(silent.memory.lastSpokenAt).toBeNull();
  });

  it("holds the next card back while a story card is still on screen", () => {
    const walk = walkOf([
      walkPlace("near", ORIGIN, { story: true }),
      walkPlace("next-door", northOf(ORIGIN, 40), { story: true }),
    ]);
    expect(walk.at(0).event).toMatchObject({ place: { slug: "near" } });
    expect(walk.at(0.5).event).toBeNull();
    walk.dismiss();
    expect(walk.at(1).event).toMatchObject({ place: { slug: "next-door" } });
  });

  it("clears the card when the person walks off", () => {
    const walk = walkOf([walkPlace("a", ORIGIN, { story: true })]);
    walk.at(0);
    expect(walk.memory.slot).not.toBeNull();
    expect(walk.at(1, northOf(ORIGIN, CARD_LEAVE_METRES - 10)).slotCleared).toBe(false);
    expect(walk.at(2, northOf(ORIGIN, CARD_LEAVE_METRES + 10)).slotCleared).toBe(true);
    expect(walk.memory.slot).toBeNull();
  });

  it("does nothing on a reading it cannot trust", () => {
    const walk = walkOf([walkPlace("a", ORIGIN, { story: true })]);
    const before = walk.memory;
    const result = walk.at(0, ORIGIN, { fix: { ...ORIGIN, accuracy: 500 } });
    expect(result.event).toBeNull();
    expect(walk.memory).toBe(before);
  });
});

describe("a place nobody has written about", () => {
  it("is one nudge in twenty minutes", () => {
    expect(FIRST_STORY_NUDGE_GAP_MS).toBe(20 * MINUTE);
    const places = [
      walkPlace("n1", ORIGIN),
      walkPlace("n2", northOf(ORIGIN, 800)),
      walkPlace("n3", northOf(ORIGIN, 1600)),
    ];
    const walk = walkOf(places);
    expect(walk.at(0, places[0]!.pin).event).toMatchObject({
      kind: "first-story",
      place: { slug: "n1" },
    });
    expect(walk.at(10, places[1]!.pin).event).toBeNull();
    expect(walk.at(19.99, places[1]!.pin).event).toBeNull();
    expect(walk.at(20, places[1]!.pin).event).toMatchObject({
      kind: "first-story",
      place: { slug: "n2" },
    });
    // And again twenty minutes on, not before.
    expect(walk.at(39, places[2]!.pin).event).toBeNull();
    expect(walk.at(40, places[2]!.pin).event).toMatchObject({ place: { slug: "n3" } });
  });

  it("never comes while a story card is showing, and is not used up by waiting", () => {
    const walk = walkOf([
      walkPlace("story", ORIGIN, { story: true }),
      walkPlace("quiet", northOf(ORIGIN, 30)),
    ]);
    expect(walk.at(0).event).toMatchObject({ kind: "story" });
    expect(walk.at(1).event).toBeNull();
    expect(walk.memory.lastNudgeAt).toBeNull();
    walk.dismiss();
    expect(walk.at(2).event).toMatchObject({ kind: "first-story", place: { slug: "quiet" } });
  });

  it("gives way to a story card when a place with a story comes into range", () => {
    const walk = walkOf([
      walkPlace("quiet", ORIGIN),
      walkPlace("story", northOf(ORIGIN, 400), { story: true }),
    ]);
    expect(walk.at(0, ORIGIN).event?.kind).toBe("first-story");
    expect(walk.at(1, northOf(ORIGIN, 400)).event).toMatchObject({
      kind: "story",
      place: { slug: "story" },
    });
  });

  it("is not repeated for the same place", () => {
    const walk = walkOf([walkPlace("quiet", ORIGIN)]);
    expect(walk.at(0).event?.kind).toBe("first-story");
    expect(walk.at(25).event).toBeNull();
    expect(walk.at(50).event).toBeNull();
  });
});

describe("a detour, drawn on the phone", () => {
  const ring = (metres: number, slug = `d${metres}`, story = false) =>
    walkPlace(slug, northOf(ORIGIN, metres), { story });

  it("waits until the walk is five minutes old, then comes once in twenty minutes", () => {
    expect(DETOUR_FIRST_AFTER_MS).toBe(5 * MINUTE);
    expect(DETOUR_GAP_MS).toBe(20 * MINUTE);
    const walk = walkOf([ring(250, "a"), ring(300, "b"), ring(-250, "c")]);
    expect(walk.at(4.9).event).toBeNull();
    const first = walk.at(5).event;
    expect(first).toMatchObject({ kind: "detour" });
    walk.dismiss();
    expect(walk.at(6).event).toBeNull();
    expect(walk.at(24.9).event).toBeNull();
    const second = walk.at(25).event;
    expect(second).toMatchObject({ kind: "detour" });
    // A different place the second time.
    expect(second?.kind === "detour" && first?.kind === "detour" && second.place.slug).not.toBe(
      first?.kind === "detour" && first.place.slug,
    );
  });

  it("says how long it takes on foot", () => {
    const walk = walkOf([ring(240, "a")]);
    const event = walk.at(5).event;
    expect(event).toMatchObject({ kind: "detour", metres: 240 });
    // 240 m in a straight line, x1.3 for streets, at 80 m a minute: about 4 minutes.
    expect(event?.kind === "detour" && event.minutes).toBe(4);
  });

  it("is drawn only from places a short walk away", () => {
    expect(DETOUR_MIN_METRES).toBe(120);
    expect(DETOUR_MAX_METRES).toBe(400);
    const walk = walkOf([ring(90, "too-near"), ring(110, "just-too-near"), ring(450, "too-far")]);
    expect(walk.at(5).event).toBeNull();
    expect(walkOf([ring(125, "in")]).at(5).event).toMatchObject({ kind: "detour" });
    expect(walkOf([ring(395, "in")]).at(5).event).toMatchObject({ kind: "detour" });
  });

  it("does not interrupt a card on screen", () => {
    const walk = walkOf([walkPlace("here", ORIGIN, { story: true }), ring(250, "a")]);
    expect(walk.at(5).event).toMatchObject({ kind: "story" });
    expect(walk.at(6).event).toBeNull();
    walk.dismiss();
    expect(walk.at(7).event).toMatchObject({ kind: "detour" });
  });

  it("goes away on its own after ten minutes, and the place can still get its own card on arrival", () => {
    const walk = walkOf([ring(250, "a", true)]);
    expect(walk.at(5).event).toMatchObject({ kind: "detour", place: { slug: "a" } });
    expect(walk.at(5 + DETOUR_CARD_MS / MINUTE - 1).slotCleared).toBe(false);
    expect(walk.at(5 + DETOUR_CARD_MS / MINUTE).slotCleared).toBe(true);
    const arrival = walk.at(16, northOf(ORIGIN, 250));
    expect(arrival.event).toMatchObject({ kind: "story", place: { slug: "a" } });
  });

  it("leans toward a place nobody has written about, without ever shutting the others out", () => {
    const places = [ring(250, "with-story", true), ring(-250, "without-story", false)];
    const picks = { withStory: 0, withoutStory: 0 };
    const trials = 4000;
    for (let seed = 0; seed < trials; seed++) {
      const pick = drawDetour({
        fix: fixAt(ORIGIN),
        places,
        suggested: new Set(),
        rng: mulberry32(seed),
      });
      if (pick?.place.slug === "with-story") picks.withStory++;
      else picks.withoutStory++;
    }
    // Three to one in the odds (src/lib/draw/weights.ts NO_STORY_BOOST).
    const share = picks.withoutStory / trials;
    expect(share).toBeGreaterThan(0.72);
    expect(share).toBeLessThan(0.78);
    expect(picks.withStory).toBeGreaterThan(0);
  });

  it("does not suggest a place that already had a card on this walk", () => {
    const walk = walkOf([walkPlace("seen", ORIGIN, { story: true }), ring(250, "fresh")]);
    expect(walk.at(0).event).toMatchObject({ kind: "story", place: { slug: "seen" } });
    walk.dismiss();
    // From 250 m north of the start, "seen" is 250 m away: in the ring, but already had its card.
    const event = walk.at(6, northOf(ORIGIN, 250)).event;
    expect(event).toMatchObject({ kind: "first-story" });
    walk.dismiss();
    const second = walk.at(30, northOf(ORIGIN, 50)).event;
    expect(second).toBeNull();
  });

  it("never offers a place twice, and has nothing to say when there is nothing to offer", () => {
    const only = [ring(250, "only")];
    expect(
      drawDetour({
        fix: fixAt(ORIGIN),
        places: only,
        suggested: new Set(["only"]),
        rng: Math.random,
      }),
    ).toBeNull();
    expect(
      drawDetour({ fix: fixAt(ORIGIN), places: [], suggested: new Set(), rng: Math.random }),
    ).toBeNull();
    expect(
      drawDetour({ fix: fixAt(ORIGIN, 400), places: only, suggested: new Set(), rng: Math.random }),
    ).toBeNull();
  });

  it("is a pure function of the places, the reading and the random source", () => {
    const places = [ring(250, "a"), ring(-300, "b"), ring(320, "c", true)];
    const draw = () =>
      drawDetour({ fix: fixAt(ORIGIN), places, suggested: new Set(), rng: mulberry32(9) });
    expect(draw()).toEqual(draw());
  });
});
