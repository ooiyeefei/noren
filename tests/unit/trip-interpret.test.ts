import { describe, expect, it } from "vitest";
import { scriptedModel } from "../fixtures/planner";
import { interpretTrip } from "../../src/lib/trip/interpret";

const outline = [{ day: 1, slot: "1:turn", placeName: "Test Garden", kind: "stop" }];
const input = (text: string) => ({
  messages: [{ role: "user" as const, text }],
  outline,
  language: "en" as const,
});
const call = (proposals: unknown[], questions: string[] = [], ops?: unknown[]) => [
  { name: "submit", input: { proposals, questions, ops } },
];

describe("interpretTrip", () => {
  it("sends the latest words, outline and vocabulary without extra party fields", async () => {
    const model = scriptedModel([
      ({ prompt }) => {
        const encoded = JSON.stringify(prompt);
        for (const text of [
          "My mum loves gardens",
          "Test Garden",
          "step-free",
          "nature",
          "redraw",
        ]) {
          expect(encoded).toContain(text);
        }
        expect(encoded).not.toContain("Private traveller");
        return call([{ about: "My mum", kind: "like", tag: "nature", saidAs: "loves gardens" }]);
      },
    ]);
    const request = { ...input("My mum loves gardens"), party: { label: "Private traveller" } };
    await expect(interpretTrip(request, { model })).resolves.toEqual({
      state: "ai",
      proposals: [{ about: "My mum", kind: "like", tag: "nature", saidAs: "loves gardens" }],
      questions: [],
      ops: [],
    });
  });

  it("validates each change with the request schema and grounds it in the latest words and outline", async () => {
    const request = input("Draw another garden, more for my mum, and make today lighter");
    request.messages.unshift({ role: "user", text: "skip the garden" });
    const valid = [
      { op: { op: "redraw", slot: "1:turn" }, saidAs: "Draw another garden" },
      { op: { op: "more_for", day: 1 }, saidAs: "more for my mum", about: "my mum" },
      { op: { op: "lighten", day: 1 }, saidAs: "make today lighter" },
    ];
    const model = scriptedModel([
      () =>
        call(
          [],
          [],
          [
            null,
            { op: { op: "skip", slot: "1:turn" }, saidAs: "skip the garden" },
            { op: { op: "redraw", slot: "not-in-outline" }, saidAs: "Draw another garden" },
            { op: { op: "lighten", day: 2 }, saidAs: "make today lighter" },
            { op: { op: "move_night", night: 1, to: "ipoh" }, saidAs: "make today lighter" },
            {
              op: { op: "stay_longer", slot: "1:turn", minutes: 0 },
              saidAs: "Draw another garden",
            },
            { op: { op: "teleport", day: 1 }, saidAs: "make today lighter" },
            { op: { op: "more_for", who: "t1" }, saidAs: "more for my mum", about: "my mum" },
            { op: { op: "more_for" }, saidAs: "more for my mum", about: "my dad" },
            ...valid,
          ],
        ),
    ]);
    await expect(interpretTrip(request, { model })).resolves.toMatchObject({
      state: "ai",
      ops: valid,
    });
  });

  it("keeps the first six grounded changes in model order", async () => {
    const ops = Array.from({ length: 7 }, (_, i) => ({
      op: { op: "stay_longer", slot: "1:turn", minutes: i + 1 },
      saidAs: "stay longer",
    }));
    const model = scriptedModel([() => call([], [], ops)]);
    await expect(interpretTrip(input("Please stay longer"), { model })).resolves.toMatchObject({
      ops: ops.slice(0, 6),
    });
  });

  it("keeps a single-character Japanese request and drops blank evidence", async () => {
    const op = { op: "weather", day: 1, kind: "rain" };
    const accepted = { op, saidAs: "雨" };
    const model = scriptedModel([() => call([], [], [{ op, saidAs: "  " }, accepted])]);
    await expect(
      interpretTrip({ ...input("雨  "), language: "ja" }, { model }),
    ).resolves.toMatchObject({
      ops: [accepted],
    });
  });

  it("drops unsupported claims and suggestions whose evidence is missing or only in an earlier turn", async () => {
    const model = scriptedModel([
      () =>
        call([
          { about: "my mum", kind: "like", tag: "nature", saidAs: "loves gardens" },
          { about: "my mum", kind: "like", tag: "time-travel", saidAs: "likes coffee" },
          { about: "invented alias", kind: "like", tag: "coffee", saidAs: "likes coffee" },
          { about: "my mum", kind: "like", tag: "coffee", saidAs: "likes coffee" },
        ]),
    ]);
    const request = input("my mum likes coffee");
    request.messages.unshift({ role: "user", text: "my mum loves gardens" });
    const reply = await interpretTrip(request, { model });
    expect(reply.proposals).toEqual([
      { about: "my mum", kind: "like", tag: "coffee", saidAs: "likes coffee" },
    ]);
  });

  it("returns the practical rule without returning the typed condition", async () => {
    const model = scriptedModel([
      () =>
        call([
          { about: "My mum", kind: "rule", tag: "step-free", saidAs: "My mum has arthritis" },
          { about: "arthritis", kind: "rule", tag: "sit-often", saidAs: "has arthritis" },
        ]),
    ]);
    const reply = await interpretTrip(input("My mum has arthritis and needs a seat"), { model });
    expect(reply.proposals).toContainEqual({
      about: "My mum",
      kind: "rule",
      tag: "step-free",
      saidAs: "",
    });
    expect(JSON.stringify(reply)).not.toContain("arthritis");
  });

  it("keeps at most six proposals and three known, distinct question ids", async () => {
    const tags = ["nature", "history", "art", "coffee", "craft", "music", "food"];
    const model = scriptedModel([
      () =>
        call(
          tags.map((tag) => ({ about: "", kind: "like", tag, saidAs: tag })),
          [
            "invented question",
            "stretch-break",
            "stretch-break",
            "entrance-steps",
            "after-lunch-rest",
            "short-walk",
          ],
        ),
    ]);
    const reply = await interpretTrip(input(tags.join(" ")), { model });
    expect(reply.proposals).toHaveLength(6);
    expect(reply.questions.map(({ id }) => id)).toEqual([
      "stretch-break",
      "entrance-steps",
      "after-lunch-rest",
    ]);
    expect(reply.questions[0]).toMatchObject({
      ifYes: { kind: "limit", tag: "stretch", minutes: 90 },
      ifNo: { kind: "limit", tag: "stretch", minutes: 120 },
    });
  });

  it("returns empty lists when the model fails or sends prose", async () => {
    for (const model of [scriptedModel([]), scriptedModel([() => "text"])]) {
      await expect(interpretTrip(input("A short walk, please"), { model })).resolves.toEqual({
        state: "plain",
        proposals: [],
        questions: [],
        ops: [],
      });
    }
  });
});
