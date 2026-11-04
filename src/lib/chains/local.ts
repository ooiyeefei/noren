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
