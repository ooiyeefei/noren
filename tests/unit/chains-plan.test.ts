import { describe, expect, it } from "vitest";
import { keyedName } from "../../src/lib/chains/names";
import type { NsiBrand } from "../../src/lib/chains/nsi";
import {
  planChains,
  type BaseEvidence,
  type BrandEvidence,
  type JapanEvidence,
  type PublicPlace,
  type SnapshotRecord,
} from "../../src/lib/chains/plan";

// Every name, brand and place here is fictional.
const brand = (id: string, displayName: string, path: string): NsiBrand => ({
  id,
  displayName,
  path,
  coverage: "japan",
  categories: path.includes("tourism/hotel") ? ["stay"] : ["restaurant", "cafe", "bar", "shop"],
  keys: [keyedName(displayName).key],
});
const brands = [
  brand("mimosa-1", "ミモザ食堂", "brands/amenity/restaurant"),
  brand("hotel-1", "ホテル架空イン", "brands/tourism/hotel"),
];

/** Japan-wide evidence, as the evidence file gives it. */
const japan = (
  bases: Record<string, BaseEvidence>,
  brandEvidence: Record<string, BrandEvidence> = {},
): JapanEvidence => ({
  bases: new Map(Object.entries(bases)),
  brands: new Map(Object.entries(brandEvidence)),
});

let n = 0;
const record = (name: string, extra: Partial<SnapshotRecord> = {}): SnapshotRecord => ({
  id: `gers-${++n}`,
  name,
  lat: 32.6 + n * 0.01,
  lng: 129.8,
  brand: null,
  prefecture: "nagasaki",
  ...extra,
});
const place = (name: string, category: string, extra: Partial<PublicPlace> = {}): PublicPlace => ({
  id: `place-${name}`,
  category,
  names: [name],
  refs: [],
  protectedBy: [],
  ...extra,
});
const run = (places: PublicPlace[], records: SnapshotRecord[] = [], evidence?: JapanEvidence) =>
  planChains({ places, records, brands, nsiVersion: "9.9", evidence });
const byName = (plan: ReturnType<typeof run>, name: string) =>
  plan.matches.find((match) => match.name === name);

describe("planChains signal (a): the brand list", () => {
  it("hides a place whose name starts with a brand of a fitting category, and reports the brand", () => {
    const plan = run([
      place("ミモザ食堂 大村店", "restaurant"),
      place("ホテル架空イン長崎", "stay"),
    ]);
    expect(byName(plan, "ミモザ食堂 大村店")).toMatchObject({
      decision: "hide",
      signals: [{ kind: "brand_list", detail: "mimosa-1" }],
    });
    expect(byName(plan, "ミモザ食堂 大村店")!.signals[0]!.reason).toContain(
      "Name Suggestion Index 9.9",
    );
    expect(byName(plan, "ホテル架空イン長崎")?.decision).toBe("hide");
    expect(plan.perBrand).toEqual([
      expect.objectContaining({ id: "hotel-1", places: 1 }),
      expect.objectContaining({ id: "mimosa-1", places: 1 }),
    ]);
  });

  it("leaves a bar alone when the brand is of another kind of business", () => {
    expect(run([place("ホテル架空イン", "bar")]).matches).toEqual([]);
  });
});

describe("planChains signal (c): the Overture brand field", () => {
  it("hides a place whose Overture record carries a brand", () => {
    const plan = run(
      [place("独立カフェ", "cafe", { refs: [{ provider: "overture", ref: "g-1" }] })],
      [record("独立カフェ", { id: "g-1", brand: { name: "架空ブランド", wikidata: "Q1" } })],
    );
    expect(plan.matches).toMatchObject([
      { decision: "hide", signals: [{ kind: "overture_brand", detail: "架空ブランド" }] },
    ]);
  });

  it("ignores a reference to another provider", () => {
    const plan = run(
      [place("独立カフェ", "cafe", { refs: [{ provider: "osm", ref: "g-1" }] })],
      [record("独立カフェ", { id: "g-1", brand: { name: "架空ブランド", wikidata: null } })],
    );
    expect(plan.matches).toEqual([]);
  });
});

