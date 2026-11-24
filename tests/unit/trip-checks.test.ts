import { describe, expect, expectTypeOf, it } from "vitest";
import malaysia from "../../regions/malaysia-west.json";
import { checkRule, excludedByCategory, needsServed } from "@/lib/facts/rules";
import { areaRegionSchema } from "@/lib/region/schema";
import type { Candidate } from "@/lib/trip/types";

const region = areaRegionSchema.parse(malaysia);
const date = "2026-11-24";
function fact(key: string, value: "yes" | "no" = "yes", day = date): Candidate["facts"][number] {
  return { key, value, day, basis: "member", factId: `${key}-${value}-${day}` };
}

describe("trip rule evidence", () => {
  it("rejects steps reported by a member or cautioned by the owner", () => {
    expect(
      checkRule("step-free", { facts: [fact("steps_at_door")], cautions: [] }, region, date),
    ).toEqual({ verdict: "not_met" });
    expect(
      checkRule("step-free", { facts: [], cautions: ["accessibility_steps"] }, region, date),
    ).toEqual({ verdict: "not_met" });
  });

  it("rejects conflicting reports, even for a rule only one value addresses", () => {
    const facts = [fact("halal_sign"), fact("halal_sign", "no")];
    for (const rule of ["halal", "pork-free"]) {
      expect(checkRule(rule, { facts, cautions: [] }, region, date)).toEqual({
        verdict: "not_met",
      });
    }
  });

  it("reports stale member reports and posts as unknown", () => {
    for (const basis of ["member", "post"] as const) {
      const facts = [{ ...fact("steps_at_door", "yes", "2025-09-24"), basis }];
      expect(checkRule("step-free", { facts, cautions: [] }, region, date)).toEqual({
        verdict: "not_known",
        reason: "too_old",
      });
    }
  });

  it("checks the effect of the reported value, not the category or other listing fields", () => {
    const evidence = { facts: [fact("halal_sign", "no")], cautions: [] };
    expect(checkRule("halal", evidence, region, date)).toEqual({ verdict: "not_met" });
    expect(checkRule("pork-free", evidence, region, date)).toEqual({
      verdict: "not_known",
      reason: "no_record",
    });
    expect(excludedByCategory(["no-alcohol"], "bar")).toBe(true);
    expect(checkRule("no-alcohol", { facts: [], cautions: [] }, region, date)).toEqual({
      verdict: "not_known",
      reason: "no_record",
    });
    expect(checkRule("cash-free", evidence, region, date)).toEqual({
      verdict: "not_known",
      reason: "not_recorded_here",
    });
  });

  it("names the newest positive evidence with its source and id", () => {
    const post = { ...fact("ramp"), basis: "post" as const };
    const facts = [fact("level_entrance", "yes", "2026-11-20"), post];
    expect(checkRule("step-free", { facts, cautions: [] }, region, date)).toEqual({
      verdict: "met",
      restsOn: { kind: "post", factId: post.factId },
    });
  });

  it("reads only facts and published cautions as rule evidence", () => {
    expectTypeOf<Parameters<typeof checkRule>[1]>().toEqualTypeOf<
      Pick<Candidate, "facts" | "cautions">
    >();
  });

  it("counts a fact exactly on the region's age limit as fresh", () => {
    const record = fact("ramp", "yes", "2025-11-24");
    expect(checkRule("step-free", { facts: [record], cautions: [] }, region, date)).toEqual({
      verdict: "met",
      restsOn: { kind: "member", factId: record.factId },
    });
  });

  it("finds needs served by fresh positive facts", () => {
    const facts = [
      fact("prayer_room"),
      fact("quiet_room", "no"),
      fact("seats_to_rest", "yes", "2025-01-01"),
    ];
    expect([...needsServed(facts, region, date)]).toEqual(["prayer"]);
  });
});
