/** A run found by findRepeatedFragments; start and end are UTF-16 offsets, so text.slice(start, end) is `text`. */
export type RepeatedFragment = { start: number; end: number; text: string };

// The speech model sometimes writes a fragment twice back to back (今も今も). A person decides what
// the speaker said, so this only finds candidates to look at; nothing is ever removed, because
// people do repeat themselves on purpose.
//
// The rule is "a fragment of 2 to 8 Japanese characters repeated back to back", minus what Japanese
// spells that way on purpose, so the corrector is not shown a highlight on ordinary words:
//  - 1 character is never flagged: ここ, 時時 and the long runs in ああああ or ははは are spelling.
//  - kana-only fragments of up to 3 characters are never flagged: they are the reduplicated words
//    and mimetics (どんどん, いろいろ, もともと, ちょろちょろ, ひとつひとつ).
//  - fragments that start with a numeral are never flagged: 一つ一つ, 一人一人, 一歩一歩 are "each".
//  - a short list of idioms spelled with a repeat (知らず知らず) is never flagged.
// A longer or mixed-script fragment (今も今も, お客さんがお客さんが, そうですそうです) is a phrase, where
// an immediate repeat is not word formation. The list of exceptions is short on purpose: a word it
// misses costs the corrector one glance at a hint.
const MIN_UNIT = 2;
const MAX_UNIT = 8;
const JAPANESE = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]$/u;
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u;
const NUMERAL = /^[一二三四五六七八九十百千万〇0-9０-９]$/u;
const SPELLED_WITH_A_REPEAT = new Set([
  "知らず知らず",
  "代わる代わる",
  "見る見る",
  "泣く泣く",
  "行く行く",
  "思い思い",
  "日に日に",
]);

function japaneseRepeats(text: string): RepeatedFragment[] {
  const chars = Array.from(text);
  const offsets: number[] = [];
  let offset = 0;
  for (const char of chars) {
    offsets.push(offset);
    offset += char.length;
  }
  offsets.push(offset);
  const same = (from: number, unit: readonly string[]) =>
    unit.every((char, k) => chars[from + k] === char);

  const found: RepeatedFragment[] = [];
  for (let i = 0; i < chars.length;) {
    let stop = i;
    for (let length = MIN_UNIT; length <= MAX_UNIT && stop === i; length++) {
      const unit = chars.slice(i, i + length);
      if (
        unit.length < length ||
        !unit.every((char) => JAPANESE.test(char)) ||
        unit.every((char) => char === unit[0]) ||
        (unit.length <= 3 && unit.every((char) => KANA.test(char))) ||
        NUMERAL.test(unit[0]!) ||
        !same(i + length, unit)
      )
        continue;
      let end = i + 2 * length;
      while (same(end, unit)) end += length;
      if (end - i === 2 * length && SPELLED_WITH_A_REPEAT.has(chars.slice(i, end).join("")))
        continue;
      stop = end;
    }
    if (stop === i) {
      i++;
      continue;
    }
    found.push({
      start: offsets[i]!,
      end: offsets[stop]!,
      text: text.slice(offsets[i]!, offsets[stop]!),
    });
    i = stop;
  }
  return found;
}

// English: a word written twice, as in "the the". The doubles below are ordinary English, so they
// are left alone: grammatical ("had had", "that that", "is is") or spoken ("very very", "bye bye").
const ORDINARY_ENGLISH_DOUBLES = new Set(["had", "that", "is", "very", "no", "so", "bye", "ha"]);
const LATIN = String.raw`\p{Script=Latin}`;
const REPEATED_WORD = new RegExp(
  String.raw`(?<![${LATIN}\p{N}'’])(${LATIN}[${LATIN}'’]*)(?:\s+\1(?![${LATIN}\p{N}'’]))+`,
  "giu",
);

function englishRepeats(text: string): RepeatedFragment[] {
  const found: RepeatedFragment[] = [];
  for (const match of text.matchAll(REPEATED_WORD)) {
    const word = match[1]!.toLowerCase();
    const twice = match[0].split(/\s+/).length === 2;
    if (twice && ORDINARY_ENGLISH_DOUBLES.has(word)) continue;
    found.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return found;
}

/**
 * The fragments of a transcript segment that are written twice or more back to back, in order and
 * without overlap. Japanese units are 2 to 8 characters; English units are one word.
 */
export function findRepeatedFragments(text: string): RepeatedFragment[] {
  return [...japaneseRepeats(text), ...englishRepeats(text)].sort((a, b) => a.start - b.start);
}
