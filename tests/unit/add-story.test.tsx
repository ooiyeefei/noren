import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddStory, type AddStoryActions } from "@/components/place/add-story";
import {
  describeStoryLink,
  noteLanguage,
  toStoryArgs,
  toWrittenArgs,
  type StoryDraft,
} from "@/components/place/add-story-form";
import { StoryFeed, type StoryFeedActions } from "@/components/place/story-feed";
import {
  toStoryFeed,
  type SourceViewLike,
  type WrittenStoryLike,
} from "@/components/public/mapping";
import { PlaceView } from "@/components/public/place-view";
import { format } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { landmark, place, region, sources } from "../fixtures/public-ui";

// The form runs without a DOM; this harness keeps its state between calls and drives its handlers.
const hooks = vi.hoisted(() => ({
  current: undefined as { values: unknown[]; cursor: number } | undefined,
}));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const state = hooks.current;
      if (!state) return react.useState(initial);
      const index = state.cursor++;
      if (!(index in state.values))
        state.values[index] = typeof initial === "function" ? initial() : initial;
      return [
        state.values[index],
        (value: unknown) => {
          state.values[index] = typeof value === "function" ? value(state.values[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const state = hooks.current;
      if (!state) return react.useRef(initial);
      const index = state.cursor++;
      if (!(index in state.values)) state.values[index] = { current: initial };
      return state.values[index];
    },
    useId: () => (hooks.current ? "story" : react.useId()),
  };
});
afterEach(() => {
  hooks.current = undefined;
});

const tiktok = "https://www.tiktok.com/@fictional_walker/video/7300000000000000000";
const blog = "https://example.com/fictional-cat-street-walk";
const draft = (fields: Partial<StoryDraft>): StoryDraft => ({
  url: "",
  note: "",
  title: "",
  author: "",
  body: "",
  ...fields,
});

describe("story form rules", () => {
  it("needs a link it can show and a line in the member's own words", () => {
    expect(toStoryArgs(draft({ note: "A note" }), region)).toEqual({ ok: false, problem: "url" });
    expect(toStoryArgs(draft({ url: "ftp://example.com/x", note: "A note" }), region)).toEqual({
      ok: false,
      problem: "url",
    });
    expect(toStoryArgs(draft({ url: tiktok, note: "  " }), region)).toEqual({
      ok: false,
      problem: "note",
    });
    expect(toStoryArgs(draft({ url: tiktok, note: "a".repeat(1001) }), region)).toEqual({
      ok: false,
      problem: "note",
    });
    expect(toStoryArgs(draft({ url: blog, note: "A walk" }), region)).toEqual({
      ok: false,
      problem: "title",
    });
    expect(
      toStoryArgs(draft({ url: blog, note: "A walk", title: "t".repeat(201) }), region),
    ).toEqual({ ok: false, problem: "title" });
  });

  it("sends the trimmed story, its language, a title only for a link card, and any credit", () => {
    expect(
      toStoryArgs(draft({ url: ` ${tiktok} `, note: " 猫がたくさんいる坂道。 " }), region),
    ).toEqual({
      ok: true,
      args: { url: tiktok, note: "猫がたくさんいる坂道。", noteLang: "ja" },
    });
    expect(
      toStoryArgs(
        draft({ url: blog, note: "Cats on the slope", title: " A walk ", author: " Walker " }),
        region,
      ),
    ).toEqual({
      ok: true,
      args: {
        url: blog,
        note: "Cats on the slope",
        noteLang: "en",
        title: "A walk",
        authorHandle: "Walker",
      },
    });
  });

  it("reads the note's language from its script and keeps to the region's languages", () => {
    expect(noteLanguage("カフェ", region)).toBe("ja");
    expect(noteLanguage("Great coffee", region)).toBe("en");
    expect(noteLanguage("Great coffee", { ...region, locales: ["ja"] })).toBe(region.defaultLocale);
  });

  it("a written story is 1 to 1,000 characters in the member's own words, in the language it is written in", () => {
    expect(toWrittenArgs(draft({ body: "  " }), region)).toEqual({ ok: false, problem: "body" });
    expect(toWrittenArgs(draft({ body: "a".repeat(1001) }), region)).toEqual({
      ok: false,
      problem: "body",
    });
    expect(toWrittenArgs(draft({ body: " 坂の途中で猫が昼寝していた。 " }), region)).toEqual({
      ok: true,
      args: { body: "坂の途中で猫が昼寝していた。", lang: "ja" },
    });
    expect(toWrittenArgs(draft({ body: "a".repeat(1000) }), region)).toMatchObject({ ok: true });
  });

  it("says when a link needs a typed title and suggests the credit a link carries", () => {
    expect(describeStoryLink(blog, region)).toEqual({ linkCard: true });
    expect(describeStoryLink(tiktok, region)).toMatchObject({ linkCard: false });
    expect(describeStoryLink(tiktok, region)?.suggestedAuthor).toMatch(/fictional_walker/);
    expect(describeStoryLink("", region)).toBeNull();
    expect(describeStoryLink("not a link", region)).toBeNull();
  });
});

