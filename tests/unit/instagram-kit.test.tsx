import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsentTick } from "@/components/share/consent-tick";
import { ShareStory, type KitViewer } from "@/components/share/share-story";
import { shareMessages } from "@/lib/i18n/messages/share";
import { shellMessages } from "@/lib/i18n/messages/shell";

// The kit runs without a DOM; this keeps its state between calls and drives its handlers, as the
// story form's tests do. The share sheet is the browser's, so what it can take is supplied here.
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
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
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
  const all = () => elements(run());
  return {
    html: () => render(<>{run()}</>),
    has: (text: string) => all().some((item) => item.props.children === text),
    click: (text: string) =>
      (all().find((item) => item.props.children === text)!.props.onClick as () => void)(),
    radio: (index: number) =>
      (all().filter((item) => item.props.type === "radio")[index]!.props.onChange as () => void)(),
  };
}

const en = shareMessages.en;
const ja = shareMessages.ja;
const png = () => new Response(new Blob(["x"], { type: "image/png" }), { status: 200 });
const caption =
  "A story.\n\nStory by Mika on Noren\nTest Shop テスト店\nnoren.yooi.me\n\n#長崎 #Nagasaki";

function kit(props: Partial<Parameters<typeof ShareStory>[0]> & { viewer?: KitViewer } = {}) {
  return mount(() =>
    ShareStory({ locale: "en", storyId: "s1", caption, defaultOpen: true, ...props }),
  );
}

describe("the kit's panel", () => {
  it("shows a picture for a feed post without the story's photos, and the caption to copy", () => {
    const html = kit().html();
    expect(html).toContain('src="/api/share/s1?size=feed"');
    expect(html).toContain(en.copyCaption);
    expect(html).toContain(en.download);
    expect(html).toContain("Story by Mika on Noren");
    expect(html).toContain("noren.yooi.me");
    expect(html).toContain("Feed post, 1080 x 1350");
  });

  it("can take the story size instead, still without the photos", () => {
    const view = kit();
    view.radio(1);
    expect(view.html()).toContain('src="/api/share/s1?size=story"');
  });

  it("is shut until asked for, and says Share on Instagram", () => {
    const html = kit({ defaultOpen: false }).html();
    expect(html).toContain("Share on Instagram");
    expect(html).not.toContain("/api/share/");
    expect(html).not.toContain("<textarea");
  });

  it("speaks Japanese on a Japanese page", () => {
    const html = kit({ locale: "ja" }).html();
    expect(html).toContain("Instagram でシェア");
    expect(html).toContain(ja.copyCaption);
    expect(html).toContain(ja.download);
  });

  it("copies the caption it shows", async () => {
    const writeText = vi.fn(async () => {});
    const view = kit({ deps: { nav: { clipboard: { writeText } as never } } });
    view.click(en.copyCaption);
    await vi.waitFor(() => expect(view.html()).toContain(en.captionCopied));
    expect(writeText).toHaveBeenCalledWith(caption);
  });

  it("says so when the browser refuses to copy", async () => {
    const view = kit({ deps: { nav: {} } });
    view.click(en.copyCaption);
    await vi.waitFor(() => expect(view.html()).toContain(en.captionFailed));
  });

  it("saves the picture, without the photo", async () => {
    const fetcher = vi.fn(async () => png());
    const download = vi.fn();
    const view = kit({ deps: { fetcher, download, nav: {} } });
    view.click(en.download);
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith("/api/share/s1?size=feed");
    expect((download.mock.calls[0] as unknown as [File])[0].name).toBe("noren-story-feed.png");
    await vi.waitFor(() => expect(view.html()).toContain(en.downloaded));
  });
});

describe("the phone's share sheet", () => {
  it("is offered only where the browser can send a picture to it", () => {
    expect(kit({ deps: { nav: {} } }).has(en.share)).toBe(false);
    expect(
      kit({ deps: { nav: { share: async () => {}, canShare: () => false } } }).has(en.share),
    ).toBe(false);
    expect(
      kit({ deps: { nav: { share: async () => {}, canShare: () => true } } }).has(en.share),
    ).toBe(true);
  });

  it("hands over the picture file, with the caption, so Instagram can be picked", async () => {
    const share = vi.fn(async () => {});
    const view = kit({
      deps: { fetcher: async () => png(), nav: { share, canShare: () => true } },
    });
    view.click(en.share);
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const sent = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(sent.files?.[0]?.name).toBe("noren-story-feed.png");
    expect(sent.text).toBe(caption);
    await vi.waitFor(() => expect(view.html()).toContain(en.shared));
  });
});

