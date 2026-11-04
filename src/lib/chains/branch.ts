import { distanceMetres } from "../overture/dedupe";
import { keyLength, keyedName } from "./names";

/**
 * Names that say they are a branch: "ハードオフ大村店", "ほっともっと 貝津店", "三八ラーメン 大浦支店",
 * "Foo Cafe 2号店", "Foo Cafe Omura Branch". The part left when the branch suffix is stripped is the
 * base name; a base name that many places share is a chain.
 */

export type BranchSplit = {
  /** The name without its branch suffix, as written. */
  base: string;
  /** The suffix, as written: the area, then 店, 支店, 号店, "Branch" or "Store". */
  suffix: string;
  /**
   * True when the name itself separates the suffix from the base with a space ("ほっともっと 貝津店");
   * false when the split is only one reading of a name written in one piece ("ハードオフ大村店").
   */
  certain: boolean;
};

/** The longest area, in characters, read before 店 when the name has no space before it. */
const MAX_AREA = 6;
/** The most words read as an area before "Branch" or "Store". */
const MAX_AREA_WORDS = 3;
const MAX_SUFFIX = 12;

/** Kinds of shop that end in 店 and say nothing about a branch ("うらかわ酒店" is not a branch of うらかわ). */
export const GENERIC_SUFFIXES: ReadonlySet<string> = new Set([
  "書店",
  "古書店",
  "酒店",
  "商店",
  "薬店",
  "菓子店",
  "洋菓子店",
  "和菓子店",
  "専門店",
  "喫茶店",
  "飲食店",
  "百貨店",
  "販売店",
  "小売店",
  "雑貨店",
  "料理店",
  "古着店",
  "珈琲店",
  "時計店",
  "眼鏡店",
  "洋品店",
  "呉服店",
  "食料品店",
  "食品店",
  "鮮魚店",
  "精肉店",
  "青果店",
  "果物店",
  "花店",
  "米穀店",
  "豆店",
  "茶店",
  "本屋店",
]);

/**
 * The area part of a Japanese branch suffix: "長与駅前店" gives "長与駅前", "大浦支店" gives "大浦" and
 * "2号店" gives "2号". Empty for a bare "支店" or "本店".
 */
export function areaOf(suffix: string): string {
  return keyedName(suffix.replace(/(支店|本店|店)$/u, "")).key;
}

/** The area with a trailing 駅前 or 駅 taken off, so "長与駅前店" counts as a branch in 長与. */
function areaStem(area: string): string {
  return area.replace(/(駅前|駅)$/u, "");
}

/** Every reading of a name as base plus branch suffix; empty when it has no branch suffix. */
export function branchSplits(name: string): BranchSplit[] {
  const text = name.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const splits: BranchSplit[] = [];

  const words = text.split(" ");
  const lastWord = words.at(-1)?.toLowerCase();
  if (words.length >= 2 && (lastWord === "branch" || lastWord === "store"))
    for (let area = 0; area <= MAX_AREA_WORDS && words.length - 1 - area >= 1; area++)
      splits.push({
        base: words.slice(0, words.length - 1 - area).join(" "),
        suffix: words.slice(words.length - 1 - area).join(" "),
        certain: false,
      });

  if (text.endsWith("店")) {
    const space = text.lastIndexOf(" ");
    const token = text.slice(space + 1);
    if (space > 0 && [...token].length <= MAX_SUFFIX && !GENERIC_SUFFIXES.has(token))
      splits.push({ base: text.slice(0, space).trim(), suffix: token, certain: true });
    const characters = [...text];
    for (let area = 1; area <= MAX_AREA && characters.length - 1 - area >= 2; area++) {
      const suffix = characters.slice(characters.length - 1 - area).join("");
      const base = characters
        .slice(0, characters.length - 1 - area)
        .join("")
        .trim();
      // A space inside the suffix means the name separates its last word, which the certain reading above
      // handles (or refuses, for "架空 酒店").
      if (!suffix.includes(" ") && !GENERIC_SUFFIXES.has(suffix) && base !== "")
        splits.push({ base, suffix, certain: false });
    }
  }
  return splits;
}

