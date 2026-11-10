import { MAX_LABEL_LENGTH } from "./constants";

// The words a visitor can use for a rule or a taste, and how each one reaches the draw. A hard rule
// goes to the draw as an "avoid" tag (src/lib/draw/rules.ts). Whether Noren can check it against real
// data is the draw's call and is shown to the visitor as it answers. A taste goes as an interest.
//
// Japanese wording awaits a native speaker's review, like the rest of the Japanese copy.

export type Bilingual = { en: string; ja: string };
export type Locale = keyof Bilingual;

export type RuleKind = "diet" | "allergy" | "mobility" | "budget" | "other";

type RulePreset = {
  key: string;
  kind: Exclude<RuleKind, "allergy" | "other">;
  /** The tag the draw receives. */
  tag: string;
  label: Bilingual;
  /** Words that mean this rule when a visitor types or says them. */
  words: readonly string[];
};

export const RULE_PRESETS: readonly RulePreset[] = [
  {
    key: "vegetarian",
    kind: "diet",
    tag: "vegetarian",
    label: { en: "Vegetarian", ja: "ベジタリアン" },
    words: ["vegetarian", "veggie", "ベジタリアン", "菜食"],
  },
  {
    key: "vegan",
    kind: "diet",
    tag: "vegan",
    label: { en: "Vegan", ja: "ビーガン" },
    words: ["vegan", "ビーガン", "完全菜食"],
  },
  {
    key: "halal",
    kind: "diet",
    tag: "halal",
    label: { en: "Halal", ja: "ハラール" },
    words: ["halal", "ハラール", "ハラル"],
  },
  {
    key: "no-pork",
    kind: "diet",
    tag: "pork-free",
    label: { en: "No pork", ja: "豚肉なし" },
    words: [
      "no pork",
      "pork free",
      "pork-free",
      "without pork",
      "豚肉なし",
      "豚肉抜き",
      "豚肉を食べない",
    ],
  },
  {
    key: "no-alcohol",
    kind: "diet",
    tag: "no-alcohol",
    label: { en: "No alcohol", ja: "お酒なし" },
    words: [
      "no alcohol",
      "alcohol free",
      "alcohol-free",
      "teetotal",
      "お酒なし",
      "酒なし",
      "お酒は飲まない",
    ],
  },
  {
    key: "step-free",
    kind: "mobility",
    tag: "step-free",
    label: { en: "Step-free", ja: "段差なし" },
    words: [
      "step free",
      "step-free",
      "no steps",
      "no stairs",
      "wheelchair",
      "段差なし",
      "車いす",
      "車椅子",
    ],
  },
  {
    key: "short-walks",
    kind: "mobility",
    tag: "short-walks",
    label: { en: "Short walks", ja: "歩く距離は短め" },
    words: ["short walks", "short walk", "cannot walk far", "歩く距離は短め", "あまり歩けない"],
  },
  {
    key: "low-budget",
    kind: "budget",
    tag: "low-budget",
    label: { en: "Low budget", ja: "予算は控えめ" },
    words: [
      "low budget",
      "tight budget",
      "on a budget",
      "cheap",
      "予算は控えめ",
      "予算控えめ",
      "節約",
    ],
  },
];

/** A phrase compared without case, width, accents or loose punctuation. */
export function canon(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’'`´"“”.,!?、。！？:：;；()（）[\]]/g, "")
    .replace(/[-_\s]+/g, " ")
    .trim();
}

export type RuleDraft = { kind: RuleKind; tag: string; label: string };

/** The lowest-effort tag for a phrase the vocabulary does not know. */
function tagOf(text: string): string {
  return canon(text).replace(/\s+/g, "-").slice(0, MAX_LABEL_LENGTH);
}

const ALLERGY_PATTERNS: readonly RegExp[] = [
  /^(?:i am |im )?allergic to (.+)$/,
  /^(?:i have )?(?:an? )?allergy to (.+)$/,
  /^allergy (.+)$/,
  /^(.+) allergy$/,
  /^アレルギー (.+)$/,
  /^(.+?)の?アレルギー(?:あり)?$/,
];

/** The allergen in a phrase such as "allergic to peanuts" or "ピーナッツアレルギー", if there is one. */
export function allergenIn(text: string): string | null {
  const phrase = canon(text);
  for (const pattern of ALLERGY_PATTERNS) {
    const found = pattern.exec(phrase)?.[1]?.trim();
    if (found && found.length <= MAX_LABEL_LENGTH - 10) return found;
  }
  return null;
}

function presetFor(text: string): RulePreset | undefined {
  const phrase = canon(text);
  let best: { preset: RulePreset; length: number } | undefined;
  for (const preset of RULE_PRESETS) {
    for (const word of preset.words) {
      const needle = canon(word);
      const hit = phrase === needle || (needle.length >= 3 && phrase.includes(needle));
      if (hit && (best === undefined || needle.length > best.length)) {
        best = { preset, length: needle.length };
      }
    }
  }
  return best?.preset;
}

