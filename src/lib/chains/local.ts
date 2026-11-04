/**
 * A family shop with two or three branches in Nagasaki is what the map is for (the owner's rule,
 * 2026-11-04), so a name that several places share is not enough to hide them. The branch pattern
 * hides a base name only when it is shared by this many places or more, or when it is also found
 * outside Nagasaki prefecture, where it is somebody's chain.
 */
export const LOCAL_BRANCH_LIMIT = 5;

/**
 * Places outside Nagasaki prefecture that must share a base name, with a branch suffix, before the
 * Japan-wide count means anything: namesakes are common (大和屋, 庄屋), five or more branches are a chain.
 * Fewer count as none.
 */
export const JAPAN_NOTABLE = 5;

export type BranchEvidence = {
  /** Places in the Overture snapshot that share the base name (a place listed twice counts once). */
  sites: number;
  /**
   * Places that share the base name outside Nagasaki prefecture: the snapshot's own records whose
   * address says another prefecture, and the records the Japan-wide Overture check found.
   */
  elsewhere: number;
};

/**
 * True for a base name that appears only in Nagasaki prefecture and fewer than LOCAL_BRANCH_LIMIT
 * times. Such a name is spared when the branch pattern is the only reason to hide it; a brand from
 * the Name Suggestion Index, or the brand field of Overture, still hides it.
 */
export function isLocalMultiBranch(evidence: BranchEvidence): boolean {
  return evidence.sites < LOCAL_BRANCH_LIMIT && evidence.elsewhere === 0;
}

/** Overture's address for a record: the region and postcode it gives, when it gives any. */
export type RecordAddress = { region?: string | null; postcode?: string | null };

export type Prefecture = "nagasaki" | "other" | "unknown";

/**
 * Which prefecture an Overture address names. The region field is often empty, so the postcode counts
 * too: Nagasaki's start with 85 (850 to 859). A record with neither is "unknown", which the snapshot
 * (a box around Nagasaki, Nagayo and Isahaya) treats as Nagasaki.
 */
export function prefectureOf(addresses: readonly RecordAddress[]): Prefecture {
  let known: Prefecture = "unknown";
  for (const { region, postcode } of addresses) {
    const area = (region ?? "").normalize("NFKC").trim().toLowerCase();
    if (area !== "") {
      if (/長崎|nagasaki|^42$/u.test(area)) return "nagasaki";
      known = "other";
      continue;
    }
    const digits = (postcode ?? "").normalize("NFKC").replace(/\D/gu, "");
    if (digits.length >= 3) {
      if (/^85\d/u.test(digits)) return "nagasaki";
      known = "other";
    }
  }
  return known;
}

/**
 * A business born in Nagasaki stays on the map even when it has grown branches elsewhere: 福砂屋,
 * castella since 1624, is what Noren exists for (the owner, 2026-11-04). A name is Nagasaki-born when
 * Nagasaki prefecture holds at least this share of all the places that carry it in Japan.
 */
export const NAGASAKI_BORN_SHARE = 0.3;

export type PlaceCounts = {
  /** Places that carry the name in Nagasaki prefecture. */
  nagasaki: number;
  /** Places that carry the name in the rest of Japan. */
  elsewhere: number;
};

/** Nagasaki's share of the places that carry a name, from 0 to 1 (0 when there are none). */
export function nagasakiShare(counts: PlaceCounts): number {
  const total = counts.nagasaki + counts.elsewhere;
  return total === 0 ? 0 : counts.nagasaki / total;
}

/**
 * True when Nagasaki prefecture holds NAGASAKI_BORN_SHARE or more of a name's places in Japan. Needs the
 * counts of both sides, so a name with no count outside Nagasaki must not be passed as zero.
 */
export function isNagasakiBorn(counts: PlaceCounts): boolean {
  return counts.nagasaki > 0 && nagasakiShare(counts) >= NAGASAKI_BORN_SHARE;
}

// The head shop of a business: 本店 (main shop), 総本店 (head main shop) or 本家 (the original house).
// 本舗 is left out on purpose: it is part of many brand names and says nothing about a flagship.
const FLAGSHIP_JA = /^(.*?)\s*(?:総本店|本店|本家)$/u;
const FLAGSHIP_ROMAJI = /^(.*?)[\s-]*(?:sou)?hon(?:ten|ke)$/iu;

/**
 * Whether a name marks its place as the head shop: it ends in 本店, 総本店 or 本家, after the base name
 * ("岩崎本舗本店", "文明堂 総本店", "牛たん本家") or after the base name and an area ("清香園 古町本店"), or in
 * the same words written in romaji ("Bunmeido Souhonten"). The name that IS the brand plus 本店 counts;
 * 本店 alone, 本舗 by itself and a branch such as "大村店" do not.
 */
export function isFlagshipName(name: string): boolean {
  const text = name.normalize("NFKC").replace(/\s+/gu, " ").trim();
  for (const pattern of [FLAGSHIP_JA, FLAGSHIP_ROMAJI]) {
    const base = pattern.exec(text)?.[1];
    if (base !== undefined && [...base.replace(/\s/gu, "")].length >= 2) return true;
  }
  return false;
}