/**
 * Words that name a kind of place, not a place: a base name made of one of them is shared by many
 * unrelated places, so sharing it says nothing about a chain. Compared as keys.
 */
const GENERIC_BASES: ReadonlySet<string> = new Set(
  [
    "カフェ",
    "喫茶",
    "珈琲",
    "コーヒー",
    "コーヒーショップ",
    "cafe",
    "coffee",
    "レストラン",
    "restaurant",
    "食堂",
    "居酒屋",
    "酒場",
    "バー",
    "bar",
    "パブ",
    "pub",
    "ホテル",
    "hotel",
    "旅館",
    "民宿",
    "ペンション",
    "ゲストハウス",
    "ラーメン",
    "らーめん",
    "拉麺",
    "うどん",
    "そば",
    "蕎麦",
    "寿司",
    "鮨",
    "すし",
    "焼肉",
    "焼き肉",
    "焼鳥",
    "焼き鳥",
    "カレー",
    "パン",
    "ベーカリー",
    "bakery",
    "洋菓子",
    "和菓子",
    "ケーキ",
    "菓子",
    "雑貨",
    "古本",
    "ギャラリー",
    "gallery",
    "美術館",
    "博物館",
    "museum",
    "温泉",
    "銭湯",
    "お土産",
    "みやげ",
    "土産",
    "有限会社",
    "株式会社",
    "合同会社",
    "本店",
    "支店",
    "store",
    "shop",
    "branch",
  ].map((word) => keyedName(word).key),
);

export function isGenericBase(baseKey: string): boolean {
  return GENERIC_BASES.has(baseKey);
}

export type BranchRecord = { id: string; name: string; lat: number; lng: number };

export type ChosenBase = {
  /** The base name, normalised: the key shared by every branch of the chain. */
  key: string;
  /** The base name as written in this name. */
  base: string;
  /** The branch suffix as written, or null when the name carries none. */
  suffix: string | null;
};

export type BaseGroup = {
  key: string;
  /** One written base name, for reports. */
  base: string;
  /** Indexes of the records that share the base; a record listed twice at one door counts once. */
  members: number[];
  /** Whether at least one member carries a branch suffix. */
  hasSuffix: boolean;
  /** A base that names a kind of place; never a chain by sharing alone. */
  generic: boolean;
};

/** Two records of one name this close are one place listed twice. */
export const SAME_DOOR_METRES = 100;
/** An area is known when this many places write it before 店 with a space ("長崎 時津店"). */
export const KNOWN_AREA_MIN = 2;

/**
 * The base names of a list of records, found by how many records share them. A name with a space
 * before its 店 is split there. A name written in one piece ("ハードオフ大村店") could lose one to six
 * characters of area; it is split where the rest is shared by other records and what was cut is an
 * area, that is a name other places write before 店 after a space ("時津店", "諫早駅前店") or a bare
 * 支店 or 本店 or numbered 号店. That keeps "小川佛具店", "小川石油店" and "小川ハタ店" apart. A name that
 * no other record shares has no base but itself.
 */
export class BranchIndex<T extends BranchRecord = BranchRecord> {
  readonly records: readonly T[];
  private readonly fullKeys: string[];
  private readonly splits: BranchSplit[][];
  private readonly double: boolean[];
  private readonly knownAreas = new Map<string, number>();
  private readonly support = new Map<string, Set<number>>();
  private readonly chosen: ChosenBase[];
  readonly groups = new Map<string, BaseGroup>();

