import { normalizeName } from "../overture/dedupe";

// Matching what a person types against place names, in English, Japanese or romaji.
//
// normalizeName already folds width, case, accents, punctuation and katakana/hiragana. This adds
// the one thing it cannot: a romaji search such as "kamera" finding カメラ. The conversion is a
// plain Hepburn-style table. It is a best effort for search, never shown to anyone.

const BASIC: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  ゐ: "i",
  ゑ: "e",
  を: "o",
  ん: "n",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゔ: "vu",
};

// A small kana after an "i" column kana makes one sound: き + ゃ = kya.
const SMALL_Y: Record<string, string> = { ゃ: "ya", ゅ: "yu", ょ: "yo" };
const COMBINED: Record<string, string> = {
  し: "sh",
  ち: "ch",
  じ: "j",
  ぢ: "j",
};

/** Hiragana (and the long-vowel mark) to Hepburn-style romaji. Other characters pass through. */
export function kanaToRomaji(text: string): string {
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    const next = chars[i + 1];
    if (char === "っ") {
      // A small tsu doubles the next consonant.
      const following = next === undefined ? "" : (BASIC[next] ?? "");
      out += following.startsWith("ch") ? "t" : (following[0] ?? "");
      continue;
    }
    if (char === "ー") {
      out += out.at(-1) ?? "";
      continue;
    }
    const base = BASIC[char];
    if (base === undefined) {
      out += char;
      continue;
    }
    if (next !== undefined && SMALL_Y[next] !== undefined && base.endsWith("i")) {
      const stem = COMBINED[char];
      out +=
        stem === undefined
          ? `${base.slice(0, -1)}${SMALL_Y[next]}`
          : `${stem}${SMALL_Y[next]!.slice(1)}`;
      i++;
      continue;
    }
    out += base;
  }
  return out;
}

/** A name or search word reduced to what can be compared: see normalizeName. */
export const fold = normalizeName;

/**
 * Every comparable form of one name: itself folded, and, if it has kana, the romaji of that kana.
 * 「かめら」 and 「カメラ」 both give "かめら" and "kamera".
 */
export function searchForms(name: string): string[] {
  const folded = fold(name);
  const forms = [folded];
  const romaji = kanaToRomaji(folded);
  if (romaji !== folded) forms.push(romaji);
  return forms;
}

/** Splits a search into words. A word of Japanese with no spaces stays one word. */
export function searchWords(query: string): string[] {
  return query
    .split(/[\s,、]+/u)
    .map(fold)
    .filter((word) => word !== "");
}
