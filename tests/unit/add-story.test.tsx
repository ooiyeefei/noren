import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddStory, type AddStoryActions } from "@/components/place/add-story";
import { READ_DELAY_MS } from "@/components/place/link-read";
import { ShownAs, type ShownAsActions } from "@/components/place/shown-as";
import {
  describeStoryLink,
  failureName,
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
import type { LinkRead } from "@/lib/link-read/types";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { landmark, place, region, sources } from "../fixtures/public-ui";

// As it reaches the page, where React escapes the apostrophe.
const drafted = addStoryMessages.en.drafted.replaceAll("'", "&#x27;");

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
// Here a kept draft is plain state, on the harness above; keeping it is tested in drafts-storage.
vi.mock("@/components/drafts/drafts", async () => {
  const { useState } = await import("react");
  return {
    useDraft: <T,>(_name: unknown, empty: T) => useState(empty),
    usePhotoDrafts: () => null,
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
    inputs: () =>
      byType("input")
        .filter((item) => item.props.type !== "checkbox")
        .map((item) => item.props.value),
    checkbox: () => byType("input").find((item) => item.props.type === "checkbox"),
    tick: (checked: boolean) =>
      (
        byType("input").find((item) => item.props.type === "checkbox")!.props.onChange as (
          event: unknown,
        ) => void
      )({ target: { checked } }),
    note: () => byType("textarea")[0]!.props.value as string,
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

describe("the name before the first share (FR-131)", () => {
  const m = addStoryMessages.en;
  const shownAs = (fields: Partial<ShownAsActions> = {}): ShownAsActions => ({
    displayName: "Fictional Walker",
    confirm: vi.fn(async () => null),
    save: vi.fn(async () => null),
    ...fields,
  });
  const member = (fields: Partial<AddStoryActions> = {}): AddStoryActions => ({
    signedIn: true,
    add: vi.fn(async () => null),
    write: vi.fn(async () => null),
    ...fields,
  });
  const control = (fields: Partial<ShownAsActions> = {}, locale: "en" | "ja" = "en") =>
    harness(() => ShownAs({ locale, hintId: "name-hint", actions: shownAs(fields) }));

  it.each(["write", "link"] as const)(
    "the %s form shows the name and a way to change it, and holds Share until it is settled",
    (mode) => {
      const form = mount(member({ shownAs: shownAs() }));
      expect(form.html()).not.toContain(m.useThisName);
      form.click(m[mode]);
      const html = form.html();
      expect(html).toContain(format(m.shownAs, { name: "Fictional Walker" }));
      expect(html).toContain(`>${m.useThisName}</button>`);
      expect(html).toContain(`>${m.changeName}</button>`);
      expect(html).toMatch(
        /<button type="submit" disabled="" aria-describedby="story-public story-name"[^>]*>Share</,
      );
      expect(html).toContain('id="story-name"');
      // Written in the form, so it is seen before the Share button.
      expect(html.indexOf(m.useThisName)).toBeLessThan(html.indexOf(">Share<"));
    },
  );

  it("shows nothing and holds nothing once the name is confirmed", () => {
    const form = mount(member());
    form.click(m.write);
    const html = form.html();
    expect(html).not.toContain(m.useThisName);
    expect(html).not.toContain("data-shown-as");
    expect(html).toMatch(/<button type="submit" aria-describedby="story-public"[^>]*>Share</);
  });

  it("a visitor who is signed out sees no name", () => {
    const form = mount(member({ signedIn: false, shownAs: shownAs() }));
    expect(form.html()).not.toContain("data-shown-as");
  });

  it("sends nothing while the name waits, then shares the same story once it is settled", async () => {
    const write = vi.fn(async () => null);
    let actions = member({ write, shownAs: shownAs() });
    const form = harness(() => AddStory({ locale: "en", region, actions }));
    form.click(m.write);
    form.type("textarea", 0, "A story");
    form.submit();
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();
    actions = { ...actions, shownAs: undefined };
    expect(form.html()).toContain(">A story</textarea>");
    form.submit();
    await vi.waitFor(() => expect(form.html()).toContain(m.added));
    expect(write).toHaveBeenCalledWith({ body: "A story", lang: "en" });
  });

  it("explains the server's refusal by its code, keeping the story", async () => {
    const write = vi.fn(async () => {
      throw Object.assign(new Error("[CONVEX] redacted"), {
        data: { code: "name_not_confirmed", message: "confirm your name" },
      });
    });
    const form = mount(member({ write }));
    form.click(m.write);
    form.type("textarea", 0, "A story");
    form.submit();
    await vi.waitFor(() => expect(form.html()).toContain(shellMessages.en.name_not_confirmed));
    expect(form.html()).toContain(">A story</textarea>");
  });

  it("Use this name confirms it, once however often it is pressed", async () => {
    let finish: (value: null) => void = () => {};
    const confirm = vi.fn(() => new Promise<null>((resolve) => (finish = resolve)));
    const form = control({ confirm });
    form.click(m.useThisName);
    expect(form.html()).toContain(m.savingName);
    expect(confirm).toHaveBeenCalledTimes(1);
    finish(null);
    await vi.waitFor(() => expect(form.html()).toContain(m.useThisName));
  });

  it("Change opens the name to edit, and saving sends it trimmed", async () => {
    const save = vi.fn(async () => null);
    const form = control({ save });
    form.click(m.changeName);
    expect(form.inputs()).toEqual(["Fictional Walker"]);
    expect(form.html()).toContain(m.yourName);
    expect(form.html()).toContain('maxLength="80"');
    form.type("input", 0, "  Lantern fan  ");
    form.click(m.saveName);
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith("Lantern fan"));
  });

  it.each(["", "   ", "a".repeat(81), "walker@example.invalid"])(
    "will not send the name %j, and says why",
    (bad) => {
      const save = vi.fn(async () => null);
      const form = control({ save });
      form.click(m.changeName);
      form.type("input", 0, bad);
      form.click(m.saveName);
      expect(form.html()).toContain(m.nameProblem);
      expect(form.html()).toContain('aria-invalid="true"');
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("Cancel goes back to the name as it was", () => {
    const form = control();
    form.click(m.changeName);
    form.type("input", 0, "Half typed");
    form.click(m.cancel);
    expect(form.html()).toContain(format(m.shownAs, { name: "Fictional Walker" }));
    expect(form.html()).not.toContain("<input");
    form.click(m.changeName);
    expect(form.inputs()).toEqual(["Fictional Walker"]);
  });

  it("a provider's name that breaks the rule goes to the editor rather than to the server", () => {
    const confirm = vi.fn(async () => null);
    const form = control({ confirm, displayName: "walker@example.invalid" });
    form.click(m.useThisName);
    expect(confirm).not.toHaveBeenCalled();
    expect(form.html()).toContain(m.nameProblem);
    expect(form.html()).toContain("<input");
  });

  it("shows a refusal from the server, and lets the member try again", async () => {
    const confirm = vi.fn(async () => {
      throw Object.assign(new Error("[CONVEX] redacted"), {
        data: { code: "invalid_input", message: "a display name is 1 to 80 characters" },
      });
    });
    const form = control({ confirm });
    form.click(m.useThisName);
    await vi.waitFor(() => expect(form.html()).toContain(shellMessages.en.invalid_input));
    expect(form.html()).toContain(`>${m.useThisName}</button>`);
  });

  it("Enter saves the name and never submits the story form, and ending a Japanese conversion saves nothing", async () => {
    const save = vi.fn(async () => null);
    const state = { values: [] as unknown[], cursor: 0 };
    const view = () => {
      state.cursor = 0;
      hooks.current = state;
      try {
        return ShownAs({ locale: "ja", hintId: "name-hint", actions: shownAs({ save }) });
      } finally {
        hooks.current = undefined;
      }
    };
    const find = (type: string) => elements(view()).filter((item) => item.type === type);
    (
      find("button").find((item) => item.props.children === addStoryMessages.ja.changeName)!.props
        .onClick as () => void
    )();
    const press = (isComposing: boolean) => {
      const preventDefault = vi.fn();
      (find("input")[0]!.props.onKeyDown as (event: unknown) => void)({
        key: "Enter",
        preventDefault,
        nativeEvent: { isComposing },
      });
      return preventDefault;
    };
    expect(press(true)).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(press(false)).toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith("Fictional Walker");
  });

  it("has every string in Japanese", () => {
    const ja = addStoryMessages.ja;
    const html = control({}, "ja").html();
    for (const text of [format(ja.shownAs, { name: "Fictional Walker" }), ja.shownAsHint])
      expect(html).toContain(text);
    expect(html).toContain(`>${ja.useThisName}</button>`);
    expect(html).toContain(`>${ja.changeName}</button>`);
    expect(shellMessages.ja.name_not_confirmed).toBeTruthy();
  });
});

describe("reading a pasted link", () => {
  const m = addStoryMessages.en;
  const youtube = "https://www.youtube.com/watch?v=abcdefghijk";
  const instagram = "https://www.instagram.com/p/FICTIONAL1/";
  const video: LinkRead = {
    outcome: "read",
    caption: "Cats on the slope at dusk",
    author: "Fictional Walker",
    authorUrl: "https://www.youtube.com/@fictional",
  };
  const page: LinkRead = {
    outcome: "read",
    title: "Cats and bread",
    caption: "A baker feeds the cats at closing time.",
    author: "Fictional Walks",
    siteName: "Fictional Walks",
  };
  const actions = (fields: Partial<AddStoryActions> = {}): AddStoryActions => ({
    signedIn: true,
    add: vi.fn(async () => null),
    write: vi.fn(async () => null),
    preview: vi.fn(async () => video),
    draftNote: vi.fn(async () => ({ note: "The baker feeds the cats at closing time." })),
    ...fields,
  });
  const settle = () => vi.advanceTimersByTimeAsync(READ_DELAY_MS);
  const flush = () => vi.advanceTimersByTimeAsync(0);
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  async function pasted(url: string, given: AddStoryActions) {
    const form = mount(given);
    form.click(m.link);
    form.type("input", 0, url);
    await settle();
    return form;
  }

  it("waits for a pause, then shows platform, author, words and the embed without a click", async () => {
    const preview = vi.fn(async () => video);
    const form = mount(actions({ preview }));
    form.click(m.link);
    form.type("input", 0, "https://www.youtube.com/watch?v=abcdefghij");
    await vi.advanceTimersByTimeAsync(READ_DELAY_MS - 1);
    form.type("input", 0, youtube);
    await vi.advanceTimersByTimeAsync(READ_DELAY_MS - 1);
    expect(preview).not.toHaveBeenCalled();
    expect(form.html()).not.toContain('data-testid="link-preview"');
    await vi.advanceTimersByTimeAsync(1);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith(youtube);
    const html = form.html();
    expect(html).toContain('data-testid="link-preview"');
    expect(html).toContain(">YouTube</span>");
    expect(html).toContain("Posted by Fictional Walker");
    expect(html).toContain('href="https://www.youtube.com/@fictional"');
    expect(html).toContain("Cats on the slope at dusk");
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/abcdefghijk"');
    expect(html).not.toContain("Load this post");
    expect(html).toContain(placeUiMessages.en.viewOriginal);
    // A video has no title field: its title is shown and goes nowhere.
    expect(form.inputs()).toEqual([youtube, "Fictional Walker"]);
  });

  it("says it is reading while it waits", async () => {
    let answer!: (read: LinkRead) => void;
    const form = await pasted(
      youtube,
      actions({ preview: () => new Promise((resolve) => (answer = resolve)) }),
    );
    expect(form.html()).toContain(m.previewReading);
    answer(video);
    await flush();
    expect(form.html()).not.toContain(m.previewReading);
  });

  it("fills a plain link's title and author, and keeps what the member typed", async () => {
    const empty = await pasted(blog, actions({ preview: async () => page }));
    expect(empty.inputs()).toEqual([blog, "Cats and bread", "Fictional Walks"]);
    expect(empty.html()).toContain("Fictional Walks</span>");
    const typed = mount(actions({ preview: async () => page }));
    typed.click(m.link);
    typed.type("input", 0, blog);
    typed.type("input", 1, "My title");
    typed.type("input", 2, "My name");
    await settle();
    expect(typed.inputs()).toEqual([blog, "My title", "My name"]);
  });

  it("replaces what it filled in when the link changes, even if the new read fails", async () => {
    const preview = vi
      .fn<(url: string) => Promise<LinkRead>>()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error("down"));
    const form = await pasted(blog, actions({ preview }));
    expect(form.inputs()[1]).toBe("Cats and bread");
    form.type("input", 0, `${blog}-two`);
    await settle();
    expect(form.inputs()).toEqual([`${blog}-two`, "", ""]);
  });

  it("gives Instagram its embed and an honest line, with no server call or tick", async () => {
    const preview = vi.fn(async () => video);
    const form = await pasted(instagram, actions({ preview }));
    expect(preview).not.toHaveBeenCalled();
    const html = form.html();
    expect(html).toContain(">Instagram</span>");
    expect(html).toContain('class="instagram-media"');
    expect(html).toContain(format(m.previewEmbedOnly, { platform: "Instagram" }));
    expect(form.checkbox()).toBeUndefined();
  });

  it("gives Facebook its embed in the same way", async () => {
    const form = await pasted("https://www.facebook.com/fictional/posts/123", actions());
    const html = form.html();
    expect(html).toContain(">Facebook</span>");
    expect(html).toContain("https://www.facebook.com/plugins/post.php");
    expect(form.checkbox()).toBeUndefined();
  });

  it("offers no tick when the post gave no words", async () => {
    const form = await pasted(
      tiktok,
      actions({ preview: async () => ({ outcome: "embed_only" }) }),
    );
    expect(form.html()).toContain(format(m.previewEmbedOnly, { platform: "TikTok" }));
    expect(form.html()).toContain('src="https://www.tiktok.com/player/v1/7300000000000000000"');
    expect(form.checkbox()).toBeUndefined();
    expect(form.inputs()[1]).toMatch(/fictional_walker/);
  });

  it("sends nothing to a model until the member ticks, then drafts in their language", async () => {
    const draftNote = vi.fn(async () => ({ note: "The baker feeds the cats at closing time." }));
    const form = await pasted(youtube, actions({ draftNote }));
    expect(form.checkbox()?.props.checked).toBe(false);
    expect(form.html()).toContain(m.ownPost);
    expect(form.html()).not.toContain(drafted);
    form.type("textarea", 0, "");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(draftNote).not.toHaveBeenCalled();
    form.tick(true);
    expect(form.html()).toContain(m.drafting);
    await flush();
    expect(draftNote).toHaveBeenCalledTimes(1);
    expect(draftNote).toHaveBeenCalledWith({ url: youtube, lang: "en" });
    expect(form.note()).toBe("The baker feeds the cats at closing time.");
    expect(form.html()).toContain(drafted);
  });

  it("shares the member's edited line, never the caption, only when they press Share", async () => {
    const add = vi.fn(async () => null);
    const form = await pasted(youtube, actions({ add }));
    form.tick(true);
    await flush();
    expect(add).not.toHaveBeenCalled();
    form.type("textarea", 0, "The baker feeds the cats. I saw it myself.");
    form.submit();
    await flush();
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({
      url: youtube,
      note: "The baker feeds the cats. I saw it myself.",
      noteLang: "en",
      authorHandle: "Fictional Walker",
    });
    expect(form.html()).toContain(m.added);
    expect(form.html()).not.toContain('data-testid="link-preview"');
    form.click(m.link);
    expect(form.inputs()).toEqual(["", ""]);
  });

  it("keeps a line the member already typed and spends no model call on it", async () => {
    const draftNote = vi.fn(async () => ({ note: "Not this" }));
    const form = await pasted(youtube, actions({ draftNote }));
    form.type("textarea", 0, "My own line");
    form.tick(true);
    await flush();
    expect(draftNote).not.toHaveBeenCalled();
    expect(form.note()).toBe("My own line");
    expect(form.html()).toContain(m.draftKept);
  });

  it("drops the model's answer when the member starts typing first", async () => {
    let answer!: (draft: { note: string }) => void;
    const form = await pasted(
      youtube,
      actions({ draftNote: () => new Promise((resolve) => (answer = resolve)) }),
    );
    form.tick(true);
    form.type("textarea", 0, "My own line");
    answer({ note: "Not this" });
    await flush();
    expect(form.note()).toBe("My own line");
    expect(form.html()).toContain(m.draftKept);
    expect(form.html()).not.toContain(drafted);
  });

  it("takes the tick and an untouched draft away when the link changes or the tick goes", async () => {
    const draftNote = vi.fn(async () => ({ note: "A draft" }));
    const form = await pasted(youtube, actions({ draftNote }));
    form.tick(true);
    await flush();
    form.tick(false);
    expect(form.note()).toBe("");
    expect(form.html()).not.toContain(drafted);
    form.tick(true);
    await flush();
    expect(form.note()).toBe("A draft");
    form.type("input", 0, "https://www.youtube.com/watch?v=bbbbbbbbbbb");
    expect(form.note()).toBe("");
    await settle();
    expect(form.checkbox()?.props.checked).toBe(false);
    expect(draftNote).toHaveBeenCalledTimes(2);
    expect(form.html()).not.toContain(drafted);
  });

  it("keeps a draft the member changed when the link changes", async () => {
    const form = await pasted(youtube, actions({ draftNote: async () => ({ note: "A draft" }) }));
    form.tick(true);
    await flush();
    form.type("textarea", 0, "A draft, and more");
    form.type("input", 0, tiktok);
    expect(form.note()).toBe("A draft, and more");
  });

  it("ignores a late answer about the link before", async () => {
    const answers: ((read: LinkRead) => void)[] = [];
    const form = await pasted(
      youtube,
      actions({ preview: () => new Promise((resolve) => answers.push(resolve)) }),
    );
    form.type("input", 0, blog);
    await settle();
    answers[1]!(page);
    await flush();
    answers[0]!({ ...video, caption: "From the old link", author: "Old author" });
    await flush();
    expect(form.html()).not.toContain("From the old link");
    expect(form.inputs()).toEqual([blog, "Cats and bread", "Fictional Walks"]);
  });

  it("falls back to today's form when the preview fails, naming the error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const add = vi.fn(async () => null);
    const form = await pasted(
      blog,
      actions({
        add,
        preview: async () => {
          throw new TypeError("network down");
        },
      }),
    );
    expect(form.html()).toContain(`${m.previewFailed} (TypeError)`);
    expect(log).toHaveBeenCalledWith("link preview failed: TypeError");
    expect(form.checkbox()).toBeUndefined();
    form.type("input", 1, "Typed title");
    form.type("textarea", 0, "Cats on the slope");
    form.submit();
    await flush();
    expect(add).toHaveBeenCalledWith({
      url: blog,
      note: "Cats on the slope",
      noteLang: "en",
      title: "Typed title",
    });
    log.mockRestore();
  });

  it("works exactly as before when nothing can read links", async () => {
    const form = mount({ signedIn: true, add: vi.fn(async () => null), write: vi.fn() });
    form.click(m.link);
    form.type("input", 0, youtube);
    await settle();
    expect(form.html()).not.toContain('data-testid="link-preview"');
  });

  it("shows a read that came back unread with its reason", async () => {
    const form = await pasted(
      blog,
      actions({ preview: async () => ({ outcome: "unread", failure: "RefusedLink" }) }),
    );
    expect(form.html()).toContain(`${m.previewFailed} (RefusedLink)`);
    expect(form.inputs()).toEqual([blog, "", ""]);
  });

  it("names a draft that failed, and leaves the note for the member", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const empty = await pasted(
      youtube,
      actions({ draftNote: async () => ({ note: null, failure: "TimeoutError" }) }),
    );
    empty.tick(true);
    await flush();
    expect(empty.html()).toContain(`${m.draftFailed} (TimeoutError)`);
    expect(empty.note()).toBe("");
    const thrown = await pasted(
      youtube,
      actions({
        draftNote: () =>
          Promise.reject(
            Object.assign(new Error("[CONVEX] redacted"), {
              name: "ConvexError",
              data: { code: "rate_limited" },
            }),
          ),
      }),
    );
    thrown.tick(true);
    await flush();
    expect(thrown.html()).toContain(`${m.draftFailed} (ConvexError: rate_limited)`);
    log.mockRestore();
  });

  it("names a throw that is not an Error", () => {
    expect(failureName("gone")).toBe("NonError: string");
    expect(failureName(undefined)).toBe("NonError: undefined");
    expect(failureName(new RangeError("x"))).toBe("RangeError");
  });

  it("speaks the member's language and drafts in it", async () => {
    const ja = addStoryMessages.ja;
    const draftNote = vi.fn(async () => ({ note: "閉店時に店主が猫にパンの耳をあげています。" }));
    const form = harness(() => AddStory({ locale: "ja", region, actions: actions({ draftNote }) }));
    form.click(ja.link);
    form.type("input", 0, youtube);
    await settle();
    expect(form.html()).toContain(ja.ownPost);
    form.tick(true);
    await flush();
    expect(draftNote).toHaveBeenCalledWith({ url: youtube, lang: "ja" });
    expect(form.html()).toContain(ja.drafted);
  });

  it("has every new string in both languages, without an em dash", () => {
    for (const key of [
      "previewLabel",
      "previewReading",
      "previewEmbedOnly",
      "previewFailed",
      "ownPost",
      "ownPostHint",
      "drafting",
      "drafted",
      "draftKept",
      "draftFailed",
    ] as const) {
      expect(addStoryMessages.ja[key]).toBeTruthy();
      expect(addStoryMessages.en[key]).not.toContain("\u2014");
      expect(addStoryMessages.ja[key]).not.toContain("\u2014");
    }
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
