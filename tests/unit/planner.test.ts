import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  PlannerUnavailable,
  checkRequest,
  planReply,
  requestValidator,
  type PlannerReply,
  type PlannerRequest,
} from "@/lib/planner";
import { runPlanner, submitSchema } from "@/lib/planner/agent";
import { INTRO_MAX_CHARS, checkIntro, numbersIn } from "@/lib/planner/intro";
import { NEAREST_MAX_METRES, nearestNeighbourhoodId } from "@/lib/planner/nearest";
import { RequestError } from "@/lib/planner/request";
import { checkableTags } from "@/lib/planner/checkable";
import { CONNECTOR_DEFAULTS } from "@/lib/connector/policy";
import { PLANNER_OPTIONS, mergeTags, plannerContext, plannerTools } from "@/lib/planner/tools";
import { TurnLedger } from "@/lib/planner/ledger";
import { createMeta } from "@/lib/ai/meta";
import {
  NOW,
  ORIGIN,
  STORY_TEXT,
  WRITERS,
  emptySubmit,
  fakePlannerData,
  idOf,
  region,
  scriptedModel,
  stop,
  walkOf,
  type Script,
} from "../fixtures/planner";

const request = (
  over: Partial<PlannerRequest> = {},
  text = "Three stops near Shinchi, I like history",
): PlannerRequest => ({
  turns: [{ role: "user", text }],
  memory: { avoid: [], interests: [], done: [] },
  start: { kind: "neighbourhood", id: "shinchi" },
  language: "en",
  ...over,
});

function deps(model: ReturnType<typeof scriptedModel>, data = fakePlannerData()) {
  return {
    deps: { model, data: data.data, region, origin: ORIGIN, now: () => NOW },
    calls: data.calls,
  };
}

const draw =
  (input: Record<string, unknown> = {}): Script =>
  () => [{ name: "suggest_walk", input }];
const openAll =
  (slugs: string[]): Script =>
  () =>
    slugs.map((slug) => ({ name: "get_place", input: { slug } }));
const submit =
  (build: (prompt: Parameters<Script>[0]["prompt"]) => unknown): Script =>
  ({ prompt }) => [{ name: "submit_plan", input: build(prompt) }];

/**
 * The ordinary good run: draw, open every stop, hand over what the model may quote under them. That
 * is a public post and the stitched story at the museum; the members' stories are shown by code.
 */
function goodRun(
  over: (prompt: Parameters<Script>[0]["prompt"]) => Record<string, unknown> = () => ({}),
) {
  return scriptedModel([
    draw({ stops: 3, interests: ["history"], avoid: ["vegetarian"] }),
    openAll(["dejima-museum", "shinchi-noodles", "quiet-kiosk"]),
    submit((prompt) => ({
      ...emptySubmit,
      intro: "Three stops, about 14 minutes on foot, one wild card.",
      stops: [
        {
          slug: "dejima-museum",
          quoteIds: [
            idOf(prompt, "二階の窓"),
            idOf(prompt, "Visitors talk about the harbour view."),
          ],
        },
      ],
      ...over(prompt),
    })),
  ]);
}

describe("a planned walk", () => {
  it("shows the draw's stops in the draw's order, with the draw's reasons and the writers' own words", async () => {
    const { deps: d } = deps(goodRun());
    const reply = await planReply(request(), d);
    expect(reply.state).toBe("ai");
    expect(reply.pickedByAi).toBe(true);
    expect(reply.intro).toBe("Three stops, about 14 minutes on foot, one wild card.");
    const walk = reply.walk!;
    // The model listed the museum first; the draw's order is the noodle shop first.
    expect(walk.stops.map((stop) => stop.place.slug)).toEqual([
      "shinchi-noodles",
      "dejima-museum",
      "quiet-kiosk",
    ]);
    expect(walk.stops[0]!.place.name).toBe("Shinchi Noodles (新地ヌードル)");
    expect(walk.stops.map((stop) => stop.why)).toEqual([
      { kind: "random", hadInterests: true },
      { kind: "matched", interests: ["history"] },
      { kind: "wild" },
    ]);
    expect(walk.stops.map((stop) => [stop.minutes, stop.from])).toEqual([
      [3, "Shinchi (新地中華街)"],
      [6, "Shinchi Noodles (新地ヌードル)"],
      [5, "Dejima Museum (出島資料館)"],
    ]);
    expect(walk.totalMinutes).toBe(14);
    expect(walk.wildCards).toBe(1);
    // What the AI picked: a public post and a stitched sentence, never a member's story.
    expect(walk.stops[1]!.quotes.map((quote) => quote.kind)).toEqual(["found", "stitched"]);
    expect(walk.stops[0]!.quotes).toEqual([]);
    expect(walk.stops[2]!.quotes).toEqual([]);
    // What code attached: the newest two stories at the museum, ticked or not, with the writers' names.
    expect(walk.stops[1]!.stories.map((story) => [story.by, story.text, story.kind])).toEqual([
      [WRITERS.ai, STORY_TEXT.ai, "story"],
      [WRITERS.mika, STORY_TEXT.mika, "story"],
    ]);
    expect(walk.stops[0]!.stories.map((story) => [story.by, story.text])).toEqual([
      [WRITERS.noodles, STORY_TEXT.noodles],
    ]);
    expect(walk.stops[2]!.stories).toEqual([]);
    expect(reply.leftOut).toBe(0);
  });

  it("gives the unconfirmed label's data and the rules Noren could not check, as the draw said them", async () => {
    const data = fakePlannerData({
      walk: async () =>
        walkOf({
          rulesNotChecked: [
            {
              tag: "vegetarian",
              reason:
                "Noren has no menu or ingredient data, so it cannot check this. Ask the place.",
            },
          ],
          rulesApplied: [
            {
              tag: "no-alcohol",
              checks: "leaves out bars and izakaya",
              limit: "Noren cannot tell whether a restaurant or café serves alcohol",
            },
          ],
        }),
    });
    const { deps: d } = deps(goodRun(), data);
    const walk = (await planReply(request(), d)).walk!;
    expect(walk.rulesNotChecked).toEqual([
      {
        tag: "vegetarian",
        reason: "Noren has no menu or ingredient data, so it cannot check this. Ask the place.",
      },
    ]);
    expect(walk.rulesApplied[0]).toMatchObject({ tag: "no-alcohol" });
    expect(walk.stops[0]!.place.confirmed).toBe(false);
    expect(walk.stops[1]!.place.confirmed).toBe(true);
  });

  it("carries a machine translation, a stitched sentence's sources and a found post's author as the page does", async () => {
    const model = scriptedModel([
      draw(),
      openAll(["dejima-museum"]),
      submit((prompt) => ({
        ...emptySubmit,
        answers: [
          {
            notWritten: false,
            slug: "",
            quoteIds: [
              idOf(prompt, "二階の窓"),
              idOf(prompt, "Visitors talk about the harbour view."),
            ],
          },
        ],
      })),
    ]);
    const reply = await planReply(request(), deps(model).deps);
    const [answer] = reply.answers;
    if (answer?.kind !== "quotes") throw new Error("expected quotes");
    const [found, stitched] = answer.quotes;
    expect(found).toMatchObject({
      kind: "found",
      by: "harbour_fan",
      text: "二階の窓から港が見えます",
      translations: [
        {
          language: "en",
          text: "You can see the harbour from the upstairs window.",
          origin: "machine",
        },
      ],
    });
    expect(stitched).toMatchObject({
      kind: "stitched",
      text: "Visitors talk about the harbour view.",
      textJa: "訪れた人は港の眺めを語ります。",
      postsRead: 3,
      sources: [{ number: 1, words: "港が見える" }],
    });
  });
});

