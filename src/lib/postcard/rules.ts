// The numbers and small pure rules of the trip postcard (specs/004-trip-postcard). Convex and the
// pages share them, so a limit is written once.

/** A card shows between one and this many places. */
export const MAX_PLACES = 8;
/** What the sender writes in the "for" field: a name or a relationship, a few words. */
export const RECIPIENT_MAX = 40;
/** The message the recipient reads. Plenty for a postcard, and it must fit one screen of a phone. */
export const MESSAGE_MAX = 1200;
/** The sender's own few words offered to the writing helper. */
export const NOTE_MAX = 300;
/** A story's words shown under its place on the card. */
export const EXCERPT_MAX = 160;
/** Cards one member may make in a day, and may keep at a time. */
export const CARDS_PER_DAY = 20;
export const CARDS_KEPT = 100;
/** Photos on the front of a card: the first photo of up to this many stories. */
export const FRONT_PHOTOS = 4;

/** Letters and digits with no look-alikes (no 0, 1, i, l, o), so a link read aloud survives. */
export const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
/** 24 characters of a 31-letter alphabet is about 119 bits: nobody finds a card by trying. */
export const CODE_LENGTH = 24;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function isPostcardCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/** A random code. `random` fills bytes with randomness; the default is the platform's. */
export function newPostcardCode(
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  // Bytes at or above this limit are thrown away, so every letter is equally likely.
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of random(new Uint8Array(CODE_LENGTH * 2))) {
      if (byte < limit) {
        code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        if (code.length === CODE_LENGTH) break;
      }
    }
  }
  return code;
}

/**
 * Text as a person typed it, made safe to keep and show: line breaks kept (at most one blank line
 * in a row), every other control or invisible-direction character dropped, ends trimmed.
 */
export function tidyText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(
      /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One line: a recipient's name, or a few words. Never a line break. */
export function tidyLine(raw: string): string {
  return tidyText(raw).replace(/\s+/g, " ");
}

/** Characters as a reader counts them (an emoji or kanji is one), which is what the limits mean. */
export function lengthOf(text: string): number {
  return Array.from(text).length;
}

export function cut(text: string, limit: number): string {
  const characters = Array.from(text);
  return characters.length <= limit
    ? text
    : `${characters
        .slice(0, limit - 1)
        .join("")
        .trimEnd()}…`;
}

/** The day in the region's own clock, written out in the card's language. */
export function cardDate(sentAt: number, offsetHours: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(sentAt + offsetHours * 3_600_000),
  );
}
