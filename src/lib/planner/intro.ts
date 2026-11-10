// The one line of text the planner's model may write: a short logistics intro. A model's words
// about a place would need a footnote to a source (Principle V) and would drift toward ranking
// (Principle I), so this line is checked hard and only passes when it says nothing but numbers that
// are true, in plain sentences, without a name, a link, an opinion or any markup. If it fails, the
// page words the same facts itself (messages/planner.ts) and shows no AI text.
//
// This is a safety net with an honest limit: it can prove the numbers are right and keep the
// obvious ranking words out, not that a short sentence is free of every other claim. That is why the
// line stays this short and the page labels the result as picked by AI.

export const INTRO_MAX_CHARS = 220;
const MAX_SENTENCES = 3;

export type IntroFacts = {
  stops: number;
  totalMinutes: number;
  wildCards: number;
  /** Each leg's minutes, which the line may also mention. */
  legMinutes: readonly number[];
  /** Names of places the tools returned this turn. The line must not repeat one: the page shows them. */
  placeNames: readonly string[];
};

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const KANJI: Record<string, number> = {
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** Every number a sentence states: digits, English number words and kanji numerals up to 99. */
export function numbersIn(text: string): number[] {
  const normal = text.normalize("NFKC").toLowerCase();
  const found: number[] = [];
  let rest = normal;

  // Compound English numbers first ("twenty-five"), so they are not read as 20 and 5.
  rest = rest.replace(
    new RegExp(
      `\\b(${Object.keys(TENS).join("|")})[ -](${Object.keys(ONES).slice(1, 10).join("|")})\\b`,
      "g",
    ),
    (_match, tens: string, ones: string) => {
      found.push(TENS[tens]! + ONES[ones]!);
      return " ";
    },
  );
  rest = rest.replace(/\d+/g, (digits) => {
    found.push(Number(digits));
    return " ";
  });
  rest = rest.replace(
    new RegExp(`\\b(${[...Object.keys(ONES), ...Object.keys(TENS)].join("|")})\\b`, "g"),
    (word) => {
      found.push(ONES[word] ?? TENS[word]!);
      return " ";
    },
  );
  // Kanji numerals: 三, 十, 二十五, 十二.
  rest.replace(/[〇一二三四五六七八九十]+/g, (run) => {
    const ten = run.indexOf("十");
    if (ten === -1) {
      if (run.length === 1) found.push(KANJI[run]!);
      else found.push(Number([...run].map((ch) => KANJI[ch]!).join("")));
    } else {
      const before = run.slice(0, ten);
      const after = run.slice(ten + 1);
      found.push((before === "" ? 1 : KANJI[before]!) * 10 + (after === "" ? 0 : KANJI[after]!));
    }
    return " ";
  });
  return found;
}

// Words that rank, praise or promise. The tools say nothing like them, so a line with one is the
// model's own opinion. English is matched as whole words, Japanese as substrings.
const EN_BANNED = [
  "best",
  "top",
  "must",
  "popular",
  "famous",
  "favourite",
  "favorite",
  "recommend",
  "recommended",
  "rank",
  "ranked",
  "ranking",
  "perfect",
  "gem",
  "amazing",
  "beautiful",
  "delicious",
  "great",
  "wonderful",
  "lovely",
  "charming",
  "stunning",
  "rating",
  "rated",
  "score",
  "star",
  "stars",
  "hour",
  "hours",
  "hidden",
  "quiet",
  "authentic",
];
const JA_BANNED = [
  "おすすめ",
  "オススメ",
  "お勧め",
  "人気",
  "最高",
  "絶品",
  "必見",
  "有名",
  "一番",
  "ランキング",
  "素敵",
  "美しい",
  "美味",
  "時間",
  "評価",
  "星",
  "穴場",
];
const ENGLISH_BANNED = new RegExp(`\\b(${EN_BANNED.join("|")})\\b`, "i");

const MARKUP = /[<>[\]{}`*#@|\\]|https?:|www\.|\.[a-z]{2,}\/|\n|\r/i;

const squash = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s'’"“”.,・()（）-]+/g, "");

/** Whether a sentence is a safe logistics line for this walk. Returns the trimmed line, or null. */
export function checkIntro(text: string, facts: IntroFacts): string | null {
  const raw = text.trim();
  // A line break would make it two paragraphs, so look before they are folded into spaces.
  if (raw === "" || MARKUP.test(raw)) return null;
  const line = raw.replace(/\s+/g, " ");
  if (line.length > INTRO_MAX_CHARS) return null;
  const sentences = line.split(/[.!?。！？]+/).filter((part) => part.trim() !== "");
  if (sentences.length > MAX_SENTENCES) return null;
  if (ENGLISH_BANNED.test(line) || JA_BANNED.some((word) => line.includes(word))) return null;

  const allowed = new Set<number>([
    0,
    facts.stops,
    facts.totalMinutes,
    facts.wildCards,
    ...facts.legMinutes,
  ]);
  if (numbersIn(line).some((n) => !allowed.has(n))) return null;

  const flat = squash(line);
  for (const name of facts.placeNames) {
    const key = squash(name);
    if (key.length >= 3 && flat.includes(key)) return null;
  }
  return line;
}
