import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGE_BANDS,
  FULLNESS_LEVELS,
  NEED_KINDS,
  TRIP_RULES,
  TRIP_TASTES,
  isRuleTag,
  ruleScope,
  ruleTagLabel,
} from "@/lib/trip/vocabulary";

const REGION_FILE = "regions/malaysia-west.json";

type Fact = {
  meets?: string[];
  fails?: string[];
  noMeets?: string[];
  noFails?: string[];
  serves?: string[];
};

const allLabels = [
  ...TRIP_RULES.map((rule) => rule.label),
  ...NEED_KINDS.map((need) => need.label),
  ...AGE_BANDS.map((band) => band.label),
  ...FULLNESS_LEVELS.map((level) => level.label),
];

describe("trip vocabulary", () => {
  it("lists the eleven rule tags with the scopes the contract gives", () => {
    expect(TRIP_RULES).toHaveLength(11);
    for (const tag of ["high-chair", "pork-free", "vegetarian", "vegan", "halal"]) {
      expect(ruleScope(tag)).toBe("food");
    }
    for (const tag of ["step-free", "short-walks", "sit-often", "quiet", "toilet-near", "no-alcohol"]) {
      expect(ruleScope(tag)).toBe("any");
    }
    expect(isRuleTag("halal")).toBe(true);
    expect(isRuleTag("wheelchair")).toBe(false);
    expect(ruleScope("wheelchair")).toBeUndefined();
  });

  it("has the need kinds, age bands, fullness levels and tastes", () => {
    expect(NEED_KINDS.map((need) => need.kind)).toEqual(["prayer", "work", "rest"]);
    expect(AGE_BANDS.map((band) => band.band)).toEqual([
      "baby",
      "toddler",
      "child",
      "teen",
      "adult",
      "older",
    ]);
    expect(FULLNESS_LEVELS.map((level) => level.level)).toEqual(["light", "steady", "full"]);
    expect(TRIP_TASTES.length).toBeGreaterThan(0);
  });

  it("labels every tag in both languages", () => {
    for (const label of allLabels) {
      expect(label.en.trim()).not.toBe("");
      expect(label.ja.trim()).not.toBe("");
    }
    expect(ruleTagLabel("step-free", "en")).toBe("No stairs");
    expect(ruleTagLabel("unknown-tag", "ja")).toBe("unknown-tag");
  });

  it("names no diagnosis, disability, religion or reason (FR-304)", () => {
    const banned =
      /wheelchair|disab|handicap|mobility|autis|dementia|allerg|diabet|pregnan|arthritis|because|due to|religio|muslim|islam|hindu|buddh|christian|sikh|jewish|kosher|車椅子|車いす|障害|障がい|アレルギー|妊娠|認知症|宗教|イスラム|ムスリム|ヒンドゥー|仏教|キリスト|ため$/i;
    for (const label of allLabels) {
      expect(label.en).not.toMatch(banned);
      expect(label.ja).not.toMatch(banned);
    }
  });

  describe.skipIf(!existsSync(REGION_FILE))("against regions/malaysia-west.json", () => {
    const facts: Fact[] = existsSync(REGION_FILE)
      ? (JSON.parse(readFileSync(REGION_FILE, "utf8")).factVocabulary as Fact[])
      : [];

    it("names every hard-rule tag in at least one fact list (FR-344)", () => {
      for (const { tag } of TRIP_RULES) {
        const named = facts.some((fact) =>
          [fact.meets, fact.fails, fact.noMeets, fact.noFails].some((list) => list?.includes(tag)),
        );
        expect(named, `${tag} is named by no fact`).toBe(true);
      }
    });

    it("has a fact that serves every need kind (FR-344)", () => {
      for (const { kind } of NEED_KINDS) {
        expect(
          facts.some((fact) => fact.serves?.includes(kind)),
          `${kind} is served by no fact`,
        ).toBe(true);
      }
    });
  });
});
