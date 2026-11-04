import { describe, expect, it } from "vitest";
import { keyedName } from "../../src/lib/chains/names";
import type { NsiBrand } from "../../src/lib/chains/nsi";
import { planChains, type PublicPlace, type SnapshotRecord } from "../../src/lib/chains/plan";

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
const run = (
  places: PublicPlace[],
  records: SnapshotRecord[] = [],
  evidence?: ReadonlyMap<string, { outside: number }>,
) => planChains({ places, records, brands, nsiVersion: "9.9", evidence });
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
      new Map([[key, { outside: 40 }]]),
    );
    expect(found.matches).toMatchObject([{ decision: "hide", japanWideOnly: true }]);
    expect(found.matches[0]!.signals[0]!.reason).toContain("40 places outside Nagasaki prefecture");
    // Fewer than five outside are namesakes, and change nothing either way.
    const few = run(
      [place("架空ラーメン亭 大村店", "restaurant")],
      records,
      new Map([[key, { outside: 4 }]]),
    );
    expect(few.matches).toEqual([]);
    const fewLocal = run(
      [place("架空ラーメン亭 大村店", "restaurant")],
      chain(3),
      new Map([[key, { outside: 4 }]]),
    );
    expect(fewLocal.matches[0]?.decision).toBe("spare");
  });

  it("ignores the Japan-wide count for a base name of two characters", () => {
    const records = [record("美山 大村店")];
    const key = keyedName("美山").key;
    const plan = run(
      [place("美山 大村店", "restaurant")],
      records,
      new Map([[key, { outside: 40 }]]),
    );
    expect(plan.matches).toEqual([]);
  });

  it("asks for a Japan-wide count of every base it looked at, and says how many are missing", () => {
    const plan = run([place("架空ラーメン亭 大村店", "restaurant")], chain(3));
    expect(plan.evidenceRequest).toContainEqual({
      key: keyedName("架空ラーメン亭").key,
      base: "架空ラーメン亭",
    });
    expect(plan.missingEvidence).toBe(plan.evidenceRequest.length);
    const key = keyedName("架空ラーメン亭").key;
    const covered = run(
      [place("架空ラーメン亭 大村店", "restaurant")],
      chain(3),
      new Map([[key, { outside: 0 }]]),
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
