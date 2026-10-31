import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddStory, type AddStoryActions } from "@/components/place/add-story";
import {
  describeStoryLink,
  noteLanguage,
  toStoryArgs,
  type StoryDraft,
} from "@/components/place/add-story-form";
import { PlaceView } from "@/components/public/place-view";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
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

  it("says when a link needs a typed title and suggests the credit a link carries", () => {
    expect(describeStoryLink(blog, region)).toEqual({ linkCard: true });
    expect(describeStoryLink(tiktok, region)).toMatchObject({ linkCard: false });
    expect(describeStoryLink(tiktok, region)?.suggestedAuthor).toMatch(/fictional_walker/);
    expect(describeStoryLink("", region)).toBeNull();
    expect(describeStoryLink("not a link", region)).toBeNull();
  });
});

for (const locale of ["ja", "en"] as const) {
  const m = addStoryMessages[locale];
  const actions = (signedIn: boolean | undefined): AddStoryActions => ({
    signedIn,
    add: async () => null,
  });

  it(`invites a visitor to sign in, waits for sign-in, and offers the form to a member (${locale})`, () => {
    const visitor = render(<AddStory locale={locale} region={region} actions={actions(false)} />);
    expect(visitor).toContain(m.signInToAdd);
    expect(visitor).toContain(`href="/${locale}/sign-in"`);
    expect(render(<AddStory locale={locale} region={region} actions={actions(undefined)} />)).toBe(
      "",
    );
    const member = render(<AddStory locale={locale} region={region} actions={actions(true)} />);
    expect(member).toContain(`>${m.open}</button>`);
    expect(member).not.toContain(m.signInToAdd);
  });

  it(`a real place takes stories even before it has any posts; the demo place does not (${locale})`, () => {
    const real = render(
      <PlaceView
        locale={locale}
        region={region}
        place={landmark}
        page={null}
        sources={[]}
        story={actions(true)}
      />,
    );
    expect(real).toContain(placePageMessages[locale].posts);
    expect(real).toContain(`>${m.open}</button>`);
    const demo = render(
      <PlaceView
        locale={locale}
        region={region}
        place={place}
        page={null}
        sources={[]}
        story={actions(true)}
      />,
    );
    expect(demo).not.toContain(placePageMessages[locale].posts);
    expect(demo).not.toContain(m.open);
    const demoWithPosts = render(
      <PlaceView
        locale={locale}
        region={region}
        place={place}
        page={null}
        sources={sources}
        story={actions(true)}
      />,
    );
    expect(demoWithPosts).toContain(placePageMessages[locale].posts);
    expect(demoWithPosts).not.toContain(m.open);
  });
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}
function mount(actions: AddStoryActions) {
  const state = { values: [] as unknown[], cursor: 0 };
  const view = () => {
    state.cursor = 0;
    hooks.current = state;
    try {
      return AddStory({ locale: "en", region, actions });
    } finally {
      hooks.current = undefined;
    }
  };
  const all = () => elements(view());
  const byType = (type: string) => all().filter((item) => item.type === type);
  return {
    html: () => render(<>{view()}</>),
    click: (text: string) =>
      (all().find((item) => item.props.children === text)!.props.onClick as () => void)(),
    type: (tag: "input" | "textarea", index: number, value: string) =>
      (byType(tag)[index]!.props.onChange as (event: unknown) => void)({ target: { value } }),
    inputs: () => byType("input").map((item) => item.props.value),
    submit: () =>
      (byType("form")[0]!.props.onSubmit as (event: unknown) => void)({
        preventDefault: () => {},
      }),
  };
}

describe("adding a story", () => {
  const m = addStoryMessages.en;

  it("asks for a title only for a link card and follows the link's credit until one is typed", () => {
    const form = mount({ signedIn: true, add: vi.fn() });
    form.click(m.open);
    form.type("input", 0, blog);
    expect(form.html()).toContain(m.title);
    form.type("input", 0, tiktok);
    expect(form.html()).not.toContain(m.title);
    expect(form.inputs()[1]).toMatch(/fictional_walker/);
    form.type("input", 1, "Someone else");
    form.type("input", 0, `${tiktok}?lang=en`);
    expect(form.inputs()[1]).toBe("Someone else");
  });

  it("says what is missing and sends nothing until the story is complete", async () => {
    const add = vi.fn(async () => null);
    const form = mount({ signedIn: true, add });
    form.click(m.open);
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
    expect(form.html()).toContain(`>${m.open}</button>`);
    expect(form.html()).not.toContain("<form");
    form.click(m.open);
    expect(form.inputs()).toEqual(["", ""]);
  });

  it("keeps the story and explains a refusal, such as the daily limit", async () => {
    const add = vi.fn(async () => {
      throw Object.assign(new Error("[CONVEX] redacted"), {
        data: { code: "rate_limited", message: "too many posts added today" },
      });
    });
    const form = mount({ signedIn: true, add });
    form.click(m.open);
    form.type("input", 0, tiktok);
    form.type("textarea", 0, "A story");
    form.submit();
    await vi.waitFor(() => expect(form.html()).toContain(shellMessages.en.rate_limited));
    expect(form.inputs()[0]).toBe(tiktok);
    expect(form.html()).not.toContain(m.added);
  });
});