/**
 * What a typed or spoken phrase means as a hard rule: a preset, an allergy by name, or - for
 * anything else - the phrase itself, which the draw will say it cannot check. Null for a blank or
 * overlong phrase.
 */
export function ruleFromText(text: string): RuleDraft | null {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed === "" || trimmed.length > MAX_LABEL_LENGTH * 2) return null;
  const allergen = allergenIn(trimmed);
  if (allergen !== null) {
    return { kind: "allergy", tag: `allergy:${tagOf(allergen)}`, label: allergen };
  }
  const preset = presetFor(trimmed);
  if (preset !== undefined) return { kind: preset.kind, tag: preset.tag, label: preset.label.en };
  if (trimmed.length > MAX_LABEL_LENGTH) return null;
  return { kind: "other", tag: tagOf(trimmed), label: trimmed };
}

/** How a rule reads on screen, in the visitor's language. */
export function ruleLabel(
  rule: { kind: RuleKind; tag: string; label: string },
  locale: Locale,
  allergyPrefix: string,
): string {
  if (rule.kind === "allergy") return `${allergyPrefix}${rule.label}`;
  const preset = RULE_PRESETS.find((candidate) => candidate.tag === rule.tag);
  return preset === undefined ? rule.label : preset.label[locale];
}

type TastePreset = {
  /** The interest tag the draw receives (src/lib/draw/rules.ts resolves it to categories). */
  key: string;
  label: Bilingual;
  words: readonly string[];
};

export const TASTE_PRESETS: readonly TastePreset[] = [
  {
    key: "history",
    label: { en: "History", ja: "歴史" },
    words: ["history", "historic", "heritage", "歴史", "史跡"],
  },
  {
    key: "nature",
    label: { en: "Nature", ja: "自然" },
    words: ["nature", "outdoors", "views", "scenery", "自然", "景色"],
  },
  {
    key: "food",
    label: { en: "Food", ja: "食べ物" },
    words: ["food", "eating", "restaurants", "local food", "食べ物", "グルメ", "ごはん"],
  },
  {
    key: "coffee",
    label: { en: "Coffee", ja: "コーヒー" },
    words: ["coffee", "cafe", "cafes", "tea", "sweets", "コーヒー", "カフェ", "喫茶"],
  },
  {
    key: "drinks",
    label: { en: "Drinks", ja: "お酒" },
    words: ["drinks", "bars", "izakaya", "sake", "beer", "お酒", "居酒屋", "バー"],
  },
  {
    key: "craft",
    label: { en: "Craft and shopping", ja: "工芸・買い物" },
    words: ["craft", "crafts", "handmade", "shopping", "souvenirs", "工芸", "買い物", "手仕事"],
  },
  {
    key: "art",
    label: { en: "Art", ja: "アート" },
    words: ["art", "arts", "galleries", "gallery", "アート", "美術", "ギャラリー"],
  },
  {
    key: "music",
    label: { en: "Music", ja: "音楽" },
    words: ["music", "records", "vinyl", "音楽", "レコード"],
  },
  {
    key: "onsen",
    label: { en: "Baths", ja: "温泉・銭湯" },
    words: ["onsen", "bath", "baths", "hot spring", "温泉", "銭湯"],
  },
  {
    key: "stay",
    label: { en: "Places to stay", ja: "泊まる" },
    words: ["stay", "hotel", "inn", "泊まる", "宿"],
  },
];

/**
 * Which tastes a place's category points to when someone opens or saves it. An attraction could be
 * a shrine or a garden, so it points to two and each gets half.
 */
export const TASTES_OF_CATEGORY: Readonly<Record<string, readonly string[]>> = {
  museum: ["history"],
  attraction: ["history", "nature"],
  restaurant: ["food"],
  cafe: ["coffee"],
  bar: ["drinks"],
  shop: ["craft"],
  music_shop: ["music"],
  gallery: ["art"],
  bath: ["onsen"],
  stay: ["stay"],
};

export type TasteDraft = { key: string; label: string };

/** A taste for a typed or spoken phrase: a known one, or the phrase itself as the person's own word. */
export function tasteFromText(text: string): TasteDraft | null {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed === "" || trimmed.length > MAX_LABEL_LENGTH) return null;
  const phrase = canon(trimmed);
  const preset = TASTE_PRESETS.find((candidate) =>
    candidate.words.some((word) => canon(word) === phrase),
  );
  if (preset !== undefined) return { key: preset.key, label: preset.label.en };
  return { key: tagOf(trimmed), label: trimmed };
}

export function tasteLabel(taste: { key: string; label: string }, locale: Locale): string {
  const preset = TASTE_PRESETS.find((candidate) => candidate.key === taste.key);
  return preset === undefined ? taste.label : preset.label[locale];
}
