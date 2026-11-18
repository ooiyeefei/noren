import { MAX_PLACES } from "./rules";

// What the postcard form keeps and decides, away from the screen so it can be tested.

export type MomentLike = {
  kind: "story" | "stamp";
  storyId?: string;
  placeId: string;
};

/** One moment's identity in the form: a story, or a place's stamp. */
export function momentKey(moment: MomentLike): string {
  return moment.kind === "story" ? `story:${moment.storyId}` : `stamp:${moment.placeId}`;
}

export type FormState = {
  picked: string[];
  recipient: string;
  note: string;
  message: string;
  lang: string;
  /** The message began as a draft from the writing helper. Cleared only when the text is emptied. */
  aiUsed: boolean;
  /** The last draft put in the box, so a new one may replace it only while it is untouched. */
  lastDraft: string;
};

export const EMPTY_FORM: FormState = {
  picked: [],
  recipient: "",
  note: "",
  message: "",
  lang: "",
  aiUsed: false,
  lastDraft: "",
};

/** Whether this moment may be ticked now: the card has room, and no other pick is at its place. */
export function canPick(
  moment: MomentLike,
  picked: readonly MomentLike[],
): { ok: true } | { ok: false; why: "full" | "samePlace" } {
  if (picked.some((each) => momentKey(each) === momentKey(moment))) return { ok: true };
  if (picked.length >= MAX_PLACES) return { ok: false, why: "full" };
  if (picked.some((each) => each.placeId === moment.placeId))
    return { ok: false, why: "samePlace" };
  return { ok: true };
}

/** The picks in the order the member sees them (newest first), as the server takes them. */
export function itemsOf<S extends string, P extends string>(
  picked: readonly { kind: "story" | "stamp"; storyId?: S; placeId: P }[],
): ({ kind: "story"; storyId: S } | { kind: "stamp"; placeId: P })[] {
  return picked.map((moment) =>
    moment.kind === "story" && moment.storyId !== undefined
      ? { kind: "story" as const, storyId: moment.storyId }
      : { kind: "stamp" as const, placeId: moment.placeId },
  );
}

/**
 * Whether a new draft may go straight into the box: it is empty, or still exactly the last draft, so
 * nothing the member typed is lost. Otherwise the member is asked.
 */
export function mayReplace(state: Pick<FormState, "message" | "lastDraft">): boolean {
  return state.message.trim() === "" || state.message === state.lastDraft;
}

/** The ConvexError code in an error, for branching. The message is redacted in production, so it is never read. */
export function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const { data } = error;
  if (typeof data === "object" && data !== null && "code" in data && typeof data.code === "string")
    return data.code;
  return null;
}

export function postcardUrl(origin: string, lang: string, code: string): string {
  return `${origin}/${lang}/postcard/${encodeURIComponent(code)}`;
}
