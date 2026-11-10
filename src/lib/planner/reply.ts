import { v, type Infer } from "convex/values";

// What the planner hands back to the page. Everything in here is either code's own output (the draw,
// walking times, the labels) or text copied word for word from a tool result: a place's names, a
// member's story with the writer's name, a found post's quote. The only words a model contributes are
// `intro` (a checked, short logistics line) and the choice of which quotes to show, and the page
// labels the result accordingly. See resolve.ts for how the model's answer is checked.

const bilingual = v.object({ en: v.string(), ja: v.string() });

export const placeValidator = v.object({
  slug: v.string(),
  /** English first, Japanese beside it: "Dejima Museum (出島資料館)". */
  name: v.string(),
  category: v.union(v.null(), v.object({ key: v.string(), en: v.string(), ja: v.string() })),
  neighbourhood: v.union(v.null(), v.object({ id: v.string(), en: v.string(), ja: v.string() })),
  hasStory: v.boolean(),
  /** A person has confirmed this place in person. Unconfirmed places are labelled as such. */
  confirmed: v.boolean(),
  demo: v.boolean(),
});

const translationValidator = v.object({
  language: v.string(),
  text: v.string(),
  origin: v.union(v.literal("machine"), v.literal("human")),
});

const sourceValidator = v.object({
  number: v.number(),
  words: v.string(),
  language: v.optional(v.string()),
  platform: v.optional(v.string()),
  author: v.optional(v.string()),
  link: v.string(),
  on: v.optional(v.string()),
});

/** Words someone wrote, as a tool returned them. Nothing in a quote is a model's. */
export const quoteValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("story"), v.literal("found"), v.literal("stitched"), v.literal("owner")),
  slug: v.string(),
  placeName: v.string(),
  text: v.string(),
  /** A stitched sentence also comes in Japanese; `text` is the English. */
  textJa: v.optional(v.string()),
  language: v.optional(v.string()),
  /** The writer's name, or a found post's author as the platform shows them. */
  by: v.optional(v.string()),
  on: v.optional(v.string()),
  link: v.optional(v.string()),
  platform: v.optional(v.string()),
  translations: v.array(translationValidator),
  /** For a stitched sentence: the exact words behind it, numbered. */
  sources: v.array(sourceValidator),
  postsRead: v.optional(v.number()),
  photoCredit: v.optional(v.string()),
  aiAssisted: v.boolean(),
  demo: v.boolean(),
  /** For an owner's caution: which topic it is about, in both languages. */
  topic: v.optional(bilingual),
});

export const whyValidator = v.union(
  v.object({ kind: v.literal("wild") }),
  v.object({ kind: v.literal("matched"), interests: v.array(v.string()) }),
  v.object({ kind: v.literal("random"), hadInterests: v.boolean() }),
);

export const stopValidator = v.object({
  place: placeValidator,
  why: whyValidator,
  minutes: v.number(),
  metres: v.number(),
  /** Where the leg starts: the previous stop's name, or the start. */
  from: v.string(),
  quotes: v.array(quoteValidator),
});

export const walkValidator = v.object({
  start: v.object({
    kind: v.union(v.literal("neighbourhood"), v.literal("place")),
    name: v.string(),
    slug: v.optional(v.string()),
  }),
  stops: v.array(stopValidator),
  asked: v.number(),
  totalMinutes: v.number(),
  wildCards: v.number(),
  rulesApplied: v.array(v.object({ tag: v.string(), checks: v.string(), limit: v.string() })),
  rulesNotChecked: v.array(v.object({ tag: v.string(), reason: v.string() })),
  interestsNotMatched: v.array(v.string()),
});

export const omikujiValidator = v.object({
  day: v.string(),
  area: v.union(v.null(), v.object({ id: v.string(), en: v.string(), ja: v.string() })),
  place: placeValidator,
  /** The slip's words, from Noren's template and not from AI. */
  slip: bilingual,
});

export const answerValidator = v.union(
  v.object({ kind: v.literal("quotes"), quotes: v.array(quoteValidator) }),
  v.object({
    kind: v.literal("notWritten"),
    /** The place to write about, when the question was about one. */
    place: v.optional(v.object({ slug: v.string(), name: v.string() })),
  }),
);

export const proposalValidator = v.object({
  id: v.string(),
  op: v.union(v.literal("add"), v.literal("remove")),
  kind: v.union(v.literal("rule"), v.literal("taste"), v.literal("visited")),
  text: v.string(),
  saidAs: v.string(),
});

export const replyValidator = v.object({
  /**
   * ai: the model's answer passed every check and its picks are shown.
   * plain: it did not, or it never answered; the draw is shown without any AI text (fail closed).
   * empty: there is nothing to show.
   */
  state: v.union(v.literal("ai"), v.literal("plain"), v.literal("empty")),
  /** A short logistics line, only when it passed the checks. The page words the plain version itself. */
  intro: v.union(v.null(), v.string()),
  /** The model could not tell where to start; the page asks. */
  needsStart: v.boolean(),
  walk: v.union(v.null(), walkValidator),
  omikuji: v.union(v.null(), omikujiValidator),
  answers: v.array(answerValidator),
  proposals: v.array(proposalValidator),
  /** How many of the model's picks were dropped because they did not match a tool result. */
  leftOut: v.number(),
  /** Whether any words on the page were picked by AI, so the page can say so. */
  pickedByAi: v.boolean(),
});

export type PlannerReply = Infer<typeof replyValidator>;
export type PlannerPlace = Infer<typeof placeValidator>;
export type PlannerQuote = Infer<typeof quoteValidator>;
export type PlannerStop = Infer<typeof stopValidator>;
export type PlannerWalk = Infer<typeof walkValidator>;
export type PlannerAnswer = Infer<typeof answerValidator>;
export type PlannerProposal = Infer<typeof proposalValidator>;
export type PlannerWhy = Infer<typeof whyValidator>;
