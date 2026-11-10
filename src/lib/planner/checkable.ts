import { AVOID_RULES, normaliseTag, resolveAvoid, withoutCautionRules } from "../draw/rules";
import { RULE_PRESETS } from "../memory/vocabulary";
import { deriveRegionPolicy, type RegionConfig } from "../region/schema";

/**
 * The hard-rule tags Noren can really check against its data right now, so "What Noren remembers"
 * can say which of a visitor's rules a draw will apply and which it can only report as unchecked.
 * It asks the draw itself, with the same policy it applies: while a region's launch pack is
 * incomplete a real place's page shows none of its owner's statements, so no rule that rests on one
 * is applied (convex/connector.ts). A tag not in this list is never checked.
 */
export function checkableTags(region: RegionConfig): string[] {
  const tags = [
    ...new Set([...RULE_PRESETS.map((p) => p.tag), ...AVOID_RULES.flatMap((r) => r.tags)]),
  ];
  const resolved = resolveAvoid(tags, region);
  const applied = deriveRegionPolicy(region).realBusinessesDraftOnly
    ? withoutCautionRules(resolved, "Owners' statements are not shown on Noren yet.")
    : resolved;
  return applied.applied.map((rule) => normaliseTag(rule.tag));
}