describe("what the draw is given", () => {
  it("adds the visitor's saved rules and tastes, today's trip and the start the page set", async () => {
    const model = scriptedModel([
      draw({ stops: 2, avoid: ["vegetarian", "No Pork"], interests: ["history"] }),
      submit(() => emptySubmit),
    ]);
    const { deps: d, calls } = deps(model);
    await planReply(
      request({
        memory: {
          avoid: ["pork-free", "allergy:peanuts"],
          interests: ["coffee", "History"],
          done: [{ label: "Dejima", slug: "dejima-museum" }, { label: "Champon" }],
        },
      }),
      d,
    );
    expect(calls.walks).toHaveLength(1);
    expect(calls.walks[0]).toEqual({
      start: { kind: "neighbourhood", id: "shinchi" },
      count: 2,
      // Saved rules first and never dropped; the model's own, once each.
      avoid: ["pork-free", "allergy:peanuts", "vegetarian", "No Pork"],
      // What was just said first, then the saved tastes.
      interests: ["history", "coffee"],
      adventurousness: "mixed",
      exclude: ["dejima-museum"],
    });
  });

  it("applies a saved rule even when the model passes none", async () => {
    const model = scriptedModel([draw(), submit(() => emptySubmit)]);
    const { deps: d, calls } = deps(model);
    await planReply(request({ memory: { avoid: ["halal"], interests: [], done: [] } }), d);
    expect(calls.walks[0]!.avoid).toEqual(["halal"]);
  });

  it("never shows the model the visitor's saved rules, only what the person said in the chat", async () => {
    const data = fakePlannerData({
      walk: async () =>
        walkOf({
          rulesNotChecked: [
            { tag: "allergy:prawns", reason: "Noren has no data it can check this against." },
          ],
          rulesApplied: [{ tag: "pork-free", checks: "leaves out nothing", limit: "none" }],
          interestsNotMatched: ["ramen"],
        }),
    });
    const model = scriptedModel([draw({ avoid: ["vegetarian"] }), submit(() => emptySubmit)]);
    const { deps: d } = deps(model, data);
    const reply = await planReply(
      request({ memory: { avoid: ["allergy:prawns", "pork-free"], interests: [], done: [] } }),
      d,
    );
    // The page has them, from the draw's own record, to show honestly.
    expect(reply.walk!.rulesNotChecked.map((rule) => rule.tag)).toEqual(["allergy:prawns"]);
    expect(reply.walk!.interestsNotMatched).toEqual(["ramen"]);
    // The model's second step carries the first step's tool result.
    const shown = JSON.stringify(model.doGenerateCalls[1]!.prompt);
    expect(shown).toContain("minutesOnFoot");
    expect(shown).not.toContain("prawns");
    expect(shown).not.toContain("pork-free");
    expect(shown).not.toContain("rules.notChecked");
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).not.toContain("prawns");
  });

  it("starts where the person named in the message, not where the page says", async () => {
    const model = scriptedModel([draw({ neighbourhood: "Dejima" }), submit(() => emptySubmit)]);
    const { deps: d, calls } = deps(model);
    await planReply(request(), d);
    expect(calls.walks[0]!.start).toEqual({ kind: "neighbourhood", id: "dejima" });
  });

  it("starts from a place the page picked", async () => {
    const model = scriptedModel([draw(), submit(() => emptySubmit)]);
    const { deps: d, calls } = deps(model);
    await planReply(request({ start: { kind: "place", slug: "dejima-museum" } }), d);
    expect(calls.walks[0]!.start).toEqual({ kind: "place", slug: "dejima-museum" });
  });

  it("allows two draws and one omikuji a question, then refuses", async () => {
    const model = scriptedModel([
      () => [
        { name: "suggest_walk", input: {} },
        { name: "suggest_walk", input: {} },
        { name: "suggest_walk", input: {} },
        { name: "draw_omikuji", input: {} },
        { name: "draw_omikuji", input: {} },
      ],
      submit(() => emptySubmit),
    ]);
    const { deps: d, calls } = deps(model);
    await planReply(request(), d);
    expect(calls.walks).toHaveLength(2);
    expect(calls.omikuji).toHaveLength(1);
    const results = JSON.stringify(model.doGenerateCalls[1]!.prompt);
    expect(results).toContain("Two walks are enough");
    expect(results).toContain("One slip is enough");
  });

  it("merges tags once each, saved ones first, at most ten", () => {
    expect(mergeTags(["a", "B"], ["b", " c ", ""])).toEqual(["a", "B", "c"]);
    const many = Array.from({ length: 12 }, (_, n) => `t${n}`);
    expect(mergeTags(many.slice(0, 8), many)).toHaveLength(10);
    expect(mergeTags(many.slice(0, 8), many).slice(0, 8)).toEqual(many.slice(0, 8));
  });
});