  constructor(records: readonly T[]) {
    this.records = records;
    this.fullKeys = records.map((record) => keyedName(record.name).key);
    this.splits = records.map((record) => branchSplits(record.name));
    this.double = this.findDoubles();
    records.forEach((_, index) => {
      if (this.double[index]) return;
      for (const split of this.splits[index]!)
        if (split.certain) {
          const area = areaStem(areaOf(split.suffix));
          if (area) this.knownAreas.set(area, (this.knownAreas.get(area) ?? 0) + 1);
        }
    });
    const add = (key: string, index: number) => {
      if (!key) return;
      const set = this.support.get(key) ?? new Set<number>();
      set.add(index);
      this.support.set(key, set);
    };
    records.forEach((_, index) => {
      if (this.double[index]) return;
      add(this.fullKeys[index]!, index);
      for (const split of this.splits[index]!)
        if (this.plausible(split)) add(keyedName(split.base).key, index);
    });
    this.chosen = records.map((record, index) =>
      this.choose(record.name, this.splits[index]!, this.fullKeys[index]!),
    );
    records.forEach((_, index) => {
      if (this.double[index]) return;
      const chosen = this.chosen[index]!;
      const group = this.groups.get(chosen.key) ?? {
        key: chosen.key,
        base: chosen.base,
        members: [],
        hasSuffix: false,
        generic: isGenericBase(chosen.key),
      };
      group.members.push(index);
      if (chosen.suffix !== null) group.hasSuffix = true;
      this.groups.set(chosen.key, group);
    });
  }

  /** Records of one name within SAME_DOOR_METRES of an earlier record: the same place twice. */
  private findDoubles(): boolean[] {
    const seen = new Map<string, number[]>();
    return this.records.map((record, index) => {
      const key = this.fullKeys[index]!;
      const earlier = seen.get(key) ?? [];
      const double = earlier.some(
        (other) => distanceMetres(this.records[other]!, record) <= SAME_DOOR_METRES,
      );
      if (!double) seen.set(key, [...earlier, index]);
      return double;
    });
  }

  /** Whether a reading of a name cuts off something that is a branch suffix. */
  private plausible(split: BranchSplit): boolean {
    if (split.certain || !split.suffix.endsWith("店")) return true;
    const area = areaOf(split.suffix);
    if (area === "" || /^\d+号?$/u.test(area)) return true;
    return (this.knownAreas.get(areaStem(area)) ?? 0) >= KNOWN_AREA_MIN;
  }

  private choose(name: string, splits: readonly BranchSplit[], fullKey: string): ChosenBase {
    const certain = splits.find((split) => split.certain);
    if (certain)
      return { key: keyedName(certain.base).key, base: certain.base, suffix: certain.suffix };
    let best: { split: BranchSplit; key: string; support: number } | null = null;
    for (const split of splits) {
      if (!this.plausible(split)) continue;
      const key = keyedName(split.base).key;
      const support = this.support.get(key)?.size ?? 0;
      if (support < 2) continue;
      if (
        !best ||
        support > best.support ||
        (support === best.support && key.length > best.key.length)
      )
        best = { split, key, support };
    }
    return best
      ? { key: best.key, base: best.split.base, suffix: best.split.suffix }
      : { key: fullKey, base: name, suffix: null };
  }

  /**
   * Every plausible reading of a name as base plus branch suffix, the ones the name itself separates
   * first. Empty for a name with no branch suffix.
   */
  candidates(name: string): ChosenBase[] {
    const found: ChosenBase[] = [];
    const seen = new Set<string>();
    const splits = branchSplits(name).sort((a, b) => Number(b.certain) - Number(a.certain));
    for (const split of splits) {
      if (!this.plausible(split)) continue;
      const key = keyedName(split.base).key;
      if (keyLength(key) < 2 || seen.has(key)) continue;
      seen.add(key);
      found.push({ key, base: split.base, suffix: split.suffix });
    }
    return found;
  }

  /** The base of any name, written the way this list reads names. */
  baseOf(name: string): ChosenBase {
    return this.choose(name, branchSplits(name), keyedName(name).key);
  }

  /** The records that share a base, or null for a base no record has. */
  group(key: string): BaseGroup | null {
    return this.groups.get(key) ?? null;
  }

  /** Whether record `index` is a second listing of a place already counted. */
  isDouble(index: number): boolean {
    return this.double[index] === true;
  }

  chosenBase(index: number): ChosenBase {
    return this.chosen[index]!;
  }
}