describe("planChains signal (b): the branch pattern", () => {
  const chain = (count: number, base = "架空ラーメン亭") =>
    Array.from({ length: count }, (_, i) =>
      record(`${base} ${["大村", "時津", "諫早", "長与", "琴海", "多良見"][i]}店`),
    );

  it("hides a base name shared by five or more places in Nagasaki, branch suffix among them", () => {
    const records = chain(5);
    const plan = run([place("架空ラーメン亭 大村店", "restaurant")], records);
    expect(plan.matches).toMatchObject([
      { decision: "hide", signals: [{ kind: "branch_pattern", detail: "架空ラーメン亭" }] },
    ]);
  });

  it("hides the head office with no suffix as well", () => {
    const plan = run(
      [place("架空ラーメン亭", "restaurant")],
      [...chain(5), record("架空ラーメン亭")],
    );
    expect(plan.matches[0]).toMatchObject({ decision: "hide" });
  });

  it("spares a local multi-branch place: three or four, only in Nagasaki", () => {
    for (const count of [3, 4]) {
      const plan = run([place("架空ラーメン亭 大村店", "restaurant")], chain(count));
      expect(plan.matches).toMatchObject([
        { decision: "spare", note: expect.stringContaining(`${count} places`) },
      ]);
    }
  });

  it("does not call two places a chain", () => {
    expect(run([place("架空ラーメン亭 大村店", "restaurant")], chain(2)).matches).toEqual([]);
  });

  it("needs a branch suffix: three places that share a name and none with a suffix are no chain", () => {
    const same = ["独立珈琲館", "独立珈琲館", "独立珈琲館"].map((name, i) =>
      record(name, { lat: 32.6 + i * 0.05 }),
    );
    expect(run([place("独立珈琲館", "cafe")], same).matches).toEqual([]);
  });

  it("never counts a base that names a kind of place", () => {
    const records = ["大村", "時津", "諫早", "長与", "琴海", "多良見"].map((area) =>
      record(`ラーメン ${area}店`),
    );
    expect(run([place("ラーメン 大村店", "restaurant")], records).matches).toEqual([]);
  });

  it("does not spare a base that is also in another prefecture, as the snapshot's own address says", () => {
    const records = [
      ...chain(3).slice(0, 2),
      record("架空ラーメン亭 熊本店", { prefecture: "other" }),
    ];
    const plan = run([place("架空ラーメン亭 大村店", "restaurant")], records);
    expect(plan.matches[0]?.decision).toBe("hide");
  });

  it("uses the Japan-wide count: five or more branches outside Nagasaki make a chain of two", () => {
    const records = chain(2);
    const key = keyedName("架空ラーメン亭").key;
    const found = run(
      [place("架空ラーメン亭 大村店", "restaurant")],
      records,
      japan({ [key]: { outside: 40 } }),
    );
    expect(found.matches).toMatchObject([{ decision: "hide", japanWideOnly: true }]);
    expect(found.matches[0]!.signals[0]!.reason).toContain("40 places outside Nagasaki prefecture");
    // Fewer than five outside are namesakes, and change nothing either way.
    const few = run(
      [place("架空ラーメン亭 大村店", "restaurant")],
      records,
      japan({ [key]: { outside: 4 } }),
    );
    expect(few.matches).toEqual([]);
    const fewLocal = run(
      [place("架空ラーメン亭 大村店", "restaurant")],
      chain(3),
      japan({ [key]: { outside: 4 } }),
    );
    expect(fewLocal.matches[0]?.decision).toBe("spare");
  });

  it("ignores the Japan-wide count for a base name of two characters", () => {
    const records = [record("美山 大村店")];
    const key = keyedName("美山").key;
    const plan = run(
      [place("美山 大村店", "restaurant")],
      records,
      japan({ [key]: { outside: 40 } }),
    );
    expect(plan.matches).toEqual([]);
  });

  it("asks for a Japan-wide count of every base it looked at, and says how many are missing", () => {
    const plan = run([place("架空ラーメン亭 大村店", "restaurant")], chain(3));
    expect(plan.evidenceRequest.bases).toContainEqual({
      key: keyedName("架空ラーメン亭").key,
      base: "架空ラーメン亭",
    });
    expect(plan.missingEvidence).toBe(plan.evidenceRequest.bases.length);
    const key = keyedName("架空ラーメン亭").key;
    const covered = run(
      [place("架空ラーメン亭 大村店", "restaurant")],
      chain(3),
      japan({ [key]: { outside: 0 } }),
    );
    expect(covered.missingEvidence).toBeLessThan(plan.missingEvidence);
  });
});

describe("planChains: what a brand or the Overture brand field hides stays hidden", () => {
  it("does not spare a local multi-branch place that also matches a brand", () => {
    const records = ["大村", "時津", "諫早"].map((area) => record(`ミモザ食堂 ${area}店`));
    const plan = run([place("ミモザ食堂 大村店", "restaurant")], records);
    expect(plan.matches[0]?.decision).toBe("hide");
    expect(plan.matches[0]!.signals.map((signal) => signal.kind)).toEqual(["brand_list"]);
  });
});

