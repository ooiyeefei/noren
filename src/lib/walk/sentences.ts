// The first sentence or two of a story, word for word. Plain functions with relative imports only,
// because the Convex query that prepares walk mode's snippets (convex/walk.ts) uses them too.

/** Closing quotes and brackets that stay with the sentence they close. */
const CLOSERS = new Set(['"', "'", "”", "’", "」", "』", "）", ")", "]", "】"]);
const CJK_END = new Set(["。", "！", "？", "．"]);
const LATIN_END = new Set([".", "!", "?"]);
/** Words that end in a full stop without ending the sentence ("Mr. Tanaka runs this cafe."). */
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "no", "vs", "jr", "sr", "mt", "ft"]);

/** Where each sentence of `text` (whitespace already collapsed) stops: the index after its last character. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    const cjk = CJK_END.has(char);
    const latin = LATIN_END.has(char);
    if (!cjk && !latin) {
      i++;
      continue;
    }
    // Take the whole run of stops ("?!", "...") and the quotes that close with it.
    let end = i + 1;
    while (end < text.length && (CJK_END.has(text[end]!) || LATIN_END.has(text[end]!))) end++;
    while (end < text.length && CLOSERS.has(text[end]!)) end++;
    const atBreak = end >= text.length || text[end] === " ";
    if (cjk) {
      ends.push(end);
    } else if (atBreak) {
      let stop = true;
      if (char === ".") {
        const word = /([A-Za-z]+)$/.exec(text.slice(Math.max(0, i - 6), i))?.[1] ?? "";
        // "Mr." and "J. K." are not the end of a sentence.
        if (ABBREVIATIONS.has(word.toLowerCase()) || (word.length === 1 && /[A-Z]/.test(word)))
          stop = false;
      }
      if (stop) ends.push(end);
    }
    i = end;
  }
  if (ends.length === 0 || ends[ends.length - 1]! < text.length) ends.push(text.length);
  return ends;
}

export type FirstSentences = {
  /** A prefix of the original words, with runs of white space made single spaces. */
  text: string;
  /** Something was left out, so a reader should be told there is more. */
  more: boolean;
};

/**
 * The first `maxSentences` sentences, as long as they fit in `maxChars`. If even the first sentence
 * is longer, it is cut at a word and ends with an ellipsis. Never rewrites a word: the result is
 * always the start of what was written.
 */
export function firstSentences(
  raw: string,
  options: { maxSentences?: number; maxChars?: number } = {},
): FirstSentences {
  const { maxSentences = 2, maxChars = 300 } = options;
  const text = raw.replace(/\s+/g, " ").trim();
  if (text === "") return { text: "", more: false };
  const ends = sentenceEnds(text);
  let cut = 0;
  for (const end of ends.slice(0, Math.max(1, maxSentences))) {
    if (end > maxChars) break;
    cut = end;
  }
  if (cut === 0) {
    // The first sentence alone is too long.
    const window = text.slice(0, maxChars);
    const space = window.lastIndexOf(" ");
    const clipped = (space > maxChars * 0.6 ? window.slice(0, space) : window).trimEnd();
    return { text: `${clipped}…`, more: true };
  }
  return { text: text.slice(0, cut).trimEnd(), more: cut < text.length };
}