const written = (fields: Partial<WrittenStoryLike> = {}): WrittenStoryLike => ({
  _id: "written",
  body: "坂の途中で猫が昼寝していた。",
  lang: "ja",
  authorName: "Fictional walker",
  addedAt: Date.UTC(2026, 9, 2),
  isMock: false,
  canRemove: false,
  ...fields,
});
const linked = (fields: Partial<SourceViewLike> = {}): SourceViewLike => ({
  ...sources[0]!,
  _id: "linked",
  isMock: false,
  sharedBy: "Fictional sharer",
  addedAt: Date.UTC(2026, 9, 1),
  addedByMe: false,
  ...fields,
});
const allActions = (signedIn: boolean | undefined) => ({
  signedIn,
  add: async () => null,
  write: async () => null,
  remove: async () => null,
});

describe("stories from people who've been here", () => {
  it("reads written stories and linked posts as one list, newest first", () => {
    const feed = toStoryFeed(
      [
        linked({ _id: "old", addedAt: 1 }),
        linked({ _id: "new", addedAt: 3 }),
        linked({ _id: "unknown", addedAt: undefined }),
      ],
      [written({ _id: "middle", addedAt: 2 })],
      false,
    );
    expect(feed.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      "post:new",
      "written:middle",
      "post:old",
      "post:unknown",
    ]);
  });

  it("lets the member who shared a post, the place's editor or a steward remove it, and no one else", () => {
    const [mine, theirs] = [linked({ addedByMe: true }), linked({ _id: "theirs" })];
    expect(toStoryFeed([mine, theirs], [], false).map((entry) => entry.canRemove)).toEqual([
      true,
      false,
    ]);
    expect(toStoryFeed([theirs], [], true)[0]?.canRemove).toBe(true);
    // The server says who may remove a written story; the page takes its word.
    expect(toStoryFeed([], [written({ canRemove: true })], false)[0]?.canRemove).toBe(true);
    expect(toStoryFeed([], [written()], true)[0]?.canRemove).toBe(false);
  });
});

