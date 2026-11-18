import type { ComponentProps, ReactElement, ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { regionSchema } from "@/lib/region/schema";
import regionJson from "../../regions/nagasaki.json";

const menu = vi.hoisted(() => ({ open: true }));
vi.mock("radix-ui", async (original) => {
  const actual = await original<typeof import("radix-ui")>();
  return {
    ...actual,
    DropdownMenu: {
      ...actual.DropdownMenu,
      Root: (props: ComponentProps<typeof actual.DropdownMenu.Root>) => (
        <actual.DropdownMenu.Root {...props} defaultOpen={menu.open} />
      ),
      Portal: ({ children }: { children?: ReactNode }) => <>{children}</>,
    },
  };
});
const mocks = vi.hoisted(() => ({
  postcard: false,
  card: null as unknown,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  usePathname: () => "/en/postcards",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/lib/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/region", async () => {
  const config = regionSchema.parse(regionJson);
  return {
    getActiveRegion: () => ({
      ...config,
      features: { ...config.features, postcard: mocks.postcard },
    }),
  };
});
vi.mock("@/lib/postcard/load", () => ({ loadPostcard: async () => mocks.card }));

import { AccountMenuView, type AccountState } from "@/components/layout/account-menu";
import { FeatureLinksProvider } from "@/components/layout/features";
import { PostcardCard, type CardData } from "@/components/postcard/postcard-card";
import PostcardPage, { generateMetadata as cardMetadata } from "@/app/[lang]/postcard/[code]/page";
import PostcardsPage, { generateMetadata as makerMetadata } from "@/app/[lang]/postcards/page";
import { postcardMessages } from "@/lib/i18n/messages/postcard";
import { codeOf, canPick, itemsOf, mayReplace, momentKey, postcardUrl } from "@/lib/postcard/form";

const config = regionSchema.parse(regionJson);
const CODE = "abcdefghjkmnpqrstuvwxyz2".slice(0, 24).padEnd(24, "a");
const region = {
  defaultLocale: config.defaultLocale,
  nameFallback: config.nameFallback,
  town: { en: "Nagasaki", ja: "長崎" },
  utcOffsetHours: 9,
  photoBaseUrl: "https://photos.example.test",
};
const names = (en: string, ja: string) => [
  { lang: "en", script: "latin" as const, value: en, isPrimary: true },
  { lang: "ja", script: "kanji" as const, value: ja, isPrimary: true },
];
const card = (over: Partial<CardData> = {}): CardData => ({
  recipientName: "Mum",
  message: "Dear Mum,\n\nThe ramen was <b>hot</b>.",
  messageLang: "en",
  aiAssisted: false,
  fromName: "Hana",
  sentAt: Date.UTC(2026, 10, 17, 18, 0),
  places: [
    {
      slug: "dejima",
      names: names("Dejima", "出島"),
      excerpt: { text: "The guide waved at the old warehouse.", lang: "en" },
      photos: [{ key: "photos/a.jpg", width: 800, height: 600 }],
    },
    { slug: "shinchi", names: names("Shinchi Chinatown", "新地中華街"), photos: [] },
  ],
  ...over,
});

beforeEach(() => {
  mocks.postcard = false;
  mocks.card = null;
  mocks.notFound.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("the shipped switch", () => {
  it("is off in the region file and in the schema's default", () => {
    expect(regionJson.features).toHaveProperty("postcard", false);
    expect(regionSchema.parse(regionJson).features.postcard).toBe(false);
    const { features, ...rest } = regionJson;
    expect(features).toBeDefined();
    expect(regionSchema.parse({ ...rest }).features.postcard).toBe(false);
    const without = { ...regionJson, features: { connector: true } };
    expect(regionSchema.parse(without).features.postcard).toBe(false);
  });
});

describe("the pages with the switch off", () => {
  it("are a 404 before anything renders, with no title", async () => {
    expect(() => PostcardsPage()).toThrow("NEXT_NOT_FOUND");
    expect(() =>
      PostcardPage({ params: Promise.resolve({ lang: "en", code: CODE }) } as never),
    ).toThrow("NEXT_NOT_FOUND");
    const params = Promise.resolve({ lang: "en", code: CODE });
    expect(await makerMetadata({ params } as never)).toEqual({});
    expect(await cardMetadata({ params } as never)).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(await cardMetadata({ params } as never)).not.toHaveProperty("title");
  });

  it("show no link in the account menu", () => {
    const signedIn: AccountState = {
      kind: "signedIn",
      displayName: "Demo person",
      role: "user",
      isMock: false,
    };
    const html = render(
      <FeatureLinksProvider>
        <AccountMenuView locale="en" state={signedIn} signOut={<button>Sign out</button>} />
      </FeatureLinksProvider>,
    );
    expect(html).not.toContain("/en/postcards");
    const on = render(
      <FeatureLinksProvider postcard>
        <AccountMenuView locale="ja" state={signedIn} signOut={<button>Sign out</button>} />
      </FeatureLinksProvider>,
    );
    expect(on).toContain('href="/ja/postcards"');
    expect(on).toContain("絵はがきを送る");
  });
});

describe("the pages with the switch on", () => {
  beforeEach(() => {
    mocks.postcard = true;
  });

  it("make a sender's page and a card page, never indexed, with the referrer withheld", async () => {
    const maker = PostcardsPage() as ReactElement;
    expect(maker).toBeDefined();
    const params = Promise.resolve({ lang: "ja", code: CODE });
    expect(await makerMetadata({ params } as never)).toEqual({ title: "絵はがきを送る | Noren" });
    mocks.card = null;
    expect(await cardMetadata({ params } as never)).toEqual({
      robots: { index: false, follow: false },
      referrer: "same-origin",
    });
  });

  it("give a card a preview: title, description and a picture of names only, in the card's language", async () => {
    mocks.card = card();
    const meta = await cardMetadata({
      params: Promise.resolve({ lang: "en", code: CODE }),
    } as never);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe("A postcard for Mum | Noren");
    expect(meta.description).toBe(
      "A postcard from Hana about Dejima, Shinchi Chinatown in Nagasaki.",
    );
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: `/api/postcard/${CODE}/image?lang=en`, width: 1200 }),
    ]);
    // Nothing the sender wrote or photographed is in the preview text.
    expect(JSON.stringify(meta)).not.toContain("ramen");
    expect(JSON.stringify(meta)).not.toContain("warehouse");
  });

  it("answer 404 for a card that is not there", async () => {
    mocks.card = null;
    const suspense = PostcardPage({
      params: Promise.resolve({ lang: "en", code: CODE }),
    } as never) as ReactElement<{ children: ReactElement }>;
    const inner = suspense.props.children;
    await expect((inner.type as (p: unknown) => Promise<unknown>)(inner.props)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("show the card to someone without an account", async () => {
    mocks.card = card();
    const suspense = PostcardPage({
      params: Promise.resolve({ lang: "en", code: CODE }),
    } as never) as ReactElement<{ children: ReactElement }>;
    const inner = suspense.props.children;
    const html = render(await (inner.type as (p: unknown) => Promise<ReactElement>)(inner.props));
    expect(html).toContain("For Mum");
    expect(html).toContain("From Hana");
    expect(html).toContain("Have a look at Noren");
    expect(html).toContain("Only people with this link can read it.");
  });
});

describe("the card", () => {
  for (const locale of ["en", "ja"] as const) {
    const m = postcardMessages[locale];

    it(`is composed from the member's photos, stamps, town and day (${locale})`, () => {
      const html = render(<PostcardCard locale={locale} card={card()} region={region} />);
      expect(html).toContain('src="https://photos.example.test/photos/a.jpg"');
      expect(html).toContain('width="800"');
      expect(html).toContain("data-postcard-stamps");
      expect(html).toContain("[writing-mode:vertical-rl]");
      expect(html).toContain("Nagasaki");
      expect(html).toContain("長崎");
      expect(html).toContain(locale === "ja" ? "2026年11月18日" : "November 18, 2026");
      expect(html).toContain(m.cardTitle);
    });

    it(`links each place to its public page, English first with Japanese beside (${locale})`, () => {
      const html = render(<PostcardCard locale={locale} card={card()} region={region} />);
      expect(html).toContain(`href="/${locale}/places/dejima"`);
      expect(html).toContain(`href="/${locale}/places/shinchi"`);
      const dejima = html.indexOf("Dejima</span>");
      const ja = html.indexOf("出島</span>");
      expect(dejima).toBeGreaterThan(-1);
      expect(ja).toBeGreaterThan(-1);
    });
  }

  it("shows the sender's words as text, never as markup", () => {
    const html = render(<PostcardCard locale="en" card={card()} region={region} />);
    expect(html).toContain("&lt;b&gt;hot&lt;/b&gt;");
    expect(html).not.toContain("<b>hot</b>");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("says in its own words that Noren's AI helped, only when it did", () => {
    const plain = render(<PostcardCard locale="en" card={card()} region={region} />);
    expect(plain).not.toContain("data-postcard-ai");
    const helped = render(
      <PostcardCard locale="en" card={card({ aiAssisted: true })} region={region} />,
    );
    expect(helped).toContain("data-postcard-ai");
    expect(helped).toContain(
      "Drafted with help from Noren&#x27;s AI, then written and sent by Hana.",
    );
    const ja = render(
      <PostcardCard locale="ja" card={card({ aiAssisted: true })} region={region} />,
    );
    expect(ja).toContain("Noren の AI が手伝いました");
    // No provider or model name anywhere.
    expect(helped).not.toMatch(/claude|anthropic|muse|meta|openai|gpt|spark|glimmer/i);
  });

  it("shows a place with no words and no photo once its story is gone, and keeps the place", () => {
    const html = render(
      <PostcardCard
        locale="en"
        card={card({ places: [{ slug: "dejima", names: names("Dejima", "出島"), photos: [] }] })}
        region={region}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<blockquote");
    expect(html).toContain('href="/en/places/dejima"');
  });

  it("shows no photo without a photo address (the sender's preview), and no links out", () => {
    const html = render(
      <PostcardCard
        locale="en"
        card={card()}
        region={{ ...region, photoBaseUrl: undefined }}
        preview
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/places/");
  });

  it("shows at most four photos, one per place", () => {
    const places = Array.from({ length: 6 }, (_, i) => ({
      slug: `p${i}`,
      names: names(`Place ${i}`, `場所${i}`),
      photos: [{ key: `photos/${i}.jpg`, width: 10, height: 10 }],
    }));
    const html = render(<PostcardCard locale="en" card={card({ places })} region={region} />);
    expect(html.match(/<img/g)).toHaveLength(4);
  });
});

describe("the form's small rules", () => {
  const story = { kind: "story" as const, storyId: "s1", placeId: "p1" };
  const stamp = { kind: "stamp" as const, placeId: "p2" };

  it("names a moment by its story, or by its place's stamp", () => {
    expect(momentKey(story)).toBe("story:s1");
    expect(momentKey(stamp)).toBe("stamp:p2");
  });

  it("allows one moment per place and at most eight places", () => {
    expect(canPick({ ...stamp, placeId: "p1" }, [story])).toEqual({ ok: false, why: "samePlace" });
    expect(canPick(story, [story])).toEqual({ ok: true });
    const eight = Array.from({ length: 8 }, (_, i) => ({
      kind: "stamp" as const,
      placeId: `x${i}`,
    }));
    expect(canPick(stamp, eight)).toEqual({ ok: false, why: "full" });
    expect(canPick(eight[0]!, eight)).toEqual({ ok: true });
  });

  it("sends the server stories by id and stamps by place", () => {
    expect(itemsOf([story, stamp])).toEqual([
      { kind: "story", storyId: "s1" },
      { kind: "stamp", placeId: "p2" },
    ]);
  });

  it("puts a draft straight in only when nothing the member typed would be lost", () => {
    expect(mayReplace({ message: "", lastDraft: "" })).toBe(true);
    expect(mayReplace({ message: "  \n", lastDraft: "x" })).toBe(true);
    expect(mayReplace({ message: "same", lastDraft: "same" })).toBe(true);
    expect(mayReplace({ message: "same plus mine", lastDraft: "same" })).toBe(false);
  });

  it("reads a ConvexError's code, never its message", () => {
    expect(codeOf({ data: { code: "rate_limited", message: "[redacted]" } })).toBe("rate_limited");
    expect(codeOf(new Error("Server Error"))).toBeNull();
    expect(codeOf(null)).toBeNull();
    expect(codeOf({ data: "text" })).toBeNull();
  });

  it("builds the link from the card's language and its code", () => {
    expect(postcardUrl("https://noren.yooi.me", "ja", CODE)).toBe(
      `https://noren.yooi.me/ja/postcard/${CODE}`,
    );
  });
});
