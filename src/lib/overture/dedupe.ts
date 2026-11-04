export type Located = { lat: number; lng: number };

export function distanceMetres(a: Located, b: Located): number {
  const radians = Math.PI / 180;
  const lat = Math.sin(((b.lat - a.lat) * radians) / 2) ** 2;
  const lng = Math.sin(((b.lng - a.lng) * radians) / 2) ** 2;
  const h = lat + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * lng;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * A name reduced to what two sources agree on: full-width and half-width forms folded (NFKC),
 * katakana written as hiragana so カフェ and かふぇ meet, case folded, accents dropped from Latin
 * names, and spaces, punctuation and symbols removed. Kanji are left as they are: no dictionary
 * says 珈琲 and コーヒー are one word, so such a pair matches only by place, website or another name.
 */
export function normalizeName(value: string): string {
  let name = value.normalize("NFKC").toLowerCase();
  // Stripping marks from Japanese would turn が into か, so it is done for Latin names only.
  if (!JAPANESE.test(name)) name = name.normalize("NFKD").replace(/\p{M}/gu, "");
  return name
    .replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Normalised names of one place, any language, without blanks or repeats. */
export function nameKeys(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeName).filter(Boolean))];
}

/**
 * Same name, or one name inside the other ("ラーメン山田" and "ラーメン山田長崎店"). The shorter name
 * must be four or more characters and most of the longer one, so "カフェ" never matches every café
 * in the street and "山田ラーメン" never matches "山本ラーメン".
 */
export function similarKeys(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const shortLength = [...short].length;
  return shortLength >= 4 && shortLength / [...long].length >= 0.6 && long.includes(short);
}

export function anySimilar(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.some((y) => similarKeys(x, y)));
}

function bigrams(value: string): Map<string, number> {
  const characters = [...value];
  const counts = new Map<string, number>();
  for (let i = 0; i < characters.length - 1; i++) {
    const pair = characters[i]! + characters[i + 1]!;
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Share of two-character pieces two names have in common, from 0 to 1 (the Sørensen-Dice coefficient). */
export function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const [pair, count] of x) {
    total += count;
    shared += Math.min(count, y.get(pair) ?? 0);
  }
  for (const count of y.values()) total += count;
  return total === 0 ? 0 : (2 * shared) / total;
}

/**
 * A looser test for two points so close they are the same doorway, where two sources spell a name
 * differently ("ホテルモントレ長崎" and "ホテルモントレ", "ANA Crowne Plaza Hotel Nagasaki" and
 * "ANA Crowne Plaza Nagasaki"): one name inside the other from three characters, or most of their
 * two-character pieces shared.
 */
export function closeKeys(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return ([...short].length >= 3 && long.includes(short)) || dice(a, b) >= 0.6;
}

export function anyClose(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.some((y) => closeKeys(x, y)));
}

/**
 * The least name evidence that, with the same website, makes two records one place: some of one name
 * inside the other (two characters or more) or a third of their two-character pieces shared. Shops
 * of one owner, tenants of one mall and stalls of one airport share a website and nothing else.
 */
export function relatedKeys(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return ([...short].length >= 2 && long.includes(short)) || dice(a, b) >= 0.3;
}

export function anyRelated(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.some((y) => relatedKeys(x, y)));
}

/** host and path of a website, to compare two sources' links to the same page; null for a bad URL. */
export function websiteKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = url.pathname.replace(/\/+$/u, "");
    return `${url.hostname.replace(/^www\./u, "").toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

export type IndexedPlace = Located & {
  id: string;
  /** Normalised names (see nameKeys). */
  keys: readonly string[];
  /** Website keys (see websiteKey); empty where the place has none on record. */
  websites: readonly string[];
  category?: string;
};

export type Match = { place: IndexedPlace; metres: number; by: "name" | "close name" | "website" };

// A grid of 0.002 degrees (about 220 m by 185 m here) keeps each lookup to nine cells.
const CELL = 0.002;
const cellOf = (value: number) => Math.floor(value / CELL);

/**
 * Places found near a candidate that are probably the same place:
 * - within `nameMetres`, a name that is the same or similar (similarKeys);
 * - within `closeMetres`, of the same category, a name that is close (closeKeys);
 * - within `websiteMetres`, of the same category, the same website and a related name (a hotel and
 *   its restaurant share a website, and are two places).
 */
export class PlaceIndex {
  private readonly cells = new Map<string, IndexedPlace[]>();

  constructor(
    private readonly options: { nameMetres: number; closeMetres: number; websiteMetres: number },
    places: Iterable<IndexedPlace> = [],
  ) {
    if (Math.max(options.nameMetres, options.closeMetres, options.websiteMetres) > 180)
      throw new Error("PlaceIndex looks only one grid cell away, which is 180 m at most");
    for (const place of places) this.add(place);
  }

  add(place: IndexedPlace) {
    const key = `${cellOf(place.lat)}:${cellOf(place.lng)}`;
    const cell = this.cells.get(key);
    if (cell) cell.push(place);
    else this.cells.set(key, [place]);
  }

  find(candidate: IndexedPlace): Match | undefined {
    let best: Match | undefined;
    const row = cellOf(candidate.lat);
    const column = cellOf(candidate.lng);
    for (let r = row - 1; r <= row + 1; r++)
      for (let c = column - 1; c <= column + 1; c++)
        for (const place of this.cells.get(`${r}:${c}`) ?? []) {
          if (place.id === candidate.id) continue;
          const metres = distanceMetres(place, candidate);
          const sameCategory = place.category === candidate.category;
          const by =
            metres <= this.options.nameMetres && anySimilar(place.keys, candidate.keys)
              ? "name"
              : metres <= this.options.closeMetres &&
                  sameCategory &&
                  anyClose(place.keys, candidate.keys)
                ? "close name"
                : metres <= this.options.websiteMetres &&
                    sameCategory &&
                    place.websites.some((site) => candidate.websites.includes(site)) &&
                    anyRelated(place.keys, candidate.keys)
                  ? "website"
                  : null;
          if (by && (!best || metres < best.metres)) best = { place, metres, by };
        }
    return best;
  }
}