for (const locale of ["ja", "en"] as const) {
  const m = addStoryMessages[locale];
  const ui = placePageMessages[locale];
  const actions = (signedIn: boolean | undefined): AddStoryActions => ({
    signedIn,
    add: async () => null,
    write: async () => null,
  });

  it(`invites a visitor to sign in, waits for sign-in, and offers a member both ways to share (${locale})`, () => {
    const visitor = render(<AddStory locale={locale} region={region} actions={actions(false)} />);
    expect(visitor).toContain(m.signInToAdd);
    expect(visitor).toContain(`href="/${locale}/sign-in"`);
    expect(render(<AddStory locale={locale} region={region} actions={actions(undefined)} />)).toBe(
      "",
    );
    const member = render(<AddStory locale={locale} region={region} actions={actions(true)} />);
    expect(member).toContain(m.prompt);
    expect(member).toContain(`>${m.write}</button>`);
    expect(member).toContain(`>${m.link}</button>`);
    expect(member).not.toContain(m.signInToAdd);
  });

  it(`a real place invites stories before it has any; the demo place shows only its own (${locale})`, () => {
    const view = (fields: Partial<Parameters<typeof PlaceView>[0]>) =>
      render(
        <PlaceView
          locale={locale}
          region={region}
          place={landmark}
          page={null}
          sources={[]}
          stories={[]}
          story={allActions(true)}
          {...fields}
        />,
      );
    const empty = view({});
    expect(empty).toContain('id="stories-heading"');
    expect(empty).toContain(ui.noStories);
    expect(empty).toContain(`>${m.write}</button>`);
    expect(view({ place })).not.toContain('id="stories-heading"');
    const demoWithPosts = view({ place, sources });
    expect(demoWithPosts).toContain('id="stories-heading"');
    expect(demoWithPosts).not.toContain(m.write);
    expect(demoWithPosts).not.toContain(ui.noStories);
    // Still loading: the section waits rather than saying there are none.
    const loading = view({ stories: undefined });
    expect(loading).toContain('id="stories-heading"');
    expect(loading).not.toContain(ui.noStories);
    expect(loading).not.toContain(m.write);
  });

  it(`shows each story with the name of the member who shared it, written ones in their own language (${locale})`, () => {
    const html = render(
      <PlaceView
        locale={locale}
        region={region}
        place={landmark}
        page={null}
        sources={[linked()]}
        stories={[written()]}
        story={allActions(false)}
      />,
    );
    expect(html).toContain('<article lang="ja" class="space-y-3 rounded-lg border p-4">');
    expect(html).toContain(">坂の途中で猫が昼寝していた。</p>");
    expect(html).toContain(format(ui.writtenBy, { name: "Fictional walker" }));
    expect(html).toContain(format(ui.sharedBy, { name: "Fictional sharer" }));
    expect(html.indexOf("坂の途中で")).toBeLessThan(html.indexOf("Fictional sharer"));
    expect(html).toContain(placeUiMessages[locale].viewOriginal);
    expect(html).not.toContain(`>${ui.remove}</button>`);
    const editor = render(
      <PlaceView
        locale={locale}
        region={region}
        place={{ ...landmark, canEdit: true }}
        page={null}
        sources={[linked()]}
        stories={[written({ canRemove: true })]}
        story={allActions(true)}
      />,
    );
    expect(editor.match(new RegExp(`>${ui.remove}</button>`, "g"))).toHaveLength(2);
  });
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}
function harness<T>(view: () => T) {
  const state = { values: [] as unknown[], cursor: 0 };
  const run = () => {
    state.cursor = 0;
    hooks.current = state;
    try {
      return view();
    } finally {
      hooks.current = undefined;
    }
  };
  const all = () => elements(run() as ReactNode);
  const byType = (type: string) => all().filter((item) => item.type === type);
  return {
    html: () => render(<>{run() as ReactNode}</>),
    click: (text: string, nth = 0) =>
      (all().filter((item) => item.props.children === text)[nth]!.props.onClick as () => void)(),
    type: (tag: "input" | "textarea", index: number, value: string) =>
      (byType(tag)[index]!.props.onChange as (event: unknown) => void)({ target: { value } }),
    inputs: () => byType("input").map((item) => item.props.value),
    submit: () =>
      (byType("form")[0]!.props.onSubmit as (event: unknown) => void)({
        preventDefault: () => {},
      }),
  };
}
const mount = (actions: AddStoryActions) =>
  harness(() => AddStory({ locale: "en", region, actions }));

