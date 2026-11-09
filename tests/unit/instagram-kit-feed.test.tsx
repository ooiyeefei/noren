import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StoryFeed, type StoryFeedActions } from "@/components/place/story-feed";
import {
  toStoryFeed,
  type SourceViewLike,
  type WrittenStoryLike,
} from "@/components/public/mapping";
import { region, sources } from "../fixtures/public-ui";

// The kit itself is tested in instagram-kit.test.tsx. Here it is a marker, so the test sees only
// which stories the page asks a kit for. The server decides who is given one.
vi.mock("@/components/share/share-story", () => ({
  ShareStoryConnected: ({ storyId }: { storyId: string }) => `[kit ${storyId}]`,
}));

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
const post = (fields: Partial<SourceViewLike> = {}): SourceViewLike => ({
  ...sources[0]!,
  _id: "post",
  isMock: false,
  sharedBy: "Fictional sharer",
  addedAt: Date.UTC(2026, 9, 1),
  addedByMe: false,
  ...fields,
});
const actions: StoryFeedActions = { remove: async () => null };

function page(
  stories: WrittenStoryLike[],
  posts: SourceViewLike[],
  options: { canShareKit?: boolean; signedIn?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <StoryFeed
      locale="en"
      entries={toStoryFeed(posts, stories, false)}
      scriptOrigins={region.scriptOrigins}
      frameOrigins={region.frameOrigins}
      actions={options.signedIn === false ? undefined : actions}
      canShareKit={options.canShareKit}
    />,
  );
}

describe("which stories ask for an Instagram kit", () => {
  it("asks for the member's own stories", () => {
    const html = page([written({ _id: "mine", addedByMe: true }), written({ _id: "theirs" })], []);
    expect(html).toContain("[kit mine]");
    expect(html).not.toContain("[kit theirs]");
  });

  it("asks for every written story when the viewer runs the place or is a steward", () => {
    const html = page(
      [written({ _id: "one", addedAt: 1 }), written({ _id: "two", authorName: "Another" })],
      [],
      { canShareKit: true },
    );
    expect(html).toContain("[kit one]");
    expect(html).toContain("[kit two]");
  });

  it("asks for none when the viewer is a visitor or another member", () => {
    const html = page([written({ _id: "theirs" })], [], { canShareKit: false });
    expect(html).not.toContain("[kit");
    expect(
      page([written({ _id: "mine", addedByMe: true })], [], { signedIn: false }),
    ).not.toContain("[kit");
  });

  it("never asks for a linked post, nor one found in public words, whoever is looking", () => {
    const found = post({
      _id: "found",
      foundInPublicPost: true,
      foundKind: "story",
      excerpt: "A found sentence.",
      excerptLang: "en",
      addedByMe: true,
    } as Partial<SourceViewLike>);
    const html = page(
      [],
      [found, post({ _id: "mine", addedByMe: true }), post({ _id: "theirs" })],
      {
        canShareKit: true,
      },
    );
    expect(html).not.toContain("[kit");
    // The posts are on the page, so the absence is not an empty page.
    expect(html).toContain("Fictional sharer");
  });
});