describe("planChains: places that are never hidden", () => {
  it("keeps a chain place that holds a story, a post or an owner, and says why", () => {
    const plan = run([
      place("ミモザ食堂 大村店", "restaurant", {
        protectedBy: ["has a story", "has a confirmed owner"],
      }),
    ]);
    expect(plan.matches).toMatchObject([
      { decision: "protected", note: "kept: has a story, has a confirmed owner" },
    ]);
    expect(plan.perBrand).toEqual([]);
  });

  it("skips a place with no category", () => {
    expect(run([place("ミモザ食堂", "restaurant", { category: undefined })]).matches).toEqual([]);
  });
});

describe("planChains: a business born in Nagasaki stays", () => {
  const base = "架空堂";
  const key = keyedName(base).key;
  const areas = ["大村", "時津", "諫早", "長与", "琴海", "多良見"];
  const branches = (count: number, extra: Partial<SnapshotRecord> = {}) =>
    Array.from({ length: count }, (_, i) => record(`${base} ${areas[i]}店`, extra));
  // Six branches in the snapshot: the branch pattern alone would hide them.
  const six = branches(6);
  const named = place(`${base} 大村店`, "restaurant");

  it("hides the chain without a Nagasaki count, and with a Nagasaki share under 30%", () => {
    expect(run([named], six).matches[0]?.decision).toBe("hide");
    // 6 branches here and 2 outside the box against 20 elsewhere: 8 of 28, 28.6%.
    const plan = run([named], six, japan({ [key]: { outside: 20, nagasaki: 2 } }));
    expect(plan.matches[0]).toMatchObject({ decision: "hide" });
  });

  it("spares it at 30% or more of its branches in Japan, and says how many", () => {
    // 6 here and 2 outside the box against 18 elsewhere: 8 of 26, 30.8%.
    const plan = run([named], six, japan({ [key]: { outside: 18, nagasaki: 2 } }));
    expect(plan.matches[0]).toMatchObject({
      decision: "spare",
      spareRules: ["nagasaki_born"],
      signals: [{ kind: "branch_pattern" }],
    });
    expect(plan.matches[0]!.note).toContain("8 of the 26 places or branches");
    expect(plan.matches[0]!.note).toContain("(31%)");
  });

  it("spares it at exactly 30%", () => {
    // 6 here against 14 elsewhere: 6 of 20.
    const plan = run([named], six, japan({ [key]: { outside: 14, nagasaki: 0 } }));
    expect(plan.matches[0]?.decision).toBe("spare");
  });

  it("counts the snapshot's own records in another prefecture on the other side", () => {
    // 2 of the 6 are in Kumamoto: 4 here against 2 + 12 elsewhere is 4 of 18, 22%.
    const records = [...branches(4), ...branches(2, { prefecture: "other" })];
    const plan = run([named], records, japan({ [key]: { outside: 12, nagasaki: 0 } }));
    expect(plan.matches[0]?.decision).toBe("hide");
  });

  it("needs a Nagasaki count: evidence from before the rule cannot spare anything", () => {
    const plan = run([named], six, japan({ [key]: { outside: 0 } }));
    expect(plan.matches[0]?.decision).toBe("hide");
  });

  it("counts branches, not the bare name that unrelated shops elsewhere share", () => {
    // Namesakes elsewhere are not in the count at all, so they cannot push Nagasaki under 30%.
    const plan = run(
      [named],
      six,
      japan({ [key]: { outside: 0, nagasaki: 0, namesakes: 500 } as BaseEvidence }),
    );
    expect(plan.matches[0]?.decision).toBe("spare");
  });

  it("does not spare a national chain: Nagasaki holds a sliver of it", () => {
    const plan = run([named], six, japan({ [key]: { outside: 300, nagasaki: 4 } }));
    expect(plan.matches[0]?.decision).toBe("hide");
  });

  it("overrides a brand of the Name Suggestion Index, by every name the brand goes by", () => {
    const places = [place("ミモザ食堂 大村店", "restaurant")];
    const records = ["大村", "時津"].map((area) => record(`ミモザ食堂 ${area}店`));
    // 2 here and 1 outside the box against 3 elsewhere: 3 of 6, 50%.
    const born = run(places, records, japan({}, { "mimosa-1": { elsewhere: 3, nagasaki: 1 } }));
    expect(born.matches[0]).toMatchObject({
      decision: "spare",
      spareRules: ["nagasaki_born"],
      signals: [{ kind: "brand_list" }],
    });
    // 2 here and 1 outside the box against 500 elsewhere: a national brand.
    const national = run(
      places,
      records,
      japan({}, { "mimosa-1": { elsewhere: 500, nagasaki: 1 } }),
    );
    expect(national.matches[0]?.decision).toBe("hide");
    // No count for the brand, no sparing.
    expect(run(places, records, japan({})).matches[0]?.decision).toBe("hide");
  });

  it("needs every signal to rest on a Nagasaki-born name", () => {
    const records = ["大村", "時津"].map((area) => record(`ミモザ食堂 ${area}店`));
    const places = [place("ミモザ食堂 大村店", "restaurant")];
    // The brand is Nagasaki-born but the branch pattern is a national chain: both would hide it.
    const nameKey = keyedName("ミモザ食堂").key;
    const evidence = japan(
      { [nameKey]: { outside: 300, nagasaki: 0 } },
      { "mimosa-1": { elsewhere: 0, nagasaki: 1 } },
    );
    expect(run(places, records, evidence).matches[0]?.decision).toBe("hide");
    // A signal with no name behind it (the Overture brand field) never qualifies.
    const branded = place("独立カフェ", "cafe", { refs: [{ provider: "overture", ref: "g-9" }] });
    const withBrand = run(
      [branded],
      [record("独立カフェ", { id: "g-9", brand: { name: "架空ブランド", wikidata: null } })],
      japan({}),
    );
    expect(withBrand.matches[0]).toMatchObject({ decision: "hide" });
  });

  it("does not spare a place that holds a story, whatever its name", () => {
    const plan = run(
      [place(`${base} 大村店`, "restaurant", { protectedBy: ["has a story"] })],
      six,
      japan({ [key]: { outside: 0, nagasaki: 0 } }),
    );
    expect(plan.matches[0]).toMatchObject({ decision: "protected" });
  });

  it("asks for the Japan-wide count of each brand that matched", () => {
    const plan = run([place("ミモザ食堂 大村店", "restaurant")], []);
    expect(plan.evidenceRequest.brands).toEqual([
      { id: "mimosa-1", name: "ミモザ食堂", keys: expect.arrayContaining(["ミモザ食堂"]) },
    ]);
    expect(plan.missingEvidence).toBeGreaterThanOrEqual(1);
  });
});