describe("what each viewer sees beside the button", () => {
  const tick = (html: string) => html.includes('data-testid="share-consent-state"');

  it("lets the writer see and change whether Noren and the place may share the story", async () => {
    const onSetConsent = vi.fn(async () => null);
    const on = kit({ optedIn: true, canOptIn: true, onSetConsent });
    expect(on.html()).toContain(en.consentOn);
    expect(on.html()).toContain(en.hintWriter.replaceAll("'", "&#x27;"));
    on.click(en.consentStop);
    await vi.waitFor(() => expect(onSetConsent).toHaveBeenCalledWith(false));
    await vi.waitFor(() => expect(on.html()).toContain(en.consentStopped));

    const off = kit({ optedIn: false, canOptIn: true, onSetConsent });
    expect(off.html()).toContain(en.consentOff);
    off.click(en.consentAllow);
    await vi.waitFor(() => expect(onSetConsent).toHaveBeenLastCalledWith(true));
    await vi.waitFor(() => expect(off.html()).toContain(en.consentAllowed));
  });

  it("does not offer to turn it on where the region does not offer it, but always to turn it off", () => {
    const set = async () => null;
    expect(tick(kit({ optedIn: false, canOptIn: false, onSetConsent: set }).html())).toBe(false);
    expect(kit({ optedIn: true, canOptIn: false, onSetConsent: set }).has(en.consentStop)).toBe(
      true,
    );
  });

  it("tells the writer when changing it fails, from the error's code", async () => {
    const forbidden = new ConvexError({ code: "forbidden", message: "only the writer" });
    const view = kit({
      optedIn: true,
      canOptIn: true,
      onSetConsent: async () => {
        throw forbidden;
      },
    });
    view.click(en.consentStop);
    await vi.waitFor(() => expect(view.html()).toContain(shellMessages.en.forbidden));
    expect(view.html()).not.toContain(en.consentStopped);
  });

  it.each<KitViewer>(["owner", "steward"])(
    "gives the place's %s the kit, without the writer's tick to change",
    (viewer) => {
      const html = kit({ viewer, optedIn: true, canOptIn: true, onSetConsent: undefined }).html();
      expect(tick(html)).toBe(false);
      expect(html).not.toContain(en.consentStop);
      expect(html).toContain(en.hintShared);
      expect(html).toContain(en.copyCaption);
      expect(html).toContain('src="/api/share/s1?size=feed"');
    },
  );

  it("never lets a viewer who is not the writer change it, even if handed the handler", () => {
    const html = kit({
      viewer: "owner",
      optedIn: true,
      canOptIn: true,
      onSetConsent: async () => null,
    }).html();
    expect(tick(html)).toBe(false);
  });
});

describe("the tick on the story form", () => {
  const tickIn = (locale: "en" | "ja") =>
    render(<ConsentTick locale={locale} hintId="hint" checked={false} onChange={() => {}} />);

  it("says Noren and this place may share the story on Instagram, with the writer's name", () => {
    expect(en.consentTick).toBe(
      "Noren and this place may share my story on Instagram, with my name.",
    );
    expect(ja.consentTick).toBe(
      "Noren とこの場所が、私の名前を添えて、この話を Instagram で紹介してもかまいません。",
    );
    const html = tickIn("en");
    expect(html.replaceAll("&#x27;", "'")).toContain(en.consentTick);
    expect(html).toContain(en.consentHint.replaceAll('"', "&quot;"));
    expect(tickIn("ja")).toContain(ja.consentTick);
  });

  it("is a box that starts unticked", () => {
    expect(tickIn("en")).toContain('data-testid="share-consent"');
    expect(tickIn("en")).not.toContain("checked");
  });
});
