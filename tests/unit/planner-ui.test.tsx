import { ConvexError } from "convex/values";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlanView, type PlanViewProps } from "@/components/planner/plan-view";
import { failureCode } from "@/components/planner/plan-screen";
import { SignInPrompt } from "@/components/planner/plan-container";
import {
  ReplyView,
  drawText,
  proposalText,
  summaryLine,
  whyText,
} from "@/components/planner/reply-view";
import {
  StartPicker,
  neighbourhoodName,
  type StartPickerProps,
} from "@/components/planner/start-picker";
import { AVOID_RULES } from "@/lib/draw/rules";
import { DRAW_TEXT_JA } from "@/lib/i18n/messages/planner";
import {
  JAPAN_UTC_OFFSET_HOURS,
  MEMORY_STORAGE_KEY,
  addRule,
  createMemoryStore,
  emptyMemory,
  ruleLabel,
  type KeyValueStore,
} from "@/lib/memory";
import { answerProposal } from "@/lib/planner/answer";
import {
  chatReducer,
  emptyChat,
  replySummary,
  requestTurns,
  type ChatState,
  type ProposalState,
} from "@/lib/planner/chat";
import { planReply, type PlannerReply } from "@/lib/planner";
import { matchPlaces, startForRequest, type PlaceOption } from "@/lib/planner/start";
import { resolveAvoid } from "@/lib/draw";
import {
  NOW,
  ORIGIN,
  STORY_TEXT,
  emptySubmit,
  fakePlannerData,
  idOf,
  region,
  scriptedModel,
  type Script,
} from "../fixtures/planner";

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(all)];
}
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const clock = { now: NOW, utcOffsetHours: JAPAN_UTC_OFFSET_HOURS };

/** A real reply, made the way the server makes it: a scripted model against fixture data. */
async function realReply(
  script: Script[],
  over: { memory?: { avoid: string[] } } = {},
): Promise<PlannerReply> {
  const { data } = fakePlannerData();
  return await planReply(
    {
      turns: [{ role: "user", text: "Three stops near Shinchi. I'm vegetarian now." }],
      memory: { avoid: over.memory?.avoid ?? [], interests: [], done: [] },
      start: { kind: "neighbourhood", id: "shinchi" },
      language: "en",
    },
    { model: scriptedModel(script), data, region, origin: ORIGIN, now: () => NOW },
  );
}

const planScript = (
  extra: (prompt: Parameters<Script>[0]["prompt"]) => Record<string, unknown> = () => ({}),
): Script[] => [
  () => [{ name: "suggest_walk", input: { interests: ["history"] } }],
  () =>
    ["dejima-museum", "shinchi-noodles", "quiet-kiosk"].map((slug) => ({
      name: "get_place",
      input: { slug },
    })),
  ({ prompt }) => [
    {
      name: "submit_plan",
      input: {
        ...emptySubmit,
        intro: "Three stops, about 14 minutes on foot, one wild card.",
        stops: [
          {
            slug: "dejima-museum",
            quoteIds: [idOf(prompt, STORY_TEXT.ai), idOf(prompt, STORY_TEXT.mika)],
          },
          { slug: "shinchi-noodles", quoteIds: [idOf(prompt, STORY_TEXT.noodles)] },
        ],
        ...extra(prompt),
      },
    },
  ],
];

const noProposals: readonly ProposalState[] = [];
const viewProps = (reply: PlannerReply, over: Partial<Parameters<typeof ReplyView>[0]> = {}) => ({
  locale: "en" as const,
  reply,
  proposals: noProposals,
  ruleLabels: {},
  interestLabel: (tag: string) => tag,
  onAnswer: vi.fn(),
  ...over,
});

