import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbedView, type EmbedSourceView } from "@/components/embeds/embed-view";
import { checkDate } from "@/components/place/check-state";
import { quoted } from "@/components/embeds/quoted";
import { LatestStories } from "@/components/public/latest-stories";
import { toEmbedSource, toStoryFeed } from "@/components/public/mapping";
import { StoryFinderView, type StoryFinderProps } from "@/components/steward/story-finder-view";
import { format } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { publicMessages } from "@/lib/i18n/messages/public";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { storyFinderMessages } from "@/lib/i18n/messages/story-finder";

// Made-up posts only.
const QUOTE = "Test Shop is a made-up place whose owner roasts beans by hand every morning.";
const reddit: EmbedSourceView = {
  id: "s1",
  platform: "reddit",
  canonicalUrl: "https://www.reddit.com/r/mocktravel/comments/mock01/test_shop/",
  embed: { kind: "link", url: "https://www.reddit.com/r/mocktravel/comments/mock01/test_shop/" },
  authorHandle: "u/mock_user",
  authorUrl: "https://www.reddit.com/user/mock_user/",
  postedAt: Date.UTC(2026, 9, 1),
  isMock: false,
  found: true,
  excerpt: QUOTE,
  excerptLang: "en",
  excerptTranslations: [{ lang: "ja", text: "テスト用の架空の訳です。" }],
};
const render = (source: EmbedSourceView, locale: "ja" | "en") =>
  renderToStaticMarkup(
    <EmbedView
      locale={locale}
      source={source}
      scriptOrigins={["https://www.instagram.com"]}
      frameOrigins={[]}
    />,
  );
const encoded = (text: string) => renderToStaticMarkup(<>{text}</>);

describe("a found post on the place page", () => {
  it.each(["ja", "en"] as const)(
    "%s: a link card shows the label, the author, the quote in quotation marks and a link",
    (locale) => {
      const m = placeUiMessages[locale];
      const html = render(reddit, locale);
      expect(html).toContain(encoded(m.foundInPublicPost));
      expect(html).toContain(">Reddit<");
      expect(html).toContain(encoded(m.postedBy.replace("{author}", "u/mock_user")));
      expect(html).toContain(`<blockquote lang="en"`);
      expect(html).toContain(encoded(`“${QUOTE}”`));
      expect(html).toContain(
        'href="https://www.reddit.com/r/mocktravel/comments/mock01/test_shop/"',
      );
      // The Japanese reader also gets the machine translation, labelled.
      expect(html.includes("テスト用の架空の訳です。")).toBe(locale === "ja");
    },
  );

  it("with its translation held back, the card shows the quote alone, unlabelled", () => {
    const html = render({ ...reddit, excerptTranslations: [] }, "ja");
    expect(html).toContain(`<blockquote lang="en"`);
    expect(html).toContain(encoded(`“${QUOTE}”`));
    expect(html).not.toContain("テスト用の架空の訳です。");
    expect(html).not.toContain(encoded(badgeMessages.ja.machineTranslation));
    expect(render(reddit, "ja")).toContain(encoded(badgeMessages.ja.machineTranslation));
  });

  it("Japanese quotes use corner brackets", () => {
    expect(quoted("テストです。", "ja")).toBe("「テストです。」");
    expect(quoted("A test.", "en")).toBe("“A test.”");
  });

  const instagram = {
    ...reddit,
    platform: "instagram",
    canonicalUrl: "https://www.instagram.com/p/MOCKPOST1/",
    embed: {
      kind: "blockquote",
      url: "https://www.instagram.com/p/MOCKPOST1/",
      scriptUrl: "https://www.instagram.com/embed.js",
    },
    authorHandle: "mock_author",
  } satisfies EmbedSourceView;

  it("an embeddable found post shows its quote and still offers the official embed", () => {
    const html = render(instagram, "en");
    expect(html).toContain(placeUiMessages.en.foundInPublicPost);
    expect(html).toContain(encoded(`“${QUOTE}”`));
    expect(html).toContain("Load this post from Instagram");
  });

  it("a found post linked before quotes were kept shows the embed alone", () => {
    const html = render({ ...instagram, excerpt: undefined, excerptLang: undefined }, "en");
    expect(html).toContain("Load this post from Instagram");
    expect(html).not.toContain("<blockquote lang");
  });

  it("a quoted link card does not repeat the link as a box of its own", () => {
    const html = render(reddit, "en");
    expect(html).not.toContain("block rounded border p-4 underline");
    expect(render({ ...reddit, excerpt: undefined }, "en")).toContain(
      "block rounded border p-4 underline",
    );
  });

  it("the feed opens with what members shared, then found stories, then found tips", () => {
    const post = (
      name: string,
      addedAt: number,
      fields: Partial<Parameters<typeof toEmbedSource>[0]>,
    ) => ({ ...reddit, _id: name, addedAt, ...fields }) as Parameters<typeof toEmbedSource>[0];
    const found = { foundInPublicPost: true };
    const feed = toStoryFeed(
      [
        // The finder's order would read backwards by the time they were linked.
        post("story-old", 9, { ...found, foundKind: "story", postedAt: 100 }),
        post("story-new", 8, { ...found, foundKind: "story", postedAt: 200 }),
        post("tip-new", 7, { ...found, foundKind: "tip", postedAt: 300 }),
        post("tip-undated", 6, { ...found, foundKind: "tip", postedAt: undefined }),
        post("member", 1, {}),
      ],
      [
        {
          _id: "written",
          body: "x",
          lang: "en",
          authorName: "Mock",
          addedAt: 2,
          isMock: false,
          canRemove: false,
        },
      ],
      false,
    );
    expect(feed.map((entry) => entry.id)).toEqual([
      "written",
      "member",
      "story-new",
      "story-old",
      "tip-new",
      "tip-undated",
    ]);
  });

  it("only a found source carries the found fields into the card", () => {
    const { id, ...rest } = reddit;
    const base = { ...rest, _id: id } as Parameters<typeof toEmbedSource>[0];
    expect(toEmbedSource({ ...base, foundInPublicPost: true })).toMatchObject({
      found: true,
      excerpt: QUOTE,
    });
    const member = toEmbedSource({ ...base, foundInPublicPost: undefined });
    expect(member).not.toHaveProperty("found");
    expect(member).not.toHaveProperty("excerpt");
  });

  it.each(["ja", "en"] as const)(
    "%s: the newest stories credit a found post to where it was posted",
    (locale) => {
      const html = renderToStaticMarkup(
        <LatestStories
          locale={locale}
          region={{ nameFallback: { ja: ["kanji"], en: ["latin"] }, defaultLocale: "ja" }}
          entries={[
            {
              kind: "post",
              id: "s1",
              placeSlug: "test-shop",
              placeNames: [{ lang: "en", script: "latin", value: "Test Shop", isPrimary: true }],
              text: QUOTE,
              lang: "en",
              platform: "reddit",
              sharedBy: "u/mock_user",
              found: true,
              addedAt: Date.UTC(2026, 9, 1),
            },
          ]}
        />,
      );
      expect(html).toContain(
        encoded(publicMessages[locale].foundPost.replace("{platform}", "Reddit")),
      );
      expect(html).toContain(encoded(`“${QUOTE}”`));
    },
  );
});

