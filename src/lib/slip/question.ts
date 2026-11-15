// The relay question: a line a writer leaves for the next visitor, and the places it can be asked.
// Pure functions only. This file is imported by Convex, so it uses relative imports.

import { keyedUniform } from "../draw/rng";
import { contactIn } from "../story-finder/mention";
import { STAFFED_CATEGORIES, STARTER_QUESTIONS, type StarterQuestion } from "./starter-questions";

export const QUESTION_LIMIT = 140;

export type QuestionCheck =
  { ok: true; text: string } | { ok: false; reason: "empty" | "long" | "contact" };

/**
 * A typed question made fit to store: whitespace and line breaks collapse to single spaces, then it
 * must be 1 to 140 characters and carry no web address, email address, @handle or phone number.
 * The question is never translated and never goes to any AI service.
 */
export function cleanQuestion(raw: string): QuestionCheck {
  const text = raw.replace(/\s+/gu, " ").trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (text.length > QUESTION_LIMIT) return { ok: false, reason: "long" };
  if (contactIn(text) !== null) return { ok: false, reason: "contact" };
  return { ok: true, text };
}

/** What a story says it answers: another story's question at the same place, or a starter. */
export type AnswerRef = { kind: "story"; storyId: string } | { kind: "starter"; key: string };

export function starterByKey(key: string): StarterQuestion | undefined {
  return STARTER_QUESTIONS.find((entry) => entry.key === key);
}

export function isStarterKey(key: string): boolean {
  return starterByKey(key) !== undefined;
}

/** The starter question's words in a language (anything but Japanese reads the English). */
export function starterText(key: string, locale: string): string | undefined {
  const entry = starterByKey(key);
  return entry === undefined ? undefined : locale === "ja" ? entry.ja : entry.en;
}

/** Convex ids are letters and digits; this only keeps obvious junk out of the address's parameter. */
const ID_SHAPE = /^[a-z0-9]{8,64}$/iu;

/**
 * Reads the `answers` parameter of a place page link: `story:<id>` or `starter:<key>`. Anything else,
 * including a starter key that is not on the list, is null. A story id is only checked for shape
 * here; whether it is a question at this place is checked where the stories are.
 */
export function parseAnswers(raw: string | null | undefined): AnswerRef | null {
  if (typeof raw !== "string") return null;
  const colon = raw.indexOf(":");
  if (colon < 0) return null;
  const kind = raw.slice(0, colon);
  const rest = raw.slice(colon + 1);
  if (kind === "story") return ID_SHAPE.test(rest) ? { kind, storyId: rest } : null;
  if (kind === "starter") return isStarterKey(rest) ? { kind, key: rest } : null;
  return null;
}

/** The `answers` parameter for a link; the reverse of parseAnswers. */
export function answersParam(ref: AnswerRef): string {
  return ref.kind === "story" ? `story:${ref.storyId}` : `starter:${ref.key}`;
}

/**
 * The starter question for a place. Staffed categories draw from every question; others from the
 * ones that work anywhere. The place's id picks it, so it is the same one every day and for everyone.
 */
export function starterFor(placeId: string, category: string | undefined): StarterQuestion {
  const staffed = category !== undefined && STAFFED_CATEGORIES.includes(category);
  const pool = STARTER_QUESTIONS.filter((entry) => staffed || entry.for === "any");
  const index = Math.min(
    pool.length - 1,
    Math.floor(keyedUniform("slip-starter", placeId) * pool.length),
  );
  return pool[index]!;
}

export type AskedStory = { id: string; addedAt: number; nextQuestion?: string | undefined };

/** The newest story that has a question. Pass only stories that are shown. */
export function newestAsked<T extends AskedStory>(
  stories: readonly T[],
): (T & { nextQuestion: string }) | undefined {
  let newest: (T & { nextQuestion: string }) | undefined;
  for (const story of stories) {
    if (story.nextQuestion === undefined || story.nextQuestion === "") continue;
    if (newest === undefined || story.addedAt > newest.addedAt)
      newest = story as T & { nextQuestion: string };
  }
  return newest;
}

export type OpenQuestion =
  { kind: "starter"; key: string } | { kind: "story"; storyId: string; text: string };

/**
 * A place's open question: the newest shown story's question here, or else the place's starter.
 * `shown` is the place's stories that are shown (any order).
 */
export function openQuestion(input: {
  placeId: string;
  category: string | undefined;
  shown: readonly AskedStory[];
}): OpenQuestion {
  const asked = newestAsked(input.shown);
  if (asked !== undefined) return { kind: "story", storyId: asked.id, text: asked.nextQuestion };
  return { kind: "starter", key: starterFor(input.placeId, input.category).key };
}