describe("a planned walk on the page", () => {
  it("shows the AI label, the logistics line, the draw's stops and the writers' own words", async () => {
    const reply = await realReply(planScript());
    const html = render(<ReplyView {...viewProps(reply)} />);
    const body = text(html);
    expect(body).toContain("Picked by Noren's AI from members' stories");
    expect(body).toContain("Three stops, about 14 minutes on foot, one wild card.");
    // English first, Japanese beside it, in the draw's order.
    expect(body.indexOf("Shinchi Noodles (新地ヌードル)")).toBeLessThan(
      body.indexOf("Dejima Museum (出島資料館)"),
    );
    expect(body.indexOf("Dejima Museum (出島資料館)")).toBeLessThan(
      body.indexOf("Quiet Kiosk (静かな売店)"),
    );
    for (const words of [STORY_TEXT.ai, STORY_TEXT.mika, STORY_TEXT.noodles])
      expect(body).toContain(words);
    for (const writer of ["By Ai Tanaka", "By Mika Sato", "By Ken Mori"])
      expect(body).toContain(writer);
    // The draw's reasons, in its own words.
    expect(body).toContain("Matches your interest in history");
    expect(body).toContain("Wild card — not picked for you");
    expect(body).toContain("3 min on foot from Shinchi (新地中華街)");
    expect(html).toContain('href="/en/places/dejima-museum"');
    expect(html).toContain('data-label="ai"');
    expect(body).toContain("This is not a ranking and not a recommendation");
  });

  it("labels a place nobody has confirmed, and offers the first story where nobody has written", async () => {
    const html = render(<ReplyView {...viewProps(await realReply(planScript()))} />);
    expect(text(html)).toContain("Not yet confirmed");
    expect(text(html)).toContain("Nobody has written about this place yet.");
    expect(html).toContain('href="/en/places/quiet-kiosk?tab=stories&amp;write=1"');
  });

  it("without the AI's words shows the plain draw, says so, and has no quote or AI label", async () => {
    const reply = await realReply([() => [{ name: "suggest_walk", input: {} }], () => "text"]);
    expect(reply.state).toBe("plain");
    const html = render(<ReplyView {...viewProps(reply)} />);
    const body = text(html);
    expect(body).toContain("Drawn at random by Noren. No AI wrote any of this.");
    expect(body).toContain("couldn't be checked against members' stories");
    expect(body).toContain("3 stops, about 14 minutes on foot, 1 wild card.");
    expect(body).not.toContain("Picked by Noren's AI");
    expect(html).not.toContain("<blockquote");
    expect(html).toContain('data-label="drawn"');
  });

  it("tells the visitor how many of the AI's picks were left out", async () => {
    const reply = await realReply(
      planScript(() => ({ answers: [{ notWritten: false, slug: "", quoteIds: ["q404"] }] })),
    );
    expect(reply.leftOut).toBe(1);
    expect(text(render(<ReplyView {...viewProps(reply)} />))).toContain("left out");
  });

  it("shows what Noren could not check, with the visitor's own word for each rule", async () => {
    const { data } = fakePlannerData({
      walk: async () => ({
        ok: true,
        start: { kind: "neighbourhood", neighbourhoodId: "shinchi", names: [] },
        stops: [],
        rulesApplied: [
          {
            tag: "no-alcohol",
            checks: "leaves out bars and izakaya",
            limit: "Noren cannot tell whether a restaurant or café serves alcohol",
          },
        ],
        rulesNotChecked: [
          { tag: "allergy:prawns", reason: "Noren has no data it can check this against." },
        ],
        interestsNotMatched: ["ramen"],
      }),
    });
    const reply = await planReply(
      {
        turns: [{ role: "user", text: "walk" }],
        memory: { avoid: ["allergy:prawns"], interests: [], done: [] },
        start: { kind: "neighbourhood", id: "shinchi" },
        language: "en",
      },
      {
        model: scriptedModel([() => [{ name: "suggest_walk", input: {} }], () => "text"]),
        data,
        region,
        origin: ORIGIN,
        now: () => NOW,
      },
    );
    const labels = { "allergy:prawns": "Allergy: prawns", "no-alcohol": "No alcohol" };
    const body = text(render(<ReplyView {...viewProps(reply, { ruleLabels: labels })} />));
    expect(body).toContain("Rules Noren can't check");
    expect(body).toContain("Allergy: prawns: Noren has no data it can check this against.");
    expect(body).toContain("No alcohol: Noren leaves out bars and izakaya.");
    expect(body).toContain("Noren doesn't know how to match: ramen");
    expect(body).toContain("Noren found no places near the start");
  });

  it("shows a found post with its author, a link to the original and a machine translation", async () => {
    const reply = await realReply([
      () => [{ name: "get_place", input: { slug: "dejima-museum" } }],
      ({ prompt }) => [
        {
          name: "submit_plan",
          input: {
            ...emptySubmit,
            answers: [
              {
                notWritten: false,
                slug: "",
                quoteIds: [
                  idOf(prompt, "二階の窓"),
                  idOf(prompt, "Visitors talk about the harbour"),
                ],
              },
            ],
          },
        },
      ],
    ]);
    const html = render(<ReplyView {...viewProps(reply)} />);
    const body = text(html);
    expect(body).toContain("Found by Noren in a public post by harbour_fan");
    expect(body).toContain("二階の窓から港が見えます");
    expect(body).toContain("Machine translation");
    expect(body).toContain("You can see the harbour from the upstairs window.");
    expect(html).toMatch(
      /href="https:\/\/example\.test\/review\/1"[^>]*rel="noopener noreferrer nofollow"/,
    );
    // The stitched sentence carries Noren's own label with the number of posts, and its sources.
    expect(body).toContain("Stitched by Noren's AI from 3 posts");
    expect(body).toContain("港が見える");
    expect(body).toContain("What people wrote");
    // The place is named above words shown away from their place.
    expect(html).toContain('href="/en/places/dejima-museum"');
  });

  it('says "Nobody on Noren has written about that yet" with a link to write', async () => {
    const reply = await realReply([
      () => [{ name: "get_place", input: { slug: "quiet-kiosk" } }],
      () => [
        {
          name: "submit_plan",
          input: {
            ...emptySubmit,
            answers: [{ notWritten: true, slug: "quiet-kiosk", quoteIds: [] }],
          },
        },
      ],
    ]);
    const html = render(<ReplyView {...viewProps(reply)} />);
    expect(text(html)).toContain("Nobody on Noren has written about that yet.");
    expect(text(html)).toContain("Write about Quiet Kiosk (静かな売店)");
    expect(html).toContain('href="/en/places/quiet-kiosk?tab=stories&amp;write=1"');

    const topic = await realReply([
      () => [{ name: "search_places", input: { query: "volcano" } }],
      () => [
        {
          name: "submit_plan",
          input: { ...emptySubmit, answers: [{ notWritten: true, slug: "", quoteIds: [] }] },
        },
      ],
    ]);
    const topicHtml = render(<ReplyView {...viewProps(topic)} />);
    expect(text(topicHtml)).toContain("Find a place and write the first story");
    expect(topicHtml).toContain('href="/en/map"');
  });

  it("shows the omikuji slip from its template, with the place", () => {
    const reply: PlannerReply = {
      state: "plain",
      intro: null,
      needsStart: false,
      walk: null,
      omikuji: {
        day: "2026-11-10",
        area: { id: "shinchi", en: "Shinchi", ja: "新地中華街" },
        place: {
          slug: "quiet-kiosk",
          name: "Quiet Kiosk (静かな売店)",
          category: null,
          neighbourhood: null,
          hasStory: false,
          confirmed: false,
          demo: false,
        },
        slip: {
          en: "Nobody has written about this one yet. Go in and be the first.",
          ja: "ここについて、まだ誰も書いていません。入って、最初の一人になりましょう。",
        },
      },
      answers: [],
      proposals: [],
      leftOut: 0,
      pickedByAi: false,
    };
    const body = text(render(<ReplyView {...viewProps(reply)} />));
    expect(body).toContain("Today's omikuji");
    expect(body).toContain("Nobody has written about this one yet. Go in and be the first.");
    expect(body).toContain("not from AI");
    expect(text(render(<ReplyView {...viewProps(reply, { locale: "ja" })} />))).toContain(
      "ここについて、まだ誰も書いていません",
    );
  });

  it("asks for a start when the model could not tell, and says plainly when there is nothing", () => {
    const base: PlannerReply = {
      state: "ai",
      intro: null,
      needsStart: true,
      walk: null,
      omikuji: null,
      answers: [],
      proposals: [],
      leftOut: 0,
      pickedByAi: false,
    };
    expect(text(render(<ReplyView {...viewProps(base)} />))).toContain(
      "Where would you like to start?",
    );
    expect(
      text(render(<ReplyView {...viewProps({ ...base, state: "empty", needsStart: false })} />)),
    ).toContain("couldn't make a plan");
  });

  it("is in Japanese, with the draw's own sentences translated", async () => {
    const reply = await realReply(planScript());
    const html = render(<ReplyView {...viewProps(reply, { locale: "ja" })} />);
    const body = text(html);
    expect(body).toContain("メンバーの話から Noren の AI が選びました");
    expect(body).toContain("から徒歩約3分");
    expect(body).toContain("ワイルドカード — あなたに合わせて選んだ場所ではありません");
    expect(html).toContain('href="/ja/places/dejima-museum"');
    expect(html).toContain("未確認");
  });

  it("has no score, percentage, ranking, star or emoji", async () => {
    for (const locale of ["en", "ja"] as const) {
      const body = text(
        render(<ReplyView {...viewProps(await realReply(planScript()), { locale })} />),
      );
      expect(body).not.toMatch(/\bscores?\b|\d\s?%|\bratings?\b|\brated\b|top \d|\d\/10|[★☆]/i);
      expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("the draw's wording", () => {
  it("has a Japanese sentence for every rule Noren can apply and every reason it can give", () => {
    for (const rule of AVOID_RULES) {
      expect(DRAW_TEXT_JA[rule.checks], rule.checks).toBeTruthy();
      expect(DRAW_TEXT_JA[rule.limit], rule.limit).toBeTruthy();
    }
    const unchecked = resolveAvoid(["vegetarian", "mystery-tag"], region).notChecked.map(
      (r) => r.reason,
    );
    for (const reason of [
      ...unchecked,
      "This region does not record that.",
      "Owners' statements are not shown on Noren yet, so this cannot be checked.",
    ]) {
      expect(DRAW_TEXT_JA[reason], reason).toBeTruthy();
    }
  });

  it("falls back to the English sentence when there is no Japanese one", () => {
    expect(drawText("ja", "a brand new rule")).toBe("a brand new rule");
    expect(drawText("en", "leaves out bars and izakaya")).toBe("leaves out bars and izakaya");
    expect(drawText("ja", "leaves out bars and izakaya")).toBe("バー・居酒屋を除きます");
  });

  it("words the summary and the reasons by code", () => {
    const walk = { stops: [1, 2, 3], totalMinutes: 14, wildCards: 0 } as never;
    expect(summaryLine("en", walk)).toBe("3 stops, about 14 minutes on foot, no wild cards.");
    expect(summaryLine("ja", walk)).toBe("3か所、徒歩で約14分、ワイルドカードなし。");
    expect(summaryLine("en", { stops: [1], totalMinutes: 4, wildCards: 1 } as never)).toBe(
      "1 stop, about 4 minutes on foot, 1 wild card.",
    );
    const label = (tag: string) => tag.toUpperCase();
    expect(whyText("en", { kind: "matched", interests: ["a", "b"] }, label)).toBe(
      "Matches your interest in A and B",
    );
    expect(whyText("en", { kind: "random", hadInterests: false }, label)).toBe(
      "Drawn at random from places near the start",
    );
    expect(whyText("ja", { kind: "random", hadInterests: true }, label)).toContain("無作為");
  });
});

describe("memory suggestions in the chat", () => {
  const proposal = {
    id: "p1",
    op: "add",
    kind: "rule",
    text: "vegetarian",
    saidAs: "I'm vegetarian now",
  } as const;
  const baseReply: PlannerReply = {
    state: "ai",
    intro: null,
    needsStart: false,
    walk: null,
    omikuji: null,
    answers: [],
    proposals: [proposal],
    leftOut: 0,
    pickedByAi: false,
  };

  it('asks "Remember: Vegetarian?" with Yes and No, and shows what the visitor said', () => {
    const html = render(
      <ReplyView {...viewProps(baseReply, { proposals: [{ proposal, status: "open" }] })} />,
    );
    const body = text(html);
    expect(body).toContain("Remember: Vegetarian?");
    expect(body).toContain("You said: “I'm vegetarian now”");
    expect(body).toMatch(/Yes/);
    expect(body).toMatch(/No/);
  });

  it("words forgetting, today's trip and Japanese properly", () => {
    expect(proposalText("en", { ...proposal, op: "remove", kind: "taste", text: "coffee" })).toBe(
      "Forget: Coffee?",
    );
    expect(proposalText("en", { ...proposal, kind: "visited", text: "Champon" })).toBe(
      "Add to today's trip: Champon?",
    );
    expect(
      proposalText("en", { ...proposal, op: "remove", kind: "visited", text: "Champon" }),
    ).toBe("Take off today's trip: Champon?");
    expect(proposalText("ja", proposal)).toBe("覚えておきますか：ベジタリアン");
    expect(proposalText("en", { ...proposal, text: "allergic to peanuts" })).toBe(
      "Remember: Allergy: peanuts?",
    );
  });

  it("passes Yes and No on, and shows the outcome once answered", () => {
    const onAnswer = vi.fn();
    const tree = ReplyView(
      viewProps(baseReply, { proposals: [{ proposal, status: "open" }], onAnswer }),
    );
    const row = all(tree).find((el) => el.props.entry !== undefined)!;
    (row.props.onAnswer as (id: string, answer: string) => void)("p1", "yes");
    expect(onAnswer).toHaveBeenCalledWith("p1", "yes");
    const done = (status: "yes" | "no") =>
      text(render(<ReplyView {...viewProps(baseReply, { proposals: [{ proposal, status }] })} />));
    expect(done("yes")).toContain("Saved on this device.");
    expect(done("no")).toContain("Left as it was.");
    expect(done("yes")).not.toContain("Remember: Vegetarian?");
    expect(
      text(
        render(
          <ReplyView
            {...viewProps(baseReply, {
              proposals: [{ proposal: { ...proposal, op: "remove" }, status: "yes" }],
            })}
          />,
        ),
      ),
    ).toContain("Removed from this device.");
  });
});

function fakeStorage() {
  const data = new Map<string, string>();
  const storage: KeyValueStore & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
  return storage;
}

describe("answering a suggestion changes the device only on Yes", () => {
  function chatWith(proposal: ProposalState["proposal"]): ChatState {
    const reply: PlannerReply = {
      state: "ai",
      intro: null,
      needsStart: false,
      walk: null,
      omikuji: null,
      answers: [],
      proposals: [proposal],
      leftOut: 0,
      pickedByAi: false,
    };
    return chatReducer(chatReducer(emptyChat, { type: "send", text: "I'm vegetarian now" }), {
      type: "reply",
      reply,
    });
  }
  const proposal = {
    id: "p1",
    op: "add",
    kind: "rule",
    text: "vegetarian",
    saidAs: "I'm vegetarian now",
  } as const;

  it("Yes saves it on the device, once", () => {
    const storage = fakeStorage();
    const store = createMemoryStore({ storage: () => storage, clock: () => clock });
    const chat = chatWith(proposal);
    const turn = chat.turns[1]!;
    const action = answerProposal(chat, store, turn.id, "p1", "yes");
    expect(action).toEqual({ type: "answer", turnId: turn.id, proposalId: "p1", answer: "yes" });
    expect(JSON.parse(storage.data.get(MEMORY_STORAGE_KEY)!).rules[0].tag).toBe("vegetarian");
    const after = chatReducer(chat, action!);
    // A second press on Yes does nothing.
    expect(answerProposal(after, store, turn.id, "p1", "yes")).toBeNull();
    expect(store.get().rules).toHaveLength(1);
  });

  it("No leaves the device exactly as it was, and writes nothing", () => {
    const storage = fakeStorage();
    const store = createMemoryStore({ storage: () => storage, clock: () => clock });
    const before = store.get();
    const chat = chatWith(proposal);
    const action = answerProposal(chat, store, chat.turns[1]!.id, "p1", "no");
    expect(action).toMatchObject({ answer: "no" });
    expect(store.get()).toBe(before);
    expect(storage.data.size).toBe(0);
  });

  it("an unknown turn or suggestion changes nothing", () => {
    const storage = fakeStorage();
    const store = createMemoryStore({ storage: () => storage, clock: () => clock });
    const chat = chatWith(proposal);
    expect(answerProposal(chat, store, "nope", "p1", "yes")).toBeNull();
    expect(answerProposal(chat, store, chat.turns[0]!.id, "p1", "yes")).toBeNull();
    expect(answerProposal(chat, store, chat.turns[1]!.id, "p9", "yes")).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("a removal takes the rule off the device", () => {
    const storage = fakeStorage();
    const store = createMemoryStore({ storage: () => storage, clock: () => clock });
    store.update((memory) => addRule(memory, "vegetarian"));
    const chat = chatWith({ ...proposal, op: "remove" });
    answerProposal(chat, store, chat.turns[1]!.id, "p1", "yes");
    expect(store.get().rules).toEqual([]);
    expect(JSON.parse(storage.data.get(MEMORY_STORAGE_KEY)!).rules).toEqual([]);
  });
});

describe("the chat", () => {
  it("keeps the conversation in the page, one question at a time", () => {
    let chat = chatReducer(emptyChat, { type: "send", text: "  hello  " });
    expect(chat.pending).toBe(true);
    expect(chat.turns).toEqual([{ id: "t1", role: "user", text: "hello" }]);
    // A second question while one is out, and a blank one, are ignored.
    expect(chatReducer(chat, { type: "send", text: "again" })).toBe(chat);
    expect(chatReducer(emptyChat, { type: "send", text: "   " })).toBe(emptyChat);
    chat = chatReducer(chat, { type: "error", code: "rate_limited" });
    expect(chat.pending).toBe(false);
    expect(chat.turns.at(-1)).toMatchObject({ role: "error", code: "rate_limited" });
    expect(chatReducer(chat, { type: "clear" })).toEqual(emptyChat);
  });

  it("sends the recent turns, starting and ending with the person, with earlier answers as names only", async () => {
    const reply = await realReply(planScript());
    let chat = chatReducer(emptyChat, { type: "send", text: "Three stops near Shinchi" });
    chat = chatReducer(chat, { type: "reply", reply });
    chat = chatReducer(chat, { type: "send", text: "Swap the second one" });
    const turns = requestTurns(chat);
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[1]!.text).toBe(
      "A walk was drawn: 1. Shinchi Noodles (新地ヌードル), 2. Dejima Museum (出島資料館), 3. Quiet Kiosk (静かな売店).",
    );
    // Nothing the model could mistake for a slug, a quote or a writer's name.
    expect(turns[1]!.text).not.toMatch(/dejima-museum|quiet-kiosk|Ai Tanaka|q\d/);
    expect(replySummary({ ...reply, walk: null, omikuji: null, answers: [] })).toBe(
      "Nothing was shown.",
    );
  });

  it("drops error turns, never starts with the model, and keeps at most eight", () => {
    let chat = emptyChat;
    for (let n = 0; n < 6; n++) {
      chat = chatReducer(chat, { type: "send", text: `question ${n}` });
      chat = chatReducer(chat, { type: "error", code: "failed" });
    }
    chat = chatReducer(chat, { type: "send", text: "last" });
    const turns = requestTurns(chat);
    expect(turns).toHaveLength(7);
    expect(turns.every((turn) => turn.role === "user")).toBe(true);
    expect(turns.at(-1)!.text).toBe("last");
    expect(requestTurns(emptyChat)).toEqual([]);
  });

  it("keeps a bounded number of turns on the page", () => {
    let chat = emptyChat;
    for (let n = 0; n < 40; n++) {
      chat = chatReducer(chat, { type: "send", text: `q${n}` });
      chat = chatReducer(chat, { type: "error", code: "failed" });
    }
    expect(chat.turns.length).toBeLessThanOrEqual(24);
  });
});

describe("where to start", () => {
  const places: PlaceOption[] = [
    {
      slug: "dejima-museum",
      name: "Dejima Museum (出島資料館)",
      searchable: ["Dejima Museum", "出島資料館"],
    },
    {
      slug: "shinchi-noodles",
      name: "Shinchi Noodles (新地ヌードル)",
      searchable: ["Shinchi Noodles", "新地ヌードル"],
    },
    { slug: "museum-cafe", name: "Museum Cafe", searchable: ["Museum Cafe"] },
  ];

  it("finds places by name in English or Japanese, names that start with it first", () => {
    expect(matchPlaces(places, "museum").map((p) => p.slug)).toEqual([
      "museum-cafe",
      "dejima-museum",
    ]);
    expect(matchPlaces(places, "出島").map((p) => p.slug)).toEqual(["dejima-museum"]);
    expect(matchPlaces(places, "  ")).toEqual([]);
    expect(matchPlaces(places, "zzz")).toEqual([]);
    expect(matchPlaces(places, "e", 2)).toHaveLength(2);
  });

  it("sends an id or a slug and nothing else", () => {
    expect(startForRequest(null)).toBeUndefined();
    expect(
      startForRequest({ kind: "neighbourhood", id: "shinchi", name: "Shinchi (新地中華街)" }),
    ).toEqual({
      kind: "neighbourhood",
      id: "shinchi",
    });
    expect(
      startForRequest({ kind: "place", slug: "dejima-museum", name: "Dejima Museum" }),
    ).toEqual({
      kind: "place",
      slug: "dejima-museum",
    });
  });

  const picker = (over: Partial<StartPickerProps> = {}): StartPickerProps => ({
    locale: "en",
    neighbourhoods: region.neighbourhoods ?? [],
    places,
    value: null,
    nearest: { kind: "idle" },
    placeQuery: "",
    onPlaceQuery: vi.fn(),
    onChoose: vi.fn(),
    onClear: vi.fn(),
    onNearest: vi.fn(),
    ...over,
  });

  it("offers nearest to me, a neighbourhood list and a place search, and says the phone works it out", () => {
    const html = render(<StartPicker {...picker()} />);
    const body = text(html);
    expect(body).toContain("Nearest to me");
    expect(body).toContain("Only its name goes to Noren, never where you are.");
    expect(body).toContain("Shinchi (新地中華街)");
    expect(body).toContain("No start chosen yet.");
    expect(html).toContain('type="search"');
    expect(neighbourhoodName({ en: "Dejima", ja: "出島" }, "dejima")).toBe("Dejima (出島)");
    expect(neighbourhoodName({ ja: "出島" }, "dejima")).toBe("出島");
  });

  it("explains each way the phone can fail, and that it is far", () => {
    const message = (kind: "far" | "denied" | "unavailable" | "timeout" | "unsupported") =>
      text(render(<StartPicker {...picker({ nearest: { kind } })} />));
    expect(message("denied")).toContain("Turn location on for this site");
    expect(message("unavailable")).toContain("couldn't find your location");
    expect(message("timeout")).toContain("took too long");
    expect(message("unsupported")).toContain("can't read a location");
    expect(message("far")).toContain("far from the neighbourhoods Noren knows");
    expect(text(render(<StartPicker {...picker({ nearest: { kind: "locating" } })} />))).toContain(
      "Finding the nearest neighbourhood",
    );
  });

  it("lists matching places and hands the choice on", () => {
    const props = picker({ placeQuery: "museum" });
    const html = render(<StartPicker {...props} />);
    expect(text(html)).toContain("Museum Cafe");
    const tree = StartPicker(props);
    const choice = all(tree).find(
      (el) => el.type === "button" && el.props.children === "Museum Cafe",
    )!;
    (choice.props.onClick as () => void)();
    expect(props.onChoose).toHaveBeenCalledWith({
      kind: "place",
      slug: "museum-cafe",
      name: "Museum Cafe",
    });
    expect(text(render(<StartPicker {...picker({ placeQuery: "zzz" })} />))).toContain(
      "No place by that name.",
    );
  });

  it("shows the chosen start with a way to clear it", () => {
    const props = picker({
      value: { kind: "neighbourhood", id: "shinchi", name: "Shinchi (新地中華街)" },
    });
    expect(text(render(<StartPicker {...props} />))).toContain("Starting in Shinchi (新地中華街).");
    expect(text(render(<StartPicker {...props} />))).toContain("Clear");
    expect(render(<StartPicker {...props} />)).toContain('<option value="shinchi" selected="">');
  });
});

describe("the planner page", () => {
  const viewProps2 = (over: Partial<PlanViewProps> = {}): PlanViewProps => ({
    locale: "en",
    chat: emptyChat,
    input: "",
    onInput: vi.fn(),
    onSend: vi.fn(),
    picker: {
      locale: "en",
      neighbourhoods: region.neighbourhoods ?? [],
      places: [],
      value: null,
      nearest: { kind: "idle" },
      placeQuery: "",
      onPlaceQuery: vi.fn(),
      onChoose: vi.fn(),
      onClear: vi.fn(),
      onNearest: vi.fn(),
    },
    using: { rules: [], tastes: [], done: [] },
    ruleLabels: {},
    interestLabel: (tag) => tag,
    onAnswer: vi.fn(),
    ...over,
  });

  it("starts with the examples, a labelled box, and what Noren remembers with a way to change it", () => {
    const html = render(<PlanView {...viewProps2()} />);
    const body = text(html);
    expect(body).toContain("Try asking");
    expect(body).toContain("Three stops near Shinchi, I like history");
    expect(html).toContain('<label for="plan-input"');
    expect(html).toContain('href="/en/remembers"');
    expect(body).toContain("Nothing saved yet.");
    expect(html).toContain('role="log"');
    expect(html).toContain("disabled");
  });

  it("shows what will be used, in the visitor's own words", () => {
    const body = text(
      render(
        <PlanView
          {...viewProps2({
            using: {
              rules: ["Vegetarian", "Allergy: peanuts"],
              tastes: ["History"],
              done: ["Champon"],
            },
          })}
        />,
      ),
    );
    expect(body).toContain("Rules: Vegetarian, Allergy: peanuts");
    expect(body).toContain("Likes: History");
    expect(body).toContain("Done today: Champon");
    expect(body).not.toContain("Nothing saved yet.");
  });

  it("turns the examples into the box's text, and sends on submit", () => {
    const props = viewProps2();
    const tree = PlanView(props);
    const example = all(tree).find(
      (el) => el.type === "button" && el.props.children === "Draw today's omikuji",
    )!;
    (example.props.onClick as () => void)();
    expect(props.onInput).toHaveBeenCalledWith("Draw today's omikuji");
    const form = all(tree).find((el) => el.type === "form")!;
    const preventDefault = vi.fn();
    (form.props.onSubmit as (event: unknown) => void)({ preventDefault });
    expect(props.onSend).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });

  it("cannot send a blank question or a second one while one is out", () => {
    const send = (over: Partial<PlanViewProps>) =>
      all(PlanView(viewProps2(over))).find(
        (el) => el.type === "button" && el.props.type === "submit",
      )!;
    expect(send({ input: "hello" }).props.disabled).toBe(false);
    expect(send({ input: "   " }).props.disabled).toBe(true);
    const pending = chatReducer(emptyChat, { type: "send", text: "hello" });
    expect(send({ input: "again", chat: pending }).props.disabled).toBe(true);
    expect(text(render(<PlanView {...viewProps2({ chat: pending })} />))).toContain(
      "Asking Noren…",
    );
  });

  it("offers the voice input only when it is given one, and says the words land in the box", () => {
    expect(text(render(<PlanView {...viewProps2()} />))).not.toContain("Use your voice instead");
    const body = text(render(<PlanView {...viewProps2({ voice: <p>mic</p> })} />));
    expect(body).toContain("Use your voice instead");
    expect(body).toContain("Your words appear in the box. Check them, then send.");
  });

  it("shows the conversation, the errors and no examples once it has begun", async () => {
    const reply = await realReply(planScript());
    let chat = chatReducer(emptyChat, { type: "send", text: "Three stops near Shinchi" });
    chat = chatReducer(chat, { type: "reply", reply });
    chat = chatReducer(chat, { type: "send", text: "again" });
    chat = chatReducer(chat, { type: "error", code: "rate_limited" });
    const body = text(render(<PlanView {...viewProps2({ chat })} />));
    expect(body).toContain("You Three stops near Shinchi");
    expect(body).toContain("Picked by Noren's AI from members' stories");
    expect(body).toContain("You have reached the limit for now.");
    expect(body).not.toContain("Try asking");
    chat = chatReducer(chat, { type: "send", text: "again" });
    chat = chatReducer(chat, { type: "error", code: "failed" });
    expect(text(render(<PlanView {...viewProps2({ chat })} />))).toContain(
      "Noren couldn't answer just now.",
    );
  });

  it("is in Japanese", () => {
    const body = text(render(<PlanView {...viewProps2({ locale: "ja" })} />));
    expect(body).toContain("やりたいことは何ですか？");
    expect(body).toContain("例えば");
  });

  it("asks a signed-out visitor to sign in, and comes back to the planner after", () => {
    const html = render(<SignInPrompt locale="en" />);
    expect(text(html)).toContain("Sign in to plan your day");
    expect(text(html)).toContain("not stored");
    expect(html).toContain('href="/en/sign-in?redirect_url=%2Fen%2Fplan"');
    expect(render(<SignInPrompt locale="ja" />)).toContain("ログイン");
  });

  it("reads a rate limit by its code, which a production deployment keeps when it hides messages", () => {
    expect(failureCode(new ConvexError({ code: "rate_limited" }))).toBe("rate_limited");
    expect(failureCode(new ConvexError({ code: "conflict" }))).toBe("failed");
    expect(failureCode(new Error("Server Error"))).toBe("failed");
    expect(failureCode(null)).toBe("failed");
  });
});

describe("a rule's name on the page", () => {
  it("uses the visitor's own word for a rule, and prefixes an allergy", () => {
    const memory = addRule(addRule(emptyMemory(clock), "allergic to peanuts"), "no pork");
    expect(memory.rules.map((r) => ruleLabel(r, "en", "Allergy: "))).toEqual([
      "Allergy: peanuts",
      "No pork",
    ]);
    expect(memory.rules.map((r) => ruleLabel(r, "ja", "アレルギー："))).toEqual([
      "アレルギー：peanuts",
      "豚肉なし",
    ]);
  });
});
