import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryFeed, type StoryFeedActions } from "@/components/place/story-feed";
import { toStoryFeed, type WrittenStoryLike } from "@/components/public/mapping";
import { ConnectorChoice } from "@/components/share/connector-choice";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { region } from "../fixtures/public-ui";

// The connected choice is a marker here, so the test sees only which stories the page asks it for.
vi.mock("@/components/share/connector-choice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/share/connector-choice")>()),
  ConnectorChoiceConnected: ({ storyId }: { storyId: string }) => `[connector ${storyId}]`,
}));
vi.mock("@/components/share/share-story", () => ({ ShareStoryConnected: () => null }));

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
  };
});
afterEach(() => {
  hooks.current = undefined;
});

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}
function mount(view: () => ReactNode) {
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
  return {
    html: () => renderToStaticMarkup(<>{run()}</>),
    click: (text: string) =>
      (elements(run()).find((item) => item.props.children === text)!.props.onClick as () => void)(),
  };
}

// The markup escapes an apostrophe; the messages do not.
const esc = (text: string) => text.replaceAll("'", "&#x27;");
const en = addStoryMessages.en;
const ja = addStoryMessages.ja;

describe("the connector choice on a writer's own story", () => {
  it("renders nothing while the region has the connector off", () => {
    const view = mount(() =>
      ConnectorChoice({ locale: "en", offered: false, allowed: true, onSet: async () => null }),
    );
    expect(view.html()).toBe("");
  });

  it("says where the story stands, and links to the connector section of the notice", () => {
    const off = mount(() =>
      ConnectorChoice({ locale: "en", offered: true, allowed: false, onSet: async () => null }),
    ).html();
    expect(off).toContain(esc(en.connectorOff));
    expect(off).toContain(en.connectorAllow);
    expect(off).toContain('href="/en/privacy#connector"');
    const on = mount(() =>
      ConnectorChoice({ locale: "ja", offered: true, allowed: true, onSet: async () => null }),
    ).html();
    expect(on).toContain(esc(ja.connectorOn));
    expect(on).toContain(ja.connectorStop);
    expect(on).toContain('href="/ja/privacy#connector"');
  });

  it("turns it on, then off, and says what it did", async () => {
    const onSet = vi.fn(async () => null);
    let allowed = false;
    const view = mount(() => ConnectorChoice({ locale: "en", offered: true, allowed, onSet }));
    view.click(en.connectorAllow);
    await vi.waitFor(() => expect(view.html()).toContain(esc(en.connectorAllowed)));
    expect(onSet).toHaveBeenLastCalledWith(true);
    allowed = true;
    view.click(en.connectorStop);
    await vi.waitFor(() => expect(view.html()).toContain(esc(en.connectorStopped)));
    expect(onSet).toHaveBeenLastCalledWith(false);
  });

  it("keeps the state and shows the refusal when the server refuses", async () => {
    const onSet = vi.fn(async () => {
      throw Object.assign(new Error("[CONVEX] redacted"), { data: { code: "forbidden" } });
    });
    const view = mount(() =>
      ConnectorChoice({ locale: "en", offered: true, allowed: false, onSet }),
    );
    view.click(en.connectorAllow);
    await vi.waitFor(() => expect(onSet).toHaveBeenCalled());
    await vi.waitFor(() => expect(view.html()).not.toContain(esc(en.connectorAllowed)));
    expect(view.html()).toContain(esc(en.connectorOff));
  });
});

const written = (fields: Partial<WrittenStoryLike>): WrittenStoryLike => ({
  _id: "story",
  body: "A story written on Noren.",
  lang: "en",
  authorName: "Fictional walker",
  addedAt: Date.UTC(2026, 9, 2),
  isMock: false,
  canRemove: false,
  addedByMe: false,
  ...fields,
});
const actions: StoryFeedActions = { remove: async () => null };
function page(
  stories: WrittenStoryLike[],
  options: { connectorOffered?: boolean; signedIn?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <StoryFeed
      locale="en"
      entries={toStoryFeed([], stories, false)}
      scriptOrigins={region.scriptOrigins}
      frameOrigins={region.frameOrigins}
      actions={options.signedIn === false ? undefined : actions}
      connectorOffered={options.connectorOffered}
    />,
  );
}

describe("which stories ask for the connector choice", () => {
  const stories = [written({ _id: "mine", addedByMe: true }), written({ _id: "theirs" })];

  it("asks for the member's own stories only, and only with the switch on", () => {
    const html = page(stories, { connectorOffered: true });
    expect(html).toContain("[connector mine]");
    expect(html).not.toContain("[connector theirs]");
  });

  it("asks for nothing with the switch off, which is the default", () => {
    expect(page(stories, { connectorOffered: false })).not.toContain("[connector");
    expect(page(stories)).not.toContain("[connector");
  });

  it("asks for nothing when signed out", () => {
    expect(page(stories, { connectorOffered: true, signedIn: false })).not.toContain("[connector");
  });
});
