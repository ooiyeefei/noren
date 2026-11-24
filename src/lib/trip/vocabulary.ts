import {
  RULE_PRESETS,
  TASTE_PRESETS,
  type Bilingual,
  type Locale,
} from "../memory/vocabulary";
import type { AgeBand, Fullness, NeedKind } from "./types";

// The words a party uses on a trip: hard rules, needs, tastes, age bands and how full a day is.
// Labels are plain practical choices. None names a diagnosis, a disability, a religion or a reason
// (FR-304): a person says what they need, never why.
//
// Japanese wording awaits a native speaker's review, like the rest of the Japanese copy.

export type RuleScope = "food" | "any";

export type TripRuleTag = {
  tag: string;
  label: Bilingual;
  /** "food": checked only at a stop whose category is one of the region's food categories. */
  scope: RuleScope;
};

/** A label already worded for the memory vocabulary, reused rather than copied. */
function presetLabel(tag: string): Bilingual {
  const preset = RULE_PRESETS.find((candidate) => candidate.tag === tag);
  if (preset === undefined) throw new Error(`No memory preset for rule tag ${tag}`);
  return preset.label;
}

export const TRIP_RULES: readonly TripRuleTag[] = [
  { tag: "step-free", label: { en: "No stairs", ja: "階段なし" }, scope: "any" },
  { tag: "short-walks", label: { en: "Short walks only", ja: "歩くのは短めに" }, scope: "any" },
  {
    tag: "sit-often",
    label: { en: "Somewhere to sit often", ja: "よく座れる場所" },
    scope: "any",
  },
  { tag: "quiet", label: { en: "Somewhere quiet", ja: "静かな場所" }, scope: "any" },
  { tag: "toilet-near", label: { en: "A toilet close by", ja: "近くにトイレ" }, scope: "any" },
  {
    tag: "high-chair",
    label: { en: "A high chair at meals", ja: "食事にベビーチェア" },
    scope: "food",
  },
  { tag: "pork-free", label: presetLabel("pork-free"), scope: "food" },
  { tag: "vegetarian", label: presetLabel("vegetarian"), scope: "food" },
  { tag: "vegan", label: presetLabel("vegan"), scope: "food" },
  { tag: "halal", label: presetLabel("halal"), scope: "food" },
  { tag: "no-alcohol", label: presetLabel("no-alcohol"), scope: "any" },
];

export const NEED_KINDS: readonly { kind: NeedKind; label: Bilingual }[] = [
  { kind: "prayer", label: { en: "A place to pray", ja: "お祈りの場所" } },
  { kind: "work", label: { en: "A place to work", ja: "仕事ができる場所" } },
  { kind: "rest", label: { en: "A place to rest", ja: "休める場所" } },
];

/** Likes and skips are the same tastes the rest of the app uses. */
export const TRIP_TASTES = TASTE_PRESETS.map((taste) => ({ tag: taste.key, label: taste.label }));

export const AGE_BANDS: readonly { band: AgeBand; label: Bilingual }[] = [
  { band: "baby", label: { en: "Baby", ja: "赤ちゃん" } },
  { band: "toddler", label: { en: "Toddler", ja: "幼児" } },
  { band: "child", label: { en: "Child", ja: "子ども" } },
  { band: "teen", label: { en: "Teenager", ja: "10代" } },
  { band: "adult", label: { en: "Adult", ja: "大人" } },
  { band: "older", label: { en: "Older adult", ja: "シニア" } },
];

export const FULLNESS_LEVELS: readonly { level: Fullness; label: Bilingual }[] = [
  { level: "light", label: { en: "Light", ja: "ゆったり" } },
  { level: "steady", label: { en: "Steady", ja: "ほどよく" } },
  { level: "full", label: { en: "Full", ja: "たっぷり" } },
];

export function isRuleTag(tag: string): boolean {
  return TRIP_RULES.some((rule) => rule.tag === tag);
}

/** The scope of a known rule tag; undefined for a tag that is not one. */
export function ruleScope(tag: string): RuleScope | undefined {
  return TRIP_RULES.find((rule) => rule.tag === tag)?.scope;
}

/** The label of a known rule tag in a language; the tag itself when it is not known. */
export function ruleTagLabel(tag: string, locale: Locale): string {
  return TRIP_RULES.find((rule) => rule.tag === tag)?.label[locale] ?? tag;
}

export function needLabel(kind: NeedKind, locale: Locale): string {
  return NEED_KINDS.find((need) => need.kind === kind)?.label[locale] ?? kind;
}

export function ageBandLabel(band: AgeBand, locale: Locale): string {
  return AGE_BANDS.find((entry) => entry.band === band)?.label[locale] ?? band;
}

export function fullnessLabel(level: Fullness, locale: Locale): string {
  return FULLNESS_LEVELS.find((entry) => entry.level === level)?.label[locale] ?? level;
}

type QuestionEffect = {
  kind: "rule" | "like" | "skip" | "rhythm" | "limit";
  tag: string;
  minutes?: number;
};

/** The organiser chooses whom the question concerns. An omitted effect leaves their choices as they are. */
export const TRIP_QUESTIONS: readonly {
  id: string;
  ifYes: QuestionEffect;
  ifNo?: QuestionEffect;
}[] = [
  // Would steps at the entrance stop someone coming in?
  { id: "entrance-steps", ifYes: { kind: "rule", tag: "step-free" } },
  // Would a ten-minute walk uphill be too far?
  { id: "short-walk", ifYes: { kind: "rule", tag: "short-walks" } },
  // Would someone need a seat during a half-hour visit?
  { id: "seat-during-visit", ifYes: { kind: "rule", tag: "sit-often" } },
  // Would a lunch stop with no toilet nearby be a problem?
  { id: "toilet-at-lunch", ifYes: { kind: "rule", tag: "toilet-near" } },
  // Would a busy indoor dining room make lunch difficult?
  { id: "quiet-lunch", ifYes: { kind: "rule", tag: "quiet" } },
  // Would a meal without a high chair be hard to manage?
  { id: "high-chair-at-meals", ifYes: { kind: "rule", tag: "high-chair" } },
  // Does anyone need half an hour to lie down after lunch?
  { id: "after-lunch-rest", ifYes: { kind: "rhythm", tag: "after-lunch", minutes: 30 } },
  // Is a two-hour drive without a break too long?
  {
    id: "stretch-break",
    ifYes: { kind: "limit", tag: "stretch", minutes: 90 },
    ifNo: { kind: "limit", tag: "stretch", minutes: 120 },
  },
  // Would four hours total in the car in a day be too much?
  {
    id: "daily-driving",
    ifYes: { kind: "limit", tag: "dayDrive", minutes: 180 },
    ifNo: { kind: "limit", tag: "dayDrive", minutes: 240 },
  },
  // On a spare afternoon, would they choose a garden over a history museum?
  {
    id: "garden-or-museum",
    ifYes: { kind: "like", tag: "nature" },
    ifNo: { kind: "like", tag: "history" },
  },
];