describe("sharing a story", () => {
  const m = addStoryMessages.en;
  const actions = (fields: Partial<AddStoryActions> = {}): AddStoryActions => ({
    signedIn: true,
    add: vi.fn(async () => null),
    write: vi.fn(async () => null),
    ...fields,
  });

  it("says beside the button that the story is shown publicly with the member's name", () => {
    for (const mode of [m.write, m.link]) {
      const form = mount(actions());
      form.click(mode);
      const html = form.html();
      expect(html).toContain(`<p id="story-public" class="text-[15px]">${m.shownPublicly}</p>`);
      expect(html).toMatch(/<button type="submit" aria-describedby="story-public"[^>]*>Share</);
    }
  });

  it("keeps a written story with its language and offers both ways again afterwards", async () => {
    const write = vi.fn(async () => null);
    const form = mount(actions({ write }));
    form.click(m.write);
    expect(form.html()).toContain(m.body);
    expect(form.html()).not.toContain(m.url);
    form.submit();
    expect(form.html()).toContain(m.bodyProblem);
    expect(write).not.toHaveBeenCalled();
    form.type("textarea", 0, " The baker gives the cats the crusts at closing time. ");
    form.submit();
    await vi.waitFor(() => expect(form.html()).toContain(m.added));
    expect(write).toHaveBeenCalledWith({
      body: "The baker gives the cats the crusts at closing time.",
      lang: "en",
    });
    expect(form.html()).toContain(`>${m.write}</button>`);
    expect(form.html()).toContain(`>${m.link}</button>`);
    form.click(m.write);
    expect(form.html()).not.toContain("closing time");
  });

  it("asks for a title only for a link card and follows the link's credit until one is typed", () => {
    const form = mount(actions());
    form.click(m.link);
    form.type("input", 0, blog);
    expect(form.html()).toContain(m.title);
    form.type("input", 0, tiktok);
    expect(form.html()).not.toContain(m.title);
    expect(form.inputs()[1]).toMatch(/fictional_walker/);
    form.type("input", 1, "Someone else");
    form.type("input", 0, `${tiktok}?lang=en`);
    expect(form.inputs()[1]).toBe("Someone else");
  });

  it("says what is missing and sends nothing until the linked post is complete", async () => {
    const add = vi.fn(async () => null);
    const form = mount(actions({ add }));
    form.click(m.link);
    form.type("input", 0, tiktok);
    form.submit();
    expect(form.html()).toContain(m.noteProblem);
    expect(form.html()).toContain('aria-invalid="true"');
    expect(add).not.toHaveBeenCalled();
    form.type("textarea", 0, "Cats sleep on the steps here every afternoon.");
    form.submit();
    await vi.waitFor(() => expect(form.html()).toContain(m.added));
    expect(add).toHaveBeenCalledWith({
      url: tiktok,
      note: "Cats sleep on the steps here every afternoon.",
      noteLang: "en",
      authorHandle: expect.stringMatching(/fictional_walker/),
    });
    expect(form.html()).not.toContain("<form");
    form.click(m.link);
    expect(form.inputs()).toEqual(["", ""]);
  });

  it("keeps the story and explains a refusal, such as the daily limit", async () => {
    const write = vi.fn(async () => {
      throw Object.assign(new Error("[CONVEX] redacted"), {
        data: { code: "rate_limited", message: "too many stories today" },
      });
    });
    const form = mount(actions({ write }));
    form.click(m.write);
    form.type("textarea", 0, "A story");
    form.submit();
    await vi.waitFor(() => expect(form.html()).toContain(shellMessages.en.rate_limited));
    expect(form.html()).toContain(">A story</textarea>");
    expect(form.html()).not.toContain(m.added);
  });
});

describe("removing a story", () => {
  const ui = placePageMessages.en;
  const entries = toStoryFeed([linked({ addedByMe: true })], [written({ canRemove: true })], false);
  const feed = (actions: StoryFeedActions) =>
    harness(() =>
      StoryFeed({
        locale: "en",
        entries,
        scriptOrigins: region.scriptOrigins,
        frameOrigins: region.frameOrigins,
        actions,
      }),
    );

  it("asks once before removing, and can be kept", async () => {
    const remove = vi.fn(async () => null);
    const view = feed({ remove });
    view.click(ui.remove);
    expect(view.html()).toContain(ui.removeQuestion);
    view.click(ui.keep);
    expect(view.html()).not.toContain(ui.removeQuestion);
    expect(remove).not.toHaveBeenCalled();
    view.click(ui.remove);
    view.click(ui.removeYes);
    await vi.waitFor(() => expect(view.html()).toContain(ui.removed));
    expect(remove).toHaveBeenCalledWith({ kind: "written", id: "written" });
    expect(view.html()).not.toContain(ui.removeQuestion);
  });

  it("removes a linked post the same way and explains a refusal", async () => {
    const remove = vi.fn(async () => {
      throw Object.assign(new Error("[CONVEX] redacted"), {
        data: { code: "forbidden", message: "only the writer may remove it" },
      });
    });
    const view = feed({ remove });
    // The written story is newer, so the post's Remove is the second one.
    view.click(ui.remove, 1);
    view.click(ui.removeYes);
    await vi.waitFor(() => expect(view.html()).toContain(shellMessages.en.forbidden));
    expect(remove).toHaveBeenCalledWith({ kind: "post", id: "linked" });
    expect(view.html()).toContain(ui.removeQuestion);
    expect(view.html()).not.toContain(ui.removed);
  });
});