const row = (overrides: Partial<StoryFinderProps["attached"][number]> = {}) => ({
  id: "c1",
  placeSlug: "test-shop",
  placeName: "Test Shop",
  platform: "google_reviews" as const,
  url: "https://www.google.com/maps/reviews/data=!mock",
  author: "Mock Reviewer",
  postedAt: Date.UTC(2026, 9, 1),
  checkedAt: Date.UTC(2026, 10, 4),
  status: "attached" as const,
  kind: "story" as const,
  quote: "テスト用の架空の引用です。",
  evidence: "テスト店",
  topics: ["history"],
  sourceHidden: false,
  ...overrides,
});
const SHOWN_AT = Date.UTC(2026, 10, 4, 3);
const props = (locale: "ja" | "en"): StoryFinderProps => ({
  locale,
  counts: [
    { status: "attached", platform: "google_reviews", count: 3 },
    { status: "rejected", platform: "google_reviews", count: 2 },
    { status: "pending", platform: "instagram", count: 4 },
  ],
  attached: [row({ attachedAt: SHOWN_AT })],
  accepted: [row({ id: "c3", status: "accepted", attachError: "author_limit" })],
  rejected: [
    row({ id: "c2", status: "rejected", reason: "unverifiable", kind: "story" }),
    row({ id: "c4", status: "rejected", reason: "place_not_named", kind: "story" }),
  ],
  onCheck: () => {},
  onAttach: () => {},
  onHide: () => {},
  held: [],
  onRelease: () => {},
});

describe("the steward's story finder page", () => {
  it.each(["ja", "en"] as const)(
    "%s: a held quote shows why, with the choice to show it",
    (locale) => {
      const m = storyFinderMessages[locale];
      const none = renderToStaticMarkup(<StoryFinderView {...props(locale)} />);
      expect(none).not.toContain(encoded(m.heldTitle));
      const html = renderToStaticMarkup(
        <StoryFinderView
          {...props(locale)}
          held={[
            {
              id: "c1",
              placeSlug: "test-shop",
              placeName: "Test Shop",
              url: "https://blog.example.com/mock-entry",
              quote: QUOTE,
              translation: "A made-up translation.",
              added: ["A made-up addition."],
              missing: ["A made-up omission."],
            },
          ]}
        />,
      );
      for (const text of [
        m.heldTitle,
        m.heldIntro,
        m.heldTranslation,
        "A made-up translation.",
        "A made-up addition.",
        "A made-up omission.",
        stewardMessages[locale].checkRelease,
      ])
        expect(html).toContain(encoded(text));
      expect(html).toContain('data-steward-card="held-quote"');
    },
  );

  it.each(["ja", "en"] as const)(
    "%s: counts, both actions, linked posts with Hide, and reasons",
    (locale) => {
      const m = storyFinderMessages[locale];
      const html = renderToStaticMarkup(<StoryFinderView {...props(locale)} />);
      expect(html).toContain(encoded(m.title));
      expect(html).toContain(`href="/${locale}/steward/story-finder"`);
      expect(html).toMatch(/<td[^>]*>3<\/td>/);
      expect(html).toMatch(/<td[^>]*>5<\/td>/);
      for (const label of [
        m.check,
        m.checkOnly,
        m.linkedIntro,
        format(m.shownOn, { date: checkDate(SHOWN_AT, locale) }),
        m.author_limit,
        m.place_not_named,
        m.attach,
        m.linkedTitle,
        m.rejectedTitle,
        m.unverifiable,
        m.google_reviews,
        m.instagram,
      ])
        expect(html).toContain(encoded(label));
      // Hide on the linked post and the held one; a rejected post has nothing to hide.
      expect(html.match(new RegExp(`>${encoded(m.hide)}<`, "g"))).toHaveLength(2);
      expect(html).toContain('rel="noopener noreferrer nofollow"');
    },
  );

  it("names no AI or data provider in any of the new copy", () => {
    const copy = JSON.stringify([storyFinderMessages, placeUiMessages, publicMessages]);
    expect(copy).not.toMatch(
      /apify|muse|llama|openai|anthropic|claude|gemini|glimmer|\bmeta\b|\bAI\b|ＡＩ/i,
    );
  });
});