describe("failing closed", () => {
  const plainStops = (reply: PlannerReply) => {
    expect(reply.state).toBe("plain");
    expect(reply.intro).toBeNull();
    expect(reply.answers).toEqual([]);
    expect(reply.proposals).toEqual([]);
    expect(reply.pickedByAi).toBe(false);
    expect(reply.walk!.stops.map((stop) => stop.place.slug)).toEqual([
      "shinchi-noodles",
      "dejima-museum",
      "quiet-kiosk",
    ]);
    for (const stop of reply.walk!.stops) expect(stop.quotes).toEqual([]);
  };

  it("shows the plain draw when the model never calls submit_plan", async () => {
    const model = scriptedModel([draw(), openAll(["dejima-museum"]), () => "text"]);
    plainStops(await planReply(request(), deps(model).deps));
  });

  it("shows the plain draw when its answer does not fit the schema", async () => {
    const model = scriptedModel([
      draw(),
      submit(() => ({ intro: 5, stops: "all of them" })),
      () => "text",
    ]);
    plainStops(await planReply(request(), deps(model).deps));
  });

  it("shows the plain draw when the model fails after the draw", async () => {
    let step = 0;
    const model = scriptedModel([
      draw(),
      () => {
        step++;
        throw new TypeError("the provider fell over");
      },
    ]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    plainStops(await planReply(request(), deps(model).deps));
    expect(step).toBe(1);
    // The log names the error and carries nothing the person typed.
    const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toMatch(/planner model failed \(/);
    expect(logged).not.toContain("history");
    log.mockRestore();
  });

  it("says it is unavailable when the model fails and there is nothing to show", async () => {
    const model = scriptedModel([
      () => {
        throw new TypeError("down");
      },
    ]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(planReply(request(), deps(model).deps)).rejects.toBeInstanceOf(PlannerUnavailable);
    log.mockRestore();
  });

  it("shows nothing when there was nothing to show, rather than a made-up answer", async () => {
    const model = scriptedModel([() => "text"]);
    const reply = await planReply(request(), deps(model).deps);
    expect(reply).toMatchObject({
      state: "empty",
      walk: null,
      omikuji: null,
      answers: [],
      proposals: [],
    });
  });
});

describe("dropping what the tools never returned", () => {
  it("drops a quote id nobody handed out and a quote filed under the wrong place", async () => {
    const model = scriptedModel([
      draw(),
      openAll(["dejima-museum", "shinchi-noodles"]),
      submit((prompt) => ({
        ...emptySubmit,
        stops: [
          {
            slug: "dejima-museum",
            // q999 was never returned; the stitched sentence is the museum's and stays.
            quoteIds: ["q999", idOf(prompt, "Visitors talk about the harbour view.")],
          },
          // The museum's public post, filed under the noodle shop.
          { slug: "shinchi-noodles", quoteIds: [idOf(prompt, "二階の窓")] },
          // A place that exists but was not in the draw, and one that does not exist at all.
          { slug: "not-in-the-walk", quoteIds: [] },
          { slug: "dejima-museum-2", quoteIds: [] },
        ],
      })),
    ]);
    const reply = await planReply(request(), deps(model).deps);
    expect(reply.state).toBe("ai");
    const museum = reply.walk!.stops.find((stop) => stop.place.slug === "dejima-museum")!;
    expect(museum.quotes.map((quote) => quote.kind)).toEqual(["stitched"]);
    expect(reply.walk!.stops.flatMap((stop) => stop.quotes)).toHaveLength(1);
    expect(reply.leftOut).toBe(4);
  });

  it("caps the quotes under one stop, ignores a repeat, and does not show a story twice", async () => {
    const model = scriptedModel([
      draw(),
      openAll(["dejima-museum"]),
      submit((prompt) => ({
        ...emptySubmit,
        stops: [
          {
            slug: "dejima-museum",
            quoteIds: [
              // Ai Tanaka ticked her story, so the model may point at it; the page shows it already.
              idOf(prompt, STORY_TEXT.ai),
              idOf(prompt, "二階の窓"),
              idOf(prompt, "二階の窓"),
              idOf(prompt, "Visitors talk about the harbour view."),
              idOf(prompt, "Another visitor mentions the cat."),
            ],
          },
        ],
      })),
    ]);
    const reply = await planReply(request(), deps(model).deps);
    const museum = reply.walk!.stops[1]!;
    expect(museum.quotes.map((quote) => quote.kind)).toEqual(["found", "stitched"]);
    expect(museum.stories.filter((story) => story.text === STORY_TEXT.ai)).toHaveLength(1);
    expect(reply.leftOut).toBe(0);
  });

  it("drops an answer whose quotes were never returned, and says so with a count", async () => {
    const model = scriptedModel([
      openAll(["dejima-museum"]),
      submit(() => ({
        ...emptySubmit,
        answers: [{ notWritten: false, slug: "", quoteIds: ["q404", "q405"] }],
      })),
    ]);
    const reply = await planReply(
      request({}, "What do people say about the museum?"),
      deps(model).deps,
    );
    expect(reply.answers).toEqual([]);
    expect(reply.leftOut).toBe(2);
    expect(reply.pickedByAi).toBe(false);
  });

  it("never shows a quote from a tool call in an earlier turn", async () => {
    // The ledger is new for every question, so an id from last turn is simply unknown.
    const model = scriptedModel([
      submit(() => ({
        ...emptySubmit,
        answers: [{ notWritten: false, slug: "", quoteIds: ["q1"] }],
      })),
    ]);
    const reply = await planReply(request({}, "And the museum?"), deps(model).deps);
    expect(reply.answers).toEqual([]);
    expect(reply.leftOut).toBe(1);
  });
});

describe('"Nobody on Noren has written about that yet"', () => {
  const asked = "What do people say about Quiet Kiosk?";

  it("is shown when a lookup found no words at that place", async () => {
    const model = scriptedModel([
      openAll(["quiet-kiosk"]),
      submit(() => ({
        ...emptySubmit,
        answers: [{ notWritten: true, slug: "quiet-kiosk", quoteIds: [] }],
      })),
    ]);
    const reply = await planReply(request({}, asked), deps(model).deps);
    expect(reply.answers).toEqual([
      { kind: "notWritten", place: { slug: "quiet-kiosk", name: "Quiet Kiosk (静かな売店)" } },
    ]);
  });

  it("is shown for a topic when a search found nothing", async () => {
    const model = scriptedModel([
      () => [{ name: "search_places", input: { query: "volcano" } }],
      submit(() => ({ ...emptySubmit, answers: [{ notWritten: true, slug: "", quoteIds: [] }] })),
    ]);
    const reply = await planReply(request({}, "Anything about volcanoes?"), deps(model).deps);
    expect(reply.answers).toEqual([{ kind: "notWritten" }]);
  });

  it("is dropped when the model looked nothing up", async () => {
    const model = scriptedModel([
      submit(() => ({ ...emptySubmit, answers: [{ notWritten: true, slug: "", quoteIds: [] }] })),
    ]);
    const reply = await planReply(request({}, asked), deps(model).deps);
    expect(reply.answers).toEqual([]);
    expect(reply.leftOut).toBe(1);
  });

  it("is dropped when the place it names does have words, or is not a place the tools returned", async () => {
    const model = scriptedModel([
      openAll(["dejima-museum"]),
      submit(() => ({
        ...emptySubmit,
        answers: [
          { notWritten: true, slug: "dejima-museum", quoteIds: [] },
          { notWritten: true, slug: "made-up-place", quoteIds: [] },
        ],
      })),
    ]);
    const reply = await planReply(request({}, asked), deps(model).deps);
    expect(reply.answers).toEqual([]);
    expect(reply.leftOut).toBe(2);
  });
});

describe("the logistics intro", () => {
  const facts = {
    stops: 3,
    totalMinutes: 14,
    wildCards: 1,
    legMinutes: [3, 6, 5],
    placeNames: ["Shinchi Noodles", "出島資料館"],
  };

  it("reads English, kanji and digit numbers", () => {
    expect(numbersIn("Three stops, 14 minutes and one wild card").sort((a, b) => a - b)).toEqual([
      1, 3, 14,
    ]);
    expect(numbersIn("3 stops, 14 minutes").sort()).toEqual([14, 3]);
    expect(numbersIn("twenty-five minutes")).toEqual([25]);
    expect(numbersIn("twenty minutes and five stops").sort((a, b) => a - b)).toEqual([5, 20]);
    expect(numbersIn("３つの場所、十四分、ワイルドカード一つ").sort((a, b) => a - b)).toEqual([
      1, 3, 14,
    ]);
    expect(numbersIn("二十五分")).toEqual([25]);
    expect(numbersIn("十分")).toEqual([10]);
  });

  it("passes a plain line with true numbers", () => {
    expect(checkIntro("Three stops, about 14 minutes on foot, one wild card.", facts)).toBe(
      "Three stops, about 14 minutes on foot, one wild card.",
    );
    expect(
      checkIntro("3つの場所を、歩いて約14分でまわります。ワイルドカードは1つです。", facts),
    ).not.toBeNull();
    expect(checkIntro("The longest leg is 6 minutes.", facts)).not.toBeNull();
  });

  it("refuses a wrong number, a name, a link, markup, a ranking word, praise, and a long or empty line", () => {
    for (const bad of [
      "Four stops, about 14 minutes on foot.",
      "Three stops, about 20 minutes on foot.",
      "Three stops, about 14 minutes, starting at Shinchi Noodles.",
      "出島資料館から歩きます。",
      "Three stops, see https://example.com for more.",
      "Three stops, **14 minutes**.",
      "Three stops <b>14 minutes</b>",
      "Three stops, 14 minutes. The best walk in town.",
      "Three popular stops, 14 minutes.",
      "Three stops, about an hour on foot.",
      "Three stops in 14 minutes. A beautiful route.",
      "人気の3か所を14分で。",
      "Three stops.\nFourteen minutes.",
      "One. Two. Three. Four.",
      "",
      "x".repeat(INTRO_MAX_CHARS + 1),
    ]) {
      expect(checkIntro(bad, facts), bad).toBeNull();
    }
  });

  it("is dropped, and the rest of the answer kept, when it fails", async () => {
    const { deps: d } = deps(goodRun(() => ({ intro: "Four wonderful stops that you must see." })));
    const reply = await planReply(request(), d);
    expect(reply.intro).toBeNull();
    expect(reply.state).toBe("ai");
    expect(reply.walk!.stops[1]!.quotes).toHaveLength(2);
  });

  it("counts only with a walk to describe", async () => {
    const model = scriptedModel([submit(() => ({ ...emptySubmit, intro: "Three stops." }))]);
    expect((await planReply(request(), deps(model).deps)).intro).toBeNull();
  });
});

describe("memory proposals", () => {
  const ask = (text: string, proposals: unknown[], memory = request().memory) => {
    const model = scriptedModel([submit(() => ({ ...emptySubmit, memoryProposals: proposals }))]);
    return planReply(request({ memory }, text), deps(model).deps);
  };

  it("keeps a proposal that rests on the person's own latest words", async () => {
    const reply = await ask("I'm vegetarian now, and forget that I like coffee", [
      { op: "add", kind: "rule", text: "vegetarian", saidAs: "I'm vegetarian now" },
      { op: "remove", kind: "taste", text: "coffee", saidAs: "forget that I like coffee" },
    ]);
    expect(reply.proposals).toEqual([
      { id: "p1", op: "add", kind: "rule", text: "vegetarian", saidAs: "I'm vegetarian now" },
      {
        id: "p2",
        op: "remove",
        kind: "taste",
        text: "coffee",
        saidAs: "forget that I like coffee",
      },
    ]);
    expect(reply.state).toBe("ai");
  });

  it("drops a proposal the person's words do not support", async () => {
    const reply = await ask("Three stops near Shinchi", [
      { op: "add", kind: "rule", text: "vegan", saidAs: "I am vegan" },
      { op: "add", kind: "rule", text: "halal", saidAs: "" },
    ]);
    expect(reply.proposals).toEqual([]);
    expect(reply.leftOut).toBe(2);
  });

  it("does not take words from earlier turns or from the model's own turns", async () => {
    const model = scriptedModel([
      submit(() => ({
        ...emptySubmit,
        memoryProposals: [{ op: "add", kind: "rule", text: "vegan", saidAs: "I am vegan" }],
      })),
    ]);
    const reply = await planReply(
      request({
        turns: [
          { role: "user", text: "I am vegan" },
          { role: "assistant", text: "Noted." },
          { role: "user", text: "Show me three stops" },
        ],
      }),
      deps(model).deps,
    );
    expect(reply.proposals).toEqual([]);
  });

  it("leaves out a change the memory already has, and a repeat", async () => {
    const reply = await ask(
      "I'm vegetarian. I'm vegetarian.",
      [
        { op: "add", kind: "rule", text: "vegetarian", saidAs: "I'm vegetarian" },
        { op: "remove", kind: "rule", text: "halal", saidAs: "I'm vegetarian" },
      ],
      { avoid: ["vegetarian"], interests: [], done: [] },
    );
    expect(reply.proposals).toEqual([]);
    expect(reply.leftOut).toBe(0);
  });

  it("drops a phrase that is too long or has markup", async () => {
    const reply = await ask("I like coffee", [
      { op: "add", kind: "taste", text: "coffee".repeat(10), saidAs: "I like coffee" },
      { op: "add", kind: "taste", text: "<b>coffee</b>", saidAs: "I like coffee" },
    ]);
    expect(reply.proposals).toEqual([]);
  });

  it("proposes nothing from what a story says", async () => {
    // A story is shown to the model as a tool result. Even if it tells the model to remember
    // something, the words must come from the person's own message.
    const reply = await ask("Show me the museum", [
      { op: "add", kind: "rule", text: "halal", saidAs: STORY_TEXT.ai },
    ]);
    expect(reply.proposals).toEqual([]);
  });
});

describe("the request", () => {
  const base = request();

  it("trims, dedupes tags and keeps the start", () => {
    const checked = checkRequest({
      ...base,
      turns: [{ role: "user", text: "  hello  " }],
      memory: {
        avoid: [" Vegetarian", "vegetarian", ""],
        interests: ["history", "History"],
        done: [{ label: " Champon ", slug: "x" }],
      },
    });
    expect(checked.turns[0]!.text).toBe("hello");
    expect(checked.memory).toEqual({
      avoid: ["Vegetarian"],
      interests: ["history"],
      done: [{ label: "Champon", slug: "x" }],
    });
    expect(checked.start).toEqual(base.start);
  });

  it("refuses what is too big or has no question", () => {
    const user = (text: string) => ({ role: "user" as const, text });
    const bad: Partial<PlannerRequest>[] = [
      { turns: [] },
      { turns: Array.from({ length: 9 }, () => user("x")) },
      { turns: [user("x".repeat(701))] },
      { turns: [user("hi"), { role: "assistant", text: "hello" }] },
      { turns: [{ role: "assistant", text: "hello" }, user("hi")] },
      { turns: [user("   ")] },
      { memory: { avoid: Array.from({ length: 9 }, (_, n) => `r${n}`), interests: [], done: [] } },
      { memory: { avoid: ["x".repeat(41)], interests: [], done: [] } },
      {
        memory: {
          avoid: [],
          interests: [],
          done: Array.from({ length: 13 }, (_, n) => ({ label: `d${n}` })),
        },
      },
      { memory: { avoid: [], interests: [], done: [{ label: "x".repeat(81) }] } },
    ];
    for (const over of bad) expect(() => checkRequest({ ...base, ...over })).toThrow(RequestError);
  });

  it("has no field a location could travel in", () => {
    const text = JSON.stringify((requestValidator as unknown as { json: unknown }).json);
    expect(text).not.toMatch(
      /"(lat|lng|latitude|longitude|coordinates?|position|location|accuracy)"/i,
    );
    const context = plannerContext(
      {
        ...fakePlannerData(),
        data: fakePlannerData().data,
        region,
        origin: ORIGIN,
        now: () => NOW,
        locale: "en",
        memory: base.memory,
      },
      new TurnLedger(),
    );
    for (const [name, tool] of Object.entries(plannerTools(context))) {
      const schema = JSON.stringify(z.toJSONSchema(tool.inputSchema as z.ZodType));
      expect(schema, name).not.toMatch(/"(lat|lng|latitude|longitude|coordinates?)"/i);
    }
    expect(JSON.stringify(z.toJSONSchema(submitSchema))).not.toMatch(
      /"(lat|lng|latitude|longitude)"/i,
    );
  });

  it("never lets a coordinate reach the data, whatever the model passes", async () => {
    const model = scriptedModel([
      () => [
        { name: "suggest_walk", input: { neighbourhood: "shinchi", lat: 32.74, lng: 129.87 } },
      ],
      submit(() => emptySubmit),
    ]);
    const { deps: d, calls } = deps(model);
    await planReply(request(), d);
    expect(JSON.stringify(calls)).not.toMatch(/32\.74|129\.87|"lat"|"lng"/);
  });
});

describe("nearest to me, worked out on the phone", () => {
  it("returns only a neighbourhood's id", () => {
    const shinchi = { kind: "read" as const, lat: 32.7416, lng: 129.8756, accuracy: 10 };
    const result = nearestNeighbourhoodId(shinchi, region);
    expect(result).toEqual({ kind: "found", neighbourhoodId: "shinchi" });
    expect(JSON.stringify(result)).not.toMatch(/32\.74|129\.87|lat|lng|accuracy/);
  });

  it("falls back to the nearest centre within reach, and asks when too far", () => {
    // Between circles, about 600 m from Shinchi.
    const near = nearestNeighbourhoodId(
      { kind: "read", lat: 32.7415, lng: 129.8825, accuracy: 20 },
      region,
    );
    expect(near.kind).toBe("found");
    const far = nearestNeighbourhoodId(
      { kind: "read", lat: 33.5, lng: 130.4, accuracy: 20 },
      region,
    );
    expect(far).toEqual({ kind: "far" });
    expect(NEAREST_MAX_METRES).toBe(5000);
  });

  it("passes a refusal through as it is", () => {
    for (const kind of ["denied", "unavailable", "timeout", "unsupported"] as const) {
      expect(nearestNeighbourhoodId({ kind }, region)).toEqual({ kind });
    }
  });
});

describe("the same run on Anthropic and on Meta", () => {
  const body = (call: unknown) => JSON.parse((call as [string, RequestInit])[1].body as string);
  const submitInput = {
    ...emptySubmit,
    intro: "Three stops, about 14 minutes on foot, one wild card.",
  };

  function stubFetch(respond: (n: number, body: Record<string, unknown>) => unknown) {
    let n = 0;
    return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(init!.body as string) as Record<string, unknown>;
      return new Response(JSON.stringify(respond(n++, payload)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  }

  const env = (data = fakePlannerData().data) => ({
    data,
    region,
    origin: ORIGIN,
    now: () => NOW,
    locale: "en" as const,
    memory: { avoid: ["halal"], interests: [], done: [] },
    start: { kind: "neighbourhood" as const, id: "shinchi" },
  });

  it("Claude: tool_choice is left on auto and the answer is read from submit_plan", async () => {
    const fetchStub = stubFetch((n) => ({
      id: `msg_${n}`,
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      content:
        n === 0
          ? [{ type: "tool_use", id: "toolu_1", name: "suggest_walk", input: { stops: 3 } }]
          : [{ type: "tool_use", id: "toolu_2", name: "submit_plan", input: submitInput }],
    }));
    const model = createAnthropic({ apiKey: "test-key", fetch: fetchStub as never })(
      "claude-sonnet-5-5",
    );
    const run = await runPlanner(request(), env(), { model, maxOutputTokens: 8000 });
    expect(run.modelFailed).toBe(false);
    expect(run.submit?.intro).toContain("Three stops");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    for (const call of fetchStub.mock.calls) {
      const sent = body(call);
      expect([undefined, "auto"]).toContain(sent.tool_choice?.type);
      expect(sent.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
        "draw_omikuji",
        "get_place",
        "search_places",
        "submit_plan",
        "suggest_walk",
      ]);
      expect(JSON.stringify(sent)).not.toMatch(/"(lat|lng)"/);
    }
  });

  it("Meta: tool_choice is left on auto too", async () => {
    const fetchStub = stubFetch((n) => ({
      id: `chat_${n}`,
      object: "chat.completion",
      created: 1,
      model: "muse-spark-1.3",
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              n === 0
                ? {
                    id: "call_1",
                    type: "function",
                    function: { name: "suggest_walk", arguments: JSON.stringify({ stops: 3 }) },
                  }
                : {
                    id: "call_2",
                    type: "function",
                    function: { name: "submit_plan", arguments: JSON.stringify(submitInput) },
                  },
            ],
          },
        },
      ],
    }));
    const model = createMeta({ apiKey: "test-key", fetch: fetchStub as never })("muse-spark-1.3");
    const { data, calls } = fakePlannerData();
    const run = await runPlanner(request(), env(data), { model });
    expect(run.modelFailed).toBe(false);
    expect(run.submit?.intro).toContain("Three stops");
    expect(calls.walks[0]!.avoid).toEqual(["halal"]);
    for (const call of fetchStub.mock.calls) {
      const sent = body(call);
      expect([undefined, "auto"]).toContain(sent.tool_choice);
      expect(
        sent.tools.map((tool: { function: { name: string } }) => tool.function.name),
      ).toContain("submit_plan");
    }
  });
});

