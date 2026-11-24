import { checkRule, excludedByCategory } from "../facts/rules";
import type { Candidate, PartySnapshot, RegionTripSettings, Stop } from "./types";
import { ruleScope } from "./vocabulary";

export function travellersOn(party: PartySnapshot, day: number): PartySnapshot["travellers"] {
  return party.travellers.filter((traveller) => traveller.days?.includes(day) ?? true);
}

export function checksFor(
  candidate: Candidate,
  travellers: PartySnapshot["travellers"],
  region: RegionTripSettings,
  date: string,
): { allowed: boolean; notMet: boolean; checks: Stop["checks"] } {
  const rules = [...new Set(travellers.flatMap((traveller) => traveller.rules))];
  const food =
    candidate.category !== undefined && region.trip?.foodCategories.includes(candidate.category);
  let notMet = false;
  const checks: Stop["checks"] = [];
  for (const rule of rules) {
    if (!food && ruleScope(rule) === "food") continue;
    const result = checkRule(rule, candidate, region, date);
    if (result.verdict === "not_met") notMet = true;
    else checks.push({ rule, ...result });
  }
  return { allowed: !notMet && !excludedByCategory(rules, candidate.category), notMet, checks };
}
