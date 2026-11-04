/**
 * A name read for chain matching. `key` is the name with full-width and half-width forms folded (NFKC),
 * case folded, accents dropped from Latin names, and spaces, middle dots and punctuation removed, so
 * "ＨＡＲＤ OFF・OFF HOUSE" and "hardoffoffhouse" are one key. Katakana and hiragana stay apart: the key
 * of "ほんだらけ" never starts with the key of "ホンダ". `ends` holds the key positions where a word of
 * the written name ended: a brand that stops inside a Latin word does not match ("Gusto" is not
 * "Gustoso Pizza"), a brand that stops at the end of a word does.
 */
export type KeyedName = { key: string; ends: ReadonlySet<number> };

const SEPARATORS = /[\s\p{P}\p{S}]+/u;
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** One word of a name, folded; marks are stripped from Latin words only (が must stay が). */
function wordKey(word: string): string {
  const folded = word.normalize("NFKC").toLowerCase();
  return JAPANESE.test(folded) ? folded : folded.normalize("NFKD").replace(/\p{M}/gu, "");
}

export function keyedName(name: string): KeyedName {
  const ends = new Set<number>();
  let key = "";
  for (const word of name.normalize("NFKC").split(SEPARATORS)) {
    const part = wordKey(word);
    if (!part) continue;
    key += part;
    ends.add(key.length);
  }
  return { key, ends };
}

/** Length in characters (code points) of a key. */
export function keyLength(key: string): number {
  return [...key].length;
}

const LATIN_OR_DIGIT = /^[a-z0-9]$/u;

/**
 * Whether `name` starts with the brand key `prefix`: the whole name, or its beginning, at a place where a
 * Latin or numeric word has ended. Japanese text has no word breaks, so "ハードオフ大村店" starts with
 * "ハードオフ".
 */
export function startsWithBrandKey(name: KeyedName, prefix: string): boolean {
  if (prefix.length === 0 || !name.key.startsWith(prefix)) return false;
  if (name.key.length === prefix.length) return true;
  const last = prefix.slice(-1);
  const next = name.key.slice(prefix.length, prefix.length + 1);
  if (LATIN_OR_DIGIT.test(last) && LATIN_OR_DIGIT.test(next)) return name.ends.has(prefix.length);
  return true;
}