describe("planChains: a flagship stays", () => {
  const five = ["大村", "時津", "諫早", "長与", "琴海"].map((area) => record(`架空堂 ${area}店`));

  it("spares the head shop of a chain, whether the name is the brand plus 本店 or has an area", () => {
    for (const name of ["架空堂本店", "架空堂 本店", "架空堂総本店", "架空堂 古町本店"]) {
      const plan = run([place(name, "restaurant")], [...five, record(name)]);
      expect(plan.matches[0], name).toMatchObject({ decision: "spare", spareRules: ["flagship"] });
    }
  });

  it("spares the head shop of a brand of the Name Suggestion Index too", () => {
    for (const name of ["ミモザ食堂本店", "ミモザ食堂 総本店", "ミモザ食堂本家"]) {
      const plan = run([place(name, "restaurant")]);
      expect(plan.matches[0], name).toMatchObject({
        decision: "spare",
        spareRules: ["flagship"],
        signals: [{ kind: "brand_list" }],
      });
    }
  });

  it("does not spare a branch, or 本舗 by itself", () => {
    expect(run([place("架空堂 大村店", "restaurant")], five).matches[0]?.decision).toBe("hide");
    expect(
      run(
        [place("架空本舗 大村店", "restaurant")],
        five.map((r) => ({ ...r, name: r.name.replace("架空堂", "架空本舗") })),
      ).matches[0]?.decision,
    ).toBe("hide");
    const honpo = place("ミモザ食堂本舗", "restaurant");
    expect(run([honpo]).matches[0]?.decision).toBe("hide");
  });

  it("gives both reasons when both apply", () => {
    const key = keyedName("架空堂").key;
    const records = [
      ...["大村", "時津", "諫早", "長与", "琴海"].map((area) => record(`架空堂 ${area}店`)),
      record("架空堂 古町本店"),
    ];
    const plan = run(
      [place("架空堂 古町本店", "restaurant")],
      records,
      japan({ [key]: { outside: 0, nagasaki: 0 } }),
    );
    expect(plan.matches[0]).toMatchObject({
      decision: "spare",
      spareRules: ["nagasaki_born", "flagship"],
    });
  });
});
