import { AVOID_RULES } from "../draw/rules";
import { datePlusDays } from "../trip/calendar";
import type { Candidate, NeedKind, RegionTripSettings, Stop } from "../trip/types";

type Fact = Candidate["facts"][number];
type Evidence = Pick<Candidate, "facts" | "cautions">;
type FactSettings = Pick<RegionTripSettings, "factVocabulary" | "factMaxAgeDays">;
type WithoutRule<T> = T extends { rule: string } ? Omit<T, "rule"> : never;
type Verdict = WithoutRule<Stop["checks"][number]> | { verdict: "not_met" };

function earliestDay(region: FactSettings, date: string): string | undefined {
  return region.factMaxAgeDays === undefined
    ? undefined
    : datePlusDays(date, -region.factMaxAgeDays);
}

export function checkRule(
  rule: string,
  place: Evidence,
  region: FactSettings,
  date: string,
): Verdict {
  if (
    AVOID_RULES.some(
      ({ tags, caution }) =>
        caution !== undefined && tags.includes(rule) && place.cautions.includes(caution),
    )
  )
    return { verdict: "not_met" };

  const keys = region.factVocabulary?.filter((entry) =>
    [entry.meets, entry.fails, entry.noMeets, entry.noFails].some((list) => list?.includes(rule)),
  );
  if (!keys?.length) return { verdict: "not_known", reason: "not_recorded_here" };

  const earliest = earliestDay(region, date);
  let stale = false;
  let newest: Fact | undefined;
  let newestIndex = Infinity;
  for (const key of keys) {
    const fresh = new Set<Fact["value"]>();
    for (const [index, fact] of place.facts.entries()) {
      if (fact.key !== key.key) continue;
      const yes = fact.value === "yes";
      const forRule = (yes ? key.meets : key.noMeets)?.includes(rule);
      const against = (yes ? key.fails : key.noFails)?.includes(rule);
      if (earliest !== undefined && fact.day < earliest) {
        stale ||= Boolean(forRule || against);
        continue;
      }
      fresh.add(fact.value);
      if (against || fresh.size > 1) return { verdict: "not_met" };
      if (
        forRule &&
        (!newest || fact.day > newest.day || (fact.day === newest.day && index < newestIndex))
      ) {
        newest = fact;
        newestIndex = index;
      }
    }
  }
  return newest
    ? { verdict: "met", restsOn: { kind: newest.basis, factId: newest.factId } }
    : { verdict: "not_known", reason: stale ? "too_old" : "no_record" };
}

export function excludedByCategory(rules: readonly string[], category?: string): boolean {
  return category === "bar" && rules.includes("no-alcohol");
}

export function needsServed(
  facts: readonly Fact[],
  region: FactSettings,
  date: string,
): Set<NeedKind> {
  const earliest = earliestDay(region, date);
  const served = new Set<NeedKind>();
  for (const fact of facts) {
    if (fact.value !== "yes" || (earliest !== undefined && fact.day < earliest)) continue;
    const key = region.factVocabulary?.find((entry) => entry.key === fact.key);
    for (const need of key?.serves ?? []) served.add(need);
  }
  return served;
}