describe("which saved rules the draw can check", () => {
  it("lists only what Noren has data for, and nothing that rests on an owner's statement before launch", () => {
    expect(region.legal.launchPackComplete).toBe(false);
    const tags = checkableTags(region);
    expect(tags).toContain("no-alcohol");
    for (const owner of ["step-free", "cash-free", "no-reservation", "photo-friendly"]) {
      expect(tags).not.toContain(owner);
    }
    for (const unknown of [
      "vegetarian",
      "vegan",
      "halal",
      "pork-free",
      "short-walks",
      "low-budget",
    ]) {
      expect(tags).not.toContain(unknown);
    }
  });

  it("adds the owner-statement rules once the launch pack is complete", () => {
    const launched = { ...region, legal: { ...region.legal, launchPackComplete: true } };
    expect(checkableTags(launched)).toEqual(
      expect.arrayContaining(["no-alcohol", "step-free", "cash-free", "no-reservation"]),
    );
    expect(checkableTags(launched)).not.toContain("vegetarian");
  });
});

describe("a member's story and an AI that was not allowed to read it", () => {
  /** Everything a model was sent over the whole question: instructions, messages, tools, results. */
  const allInput = (model: ReturnType<typeof scriptedModel>) =>
    JSON.stringify(model.doGenerateCalls);
  const unticked = [
    STORY_TEXT.mika,
    WRITERS.mika,
    STORY_TEXT.noodles,
    WRITERS.noodles,
    STORY_TEXT.tom,
    WRITERS.tom,
  ];

  it("never sends an un-ticked story's words or its writer's name to the model, and sends a ticked one", async () => {
    const model = goodRun();
    await planReply(request(), deps(model).deps);
    expect(model.doGenerateCalls.length).toBeGreaterThan(2);
    const sent = allInput(model);
    for (const secret of unticked) expect(sent, secret).not.toContain(secret);
    // Ai Tanaka ticked the box, so the model may read her story and her name.
    expect(sent).toContain(STORY_TEXT.ai);
    expect(sent).toContain(WRITERS.ai);
  });

  it("only counts the stories it holds back, so the model can tell people have written there", async () => {
    const model = goodRun();
    await planReply(request(), deps(model).deps);
    const sent = allInput(model);
    // Two of the museum's three stories are un-ticked, and one of the noodle shop's one.
    expect(sent).toMatch(/"total":3/);
    expect(sent).toMatch(/"heldBack":2/);
    expect(sent).toMatch(/"heldBack":1/);
    expect(sent).toContain("have not allowed Noren to hand their words to AI assistants");
  });

  it("still shows the person every story, under its stop, with the writer's name", async () => {
    const reply = await planReply(request(), deps(goodRun()).deps);
    const [noodles, museum] = reply.walk!.stops;
    expect(museum!.stories.map((story) => [story.by, story.text])).toEqual([
      [WRITERS.ai, STORY_TEXT.ai],
      [WRITERS.mika, STORY_TEXT.mika],
    ]);
    expect(noodles!.stories.map((story) => [story.by, story.text])).toEqual([
      [WRITERS.noodles, STORY_TEXT.noodles],
    ]);
    // The third story at the museum is older than the two shown; the page's own link has it.
    expect(JSON.stringify(reply)).not.toContain(STORY_TEXT.tom);
    // They are not the AI's picks: the label would not be needed for them alone.
    expect(museum!.stories.every((story) => story.id.startsWith("story:"))).toBe(true);
  });

  it("shows them without the AI label when the AI picked nothing", async () => {
    const model = scriptedModel([draw(), () => "text"]);
    const reply = await planReply(request(), deps(model).deps);
    expect(reply.state).toBe("plain");
    expect(reply.pickedByAi).toBe(false);
    expect(reply.walk!.stops[1]!.stories.map((story) => story.by)).toEqual([
      WRITERS.ai,
      WRITERS.mika,
    ]);
    expect(allInput(model)).not.toContain(STORY_TEXT.mika);
  });

  it("shows them even when the model never opens the stops, and when it fails", async () => {
    const quiet = scriptedModel([draw(), submit(() => emptySubmit)]);
    const reply = await planReply(request(), deps(quiet).deps);
    expect(reply.walk!.stops[1]!.stories).toHaveLength(2);
    const failing = scriptedModel([
      draw(),
      () => {
        throw new TypeError("down");
      },
    ]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const afterFailure = await planReply(request(), deps(failing).deps);
    expect(afterFailure.walk!.stops[1]!.stories).toHaveLength(2);
    log.mockRestore();
  });

  it("reads each drawn stop's page once, however often the model also opens it", async () => {
    const { deps: d, calls } = deps(goodRun());
    await planReply(request(), d);
    expect(calls.bundles.toSorted()).toEqual(["dejima-museum", "quiet-kiosk", "shinchi-noodles"]);
  });

  it("leaves a stop without stories, and keeps the walk, when its page cannot be read", async () => {
    const real = fakePlannerData();
    const data = fakePlannerData({
      placeBundle: async (slug) => {
        if (slug === "dejima-museum") throw new TypeError("could not read");
        return real.data.placeBundle(slug);
      },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const reply = await planReply(request(), deps(goodRun(), data).deps);
    log.mockRestore();
    expect(reply.walk!.stops.map((stop) => stop.stories.length)).toEqual([1, 0, 0]);
  });

  it("does not take 'nobody has written about it' from the model where stories exist that it could not see", async () => {
    const model = scriptedModel([
      openAll(["shinchi-noodles"]),
      submit(() => ({
        ...emptySubmit,
        answers: [{ notWritten: true, slug: "shinchi-noodles", quoteIds: [] }],
      })),
    ]);
    const reply = await planReply(
      request({}, "What do people say about the noodle shop?"),
      deps(model).deps,
    );
    expect(reply.answers).toEqual([]);
    expect(reply.leftOut).toBe(1);
  });

  it("holds back a member's note on a post they shared, since no tick covers it", async () => {
    const real = fakePlannerData();
    const note = {
      _id: "src-9",
      platform: "instagram",
      canonicalUrl: "https://example.test/p/9",
      creatorNote: "My own line about the kiosk, which only I wrote.",
      noteLang: "en",
      sharedBy: "Rina Ota",
      isMock: false,
    };
    const data = fakePlannerData({
      placeBundle: async (slug) => {
        const bundle = await real.data.placeBundle(slug);
        return slug === "quiet-kiosk" && bundle !== null
          ? ({ ...bundle, sources: [note] } as typeof bundle)
          : bundle;
      },
    });
    const model = goodRun();
    await planReply(request(), deps(model, data).deps);
    const sent = allInput(model);
    expect(sent).not.toContain("My own line about the kiosk");
    expect(sent).not.toContain("Rina Ota");
    expect(sent).toMatch(/"heldBack":1/);
  });

  it("runs the planner under the same story policy as the connector", () => {
    expect(PLANNER_OPTIONS).toEqual(CONNECTOR_DEFAULTS);
    expect(PLANNER_OPTIONS.memberStories).toBe("opted-in");
  });
});

describe("the visitor's saved likes and the model", () => {
  const known = ["history", "old tram lines", "halal food"];
  /** A draw that, like the real one, says the museum matches each interest it was given that it knows. */
  const echoing = () =>
    fakePlannerData({
      walk: async (asked) =>
        walkOf({
          stops: [
            stop("shinchi-noodles"),
            stop("dejima-museum", {
              matchedInterests: asked.interests.filter((tag) => known.includes(tag.toLowerCase())),
            }),
            stop("quiet-kiosk", { wildCard: true }),
          ],
        }),
    });
  const saved = { avoid: ["halal"], interests: known, done: [] };
  const inputOf = (model: ReturnType<typeof scriptedModel>) =>
    JSON.stringify(model.doGenerateCalls);
  const promptsOf = (model: ReturnType<typeof scriptedModel>) =>
    JSON.stringify(model.doGenerateCalls.map((call) => call.prompt));

  it("never reach the model, in any step of a turn, though the draw uses them", async () => {
    const model = scriptedModel([draw(), openAll(["dejima-museum"]), submit(() => emptySubmit)]);
    const reply = await planReply(
      request({ memory: saved }, "Three stops near Shinchi"),
      deps(model, echoing()).deps,
    );
    // The draw leaned on them, and the page can say so from code.
    expect(reply.walk!.stops[1]!.why).toEqual({ kind: "matched", interests: known });
    // The model heard none of them: not in the messages, the results or the tool definitions.
    const everything = inputOf(model);
    for (const like of ["old tram lines", "halal food"])
      expect(everything, like).not.toContain(like);
    // The tool definitions name "history" as an example; the messages and results must not.
    const prompts = promptsOf(model);
    for (const like of ["history", "halal", "tram"])
      expect(prompts, like).not.toMatch(new RegExp(like, "i"));
    // What it was told about the stop is neutral.
    expect(prompts).toContain("Drawn at random from places near the start");
  });

  it("let an interest the person typed in this message through", async () => {
    const model = scriptedModel([
      draw({ interests: ["old tram lines"] }),
      openAll(["dejima-museum"]),
      submit(() => emptySubmit),
    ]);
    await planReply(
      request({ memory: saved }, "Three stops near Shinchi, I like old tram lines"),
      deps(model, echoing()).deps,
    );
    const prompts = promptsOf(model);
    expect(prompts).toContain("Matches your interest in old tram lines");
    for (const like of ["history", "halal", "halal food"]) {
      expect(prompts, like).not.toMatch(new RegExp(like, "i"));
    }
  });

  it("do not make the model think the person's interests failed to match", async () => {
    // The model passed none; the page's "does not match your interests" wording would have told it
    // that the person has some.
    const model = scriptedModel([draw(), submit(() => emptySubmit)]);
    await planReply(request({ memory: saved }, "Three stops"), deps(model, echoing()).deps);
    expect(promptsOf(model)).not.toContain("does not match your interests");
  });

  it("are still named in the reasons the person reads", async () => {
    const model = scriptedModel([
      draw({ interests: ["old tram lines"] }),
      submit(() => emptySubmit),
    ]);
    const reply = await planReply(
      request({ memory: saved }, "Three stops, I like old tram lines"),
      deps(model, echoing()).deps,
    );
    expect(reply.walk!.stops[1]!.why).toEqual({
      kind: "matched",
      interests: ["old tram lines", "history", "halal food"],
    });
  });
});
