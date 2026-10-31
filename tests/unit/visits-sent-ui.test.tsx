import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreatorHomeView, type SharedPostLike } from "@/components/creator/creator-home-view";
import { StoryFeed } from "@/components/place/story-feed";
import { toStoryFeed, type SourceViewLike } from "@/components/public/mapping";
import { SHARED_POSTS_LISTED } from "@/lib/domain/constants";
import { format } from "@/lib/i18n";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { loadRegions } from "@/lib/region";
import { region, sources } from "../fixtures/public-ui";

const linked = (fields: Partial<SourceViewLike>): SourceViewLike => ({
  ...sources[2]!,
  isMock: false,
  addedAt: Date.UTC(2026, 9, 1),
  ...fields,
});
const anchors = (html: string) =>
  [...html.matchAll(/<a ([^>]*)>/g)].map(([, attributes]) =>
    Object.fromEntries(
      [...attributes!.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
    ),
  );

describe("a link to a shared post's original", () => {
  it("goes through Noren's counter only for a post everyone may see", () => {
    const feed = toStoryFeed(
      [
        linked({ _id: "public post", shownToEveryone: true }),
        linked({ _id: "mine only", shownToEveryone: false, addedAt: 0 }),
        linked({ _id: "unsaid", addedAt: -1 }),
      ],
      [],
      false,
    );
    expect(feed.map((entry) => (entry.kind === "post" ? entry.outboundHref : "written"))).toEqual([
      "/out/public%20post",
      undefined,
      undefined,
    ]);
  });

  it("lets the original see the visit came from Noren, and otherwise sends no referrer", () => {
    const html = renderToStaticMarkup(
      <StoryFeed
        locale="en"
        entries={toStoryFeed(
          [
            linked({ _id: "counted", shownToEveryone: true }),
            linked({ _id: "uncounted", shownToEveryone: false, addedAt: 0 }),
          ],
          [],
          false,
        )}
        scriptOrigins={region.scriptOrigins}
        frameOrigins={region.frameOrigins}
      />,
    );
    const links = anchors(html).filter((link) => link.target === "_blank");
    expect(links).toEqual([
      // The link card and "View the original" of the post everyone may see...
      { href: "/out/counted", target: "_blank", rel: "noopener", class: expect.any(String) },
      { href: "/out/counted", target: "_blank", rel: "noopener", class: expect.any(String) },
      // ...and of the one only its sharer sees, straight to the original.
      {
        href: "https://example.com",
        target: "_blank",
        rel: "noopener noreferrer nofollow",
        class: expect.any(String),
      },
      {
        href: "https://example.com",
        target: "_blank",
        rel: "noopener noreferrer nofollow",
        class: expect.any(String),
      },
    ]);
    expect(html).toContain(placeUiMessages.en.viewOriginal);
  });
});

describe("the visits Noren sent, on the sharer's own page", () => {
  const home = [...loadRegions().values()][0]!;
  const post = (fields: Partial<SharedPostLike>): SharedPostLike => ({
    sourceId: "post",
    placeSlug: "mock-cafe",
    placeNames: [
      { lang: "ja", script: "kanji", value: "猫のカフェ", isPrimary: true },
      { lang: "en", script: "latin", value: "Cat cafe", isPrimary: true },
    ],
    platform: "instagram",
    note: "保護猫が新しい家族を待っています。",
    noteLang: "ja",
    status: "live",
    shownToEveryone: true,
    visits: 12,
    recentVisits: 4,
    ...fields,
  });
  const render = (locale: "en" | "ja", shared?: SharedPostLike[], adding = false) =>
    renderToStaticMarkup(
      <CreatorHomeView locale={locale} region={home} places={[]} shared={shared} adding={adding} />,
    );

  it.each(["en", "ja"] as const)(
    "%s shows each post's totals and why one is not counted",
    (locale) => {
      const m = creatorMessages[locale];
      const html = render(locale, [
        post({}),
        post({ sourceId: "one", platform: "web", visits: 1, recentVisits: 1, note: undefined }),
        post({ sourceId: "private", shownToEveryone: false, visits: 0, recentVisits: 0 }),
        post({ sourceId: "gone", status: "gone", shownToEveryone: false }),
        post({ sourceId: "hidden", status: "hidden", shownToEveryone: false }),
      ]);
      expect(html).toMatch(new RegExp(`<h2 id="shared-posts"[^>]*>${m.sharedPosts}</h2>`));
      expect(html).toContain(m.visitsNote);
      for (const text of [
        format(m.visits, { n: 12 }),
        format(m.recentVisits, { n: 4 }),
        m.visitsOne,
        format(m.visits, { n: 0 }),
        "Instagram",
        m.linkedPage,
        m.notShown,
        m.originalGone,
        m.removedPost,
        `href="/${locale}/places/mock-cafe"`,
        '<p lang="ja"',
      ])
        expect(html).toContain(text);
      expect(html).toContain(locale === "ja" ? "猫のカフェ" : "Cat cafe");
      // English says "1 visit"; Japanese has one form for every count.
      if (locale === "en") expect(html).not.toContain(format(m.visits, { n: 1 }));
      // A live post everyone may see has no state label.
      expect(html.match(/rounded-full bg-kamenozoki/g)).toHaveLength(3);
    },
  );

  it("says when it lists only the newest posts", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, n) => post({ sourceId: `post-${n}` }));
    const note = format(creatorMessages.en.newestPosts, { n: SHARED_POSTS_LISTED });
    expect(render("en", many(SHARED_POSTS_LISTED))).toContain(note);
    expect(render("en", many(SHARED_POSTS_LISTED - 1))).not.toContain(note);
  });

  it("is left out when the member has shared nothing, or while adding a place", () => {
    for (const html of [render("en"), render("en", []), render("en", [post({})], true)])
      expect(html).not.toContain('id="shared-posts"');
  });
});
