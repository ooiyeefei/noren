/** The two picture sizes Instagram takes: a story and a feed post. */
export const CARD_SIZES = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

export function isCardSize(value: unknown): value is CardSize {
  return value === "story" || value === "feed";
}

export const SITE = "noren.yooi.me";

const PADDING = 88;
const HEADER = 300;
const FOOTER = 150;
const GAP = 44;
const LINE_HEIGHT = 1.6;
const FONT_SIZES = [72, 64, 56, 48, 42, 36, 32] as const;
const PHOTO_HEIGHT: Record<CardSize, number> = { story: 640, feed: 380 };

/** The room for the photo and the words, in pixels. */
export function cardLayout(size: CardSize, hasPhoto: boolean) {
  const { width, height } = CARD_SIZES[size];
  const photoHeight = hasPhoto ? PHOTO_HEIGHT[size] : 0;
  return {
    width,
    height,
    padding: PADDING,
    header: HEADER,
    footer: FOOTER,
    gap: GAP,
    photoHeight,
    textWidth: width - 2 * PADDING,
    textHeight: height - 2 * PADDING - HEADER - FOOTER - (hasPhoto ? photoHeight + GAP : 0) - GAP,
  };
}

/** The room the "read it all" line takes under words that were cut. */
export const CUT_NOTE_HEIGHT = 56;

/** A Japanese character fills its square; Latin letters, in this face, a little over half of it. */
function widthUnits(text: string): number {
  let units = 0;
  for (const char of text) units += char.charCodeAt(0) < 0x2e80 ? 0.6 : 1;
  return units;
}

function linesNeeded(text: string, fontSize: number, width: number): number {
  const perLine = Math.floor(width / fontSize);
  return text.split("\n").reduce(
    // Words wrap early, so the real count runs a little above the arithmetic one.
    (lines, paragraph) =>
      lines + Math.max(1, Math.ceil((widthUnits(paragraph) * 1.1) / Math.max(1, perLine))),
    0,
  );
}

/**
 * The largest type that holds the whole story in the room there is. Where even the smallest does
 * not, the words are cut at a space or a character and end with an ellipsis; the full story stays
 * on Noren, and the card says where.
 */
export function fitBody(
  body: string,
  size: CardSize,
  hasPhoto: boolean,
): { text: string; fontSize: number; lineHeight: number; cut: boolean } {
  const { textWidth, textHeight } = cardLayout(size, hasPhoto);
  const text = body.trim();
  const fits = (candidate: string, fontSize: number, room = textHeight) =>
    linesNeeded(candidate, fontSize, textWidth) * fontSize * LINE_HEIGHT <= room;
  for (const fontSize of FONT_SIZES)
    if (fits(text, fontSize)) return { text, fontSize, lineHeight: LINE_HEIGHT, cut: false };
  const fontSize = FONT_SIZES[FONT_SIZES.length - 1]!;
  const chars = [...text];
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      fits(`${chars.slice(0, middle).join("").trimEnd()}…`, fontSize, textHeight - CUT_NOTE_HEIGHT)
    )
      low = middle;
    else high = middle - 1;
  }
  const kept = chars.slice(0, low).join("").trimEnd();
  return { text: `${kept}…`, fontSize, lineHeight: LINE_HEIGHT, cut: true };
}

/** Where the picture route lives. */
export function cardPath(storyId: string, size: CardSize, download = false): string {
  return `/api/share/${encodeURIComponent(storyId)}?size=${size}${download ? "&download=1" : ""}`;
}

export function cardFileName(size: CardSize): string {
  return `noren-story-${size}.png`;
}

/**
 * The place's name in English with the Japanese beside it when both fit on one line, else one
 * above the other. Each line is sized to fit the width; the smallest size ends in an ellipsis.
 */
export function fitPlace(
  english: string,
  japanese: string | null,
  width: number,
): {
  beside: boolean;
  englishSize: number;
  japaneseSize: number;
} {
  const room = (text: string, sizes: readonly number[]) =>
    sizes.find((size) => widthUnits(text) * size <= width) ?? sizes[sizes.length - 1]!;
  if (japanese === null)
    return { beside: false, englishSize: room(english, [68, 60, 52, 44]), japaneseSize: 0 };
  const gap = 28;
  for (const [englishSize, japaneseSize] of [
    [60, 46],
    [52, 40],
  ] as const)
    if (widthUnits(english) * englishSize + gap + widthUnits(japanese) * japaneseSize <= width)
      return { beside: true, englishSize, japaneseSize };
  return {
    beside: false,
    englishSize: room(english, [64, 56, 48, 40]),
    japaneseSize: room(japanese, [48, 42, 36, 30]),
  };
}
