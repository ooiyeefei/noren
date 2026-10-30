import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StoryView } from "@/components/story/story-view";
import { disputedPairs, footnoteOrder, sentencesFor } from "@/components/story/group";
import type { StoryClaimView, StorySentenceView, StoryViewModel } from "@/components/story/types";
import { storyMessages } from "@/lib/i18n/messages/story";
import region from "../../regions/nagasaki.json";

const confirmedAt = Date.UTC(2026, 8, 12);
function claim(id: string, patch: Partial<StoryClaimView> = {}): StoryClaimView {
  return {
    id,
    kind: "story",
    textOriginal: `架空の証言 ${id}`,
    langOriginal: "ja",
    origin: "interview",
    status: "published",
    quote: `架空の引用 ${id}`,
    confirmedAt,
    aiAssisted: false,
    isMock: true,
    translations: [],
    ...patch,
  };
}
function sentence(id: string, patch: Partial<StorySentenceView> = {}): StorySentenceView {
  return {
    lang: "en",
    ordinal: 0,
    text: `Fictional account ${id}.`,
    textLang: "en",
    translation: "human",
    claimIds: [id],
    ...patch,
  };
}
function model(patch: Partial<StoryViewModel> = {}): StoryViewModel {
  return {
    locale: "en",
    placeName: "Fictional Demo Workshop",
    version: 1,
    composedAt: confirmedAt,
    aiComposed: false,
    sentences: [sentence("a")],
    claims: [claim("a")],
    cautionLabels: {},
    ...patch,
  };
}
const render = (story = model()) => renderToStaticMarkup(<StoryView story={story} />);

it("every shown sentence links to a footnote that exists", () => {
  const html = render(
    model({
      sentences: [sentence("a"), sentence("b", { ordinal: 1, claimIds: ["a", "b"] })],
      claims: [claim("a"), claim("b")],
    }),
  );
  const links = [...html.matchAll(/href="#fn-([^"]+)"/g)];
  expect(links).toHaveLength(3);
  for (const [, id] of links) expect(html).toContain(`id="fn-${id}"`);
  expect(html).toContain('href="#ref-en-0-a"');
  expect(html).not.toContain('href="#ref-en-1-a"');
});
it("only the page locale's sentences are shown, in ordinal order", () => {
  const story = model({
    sentences: [
      sentence("b", { ordinal: 3 }),
      sentence("a", { ordinal: 1 }),
      sentence("a", { lang: "ja", text: "非表示の架空文" }),
    ],
    claims: [claim("a"), claim("b")],
  });
  const html = render(story);
  expect(html.indexOf("Fictional account a.")).toBeLessThan(html.indexOf("Fictional account b."));
  expect(html).not.toContain("非表示の架空文");
  expect(sentencesFor(story).map((item) => item.ordinal)).toEqual([1, 3]);
});
it("a machine-translated sentence shows the badge and the original in a details element with its lang", () => {
  const html = render(model({ sentences: [sentence("a", { translation: "machine" })] }));
  expect(html).toContain('data-badge="machine-translation"');
  expect(html).toMatch(
    /<details><summary[^>]*>Show original<\/summary><p[^>]*lang="ja"[^>]*>架空の証言 a<\/p><\/details>/,
  );
});
it("a human translation shows the original without the machine badge", () => {
  const html = render();
  expect(html).toContain("<details>");
  expect(html).toContain('lang="ja"');
  expect(html).not.toContain('data-badge="machine-translation"');
});
it("a sentence without a translation shows translation pending", () => {
  const html = render(
    model({
      sentences: [sentence("a", { text: "架空の原文", textLang: "ja", translation: "original" })],
    }),
  );
  expect(html).toContain('data-badge="translation-pending"');
  expect(html).not.toContain("<details>");
});
it("an interview footnote shows the quote and the confirmation date; an open-text footnote shows attribution, licence and a link", () => {
  for (const locale of ["en", "ja"] as const) {
    const html = render(
      model({
        locale,
        sentences: [sentence("a", { lang: locale }), sentence("b", { lang: locale, ordinal: 1 })],
        claims: [
          claim("a"),
          claim("b", {
            origin: "open_text",
            openText: {
              sourceUrl: "https://example.org/fiction",
              attribution: "Fictional Demo Archive",
              licence: "CC-BY-4.0",
              revisionRef: "demo-v1",
            },
          }),
        ],
      }),
    );
    expect(html).toContain('<blockquote lang="ja"');
    expect(html).toContain("架空の引用 a");
    expect(html).toContain(
      new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(confirmedAt),
    );
    expect(html).toContain("Fictional Demo Archive");
    expect(html).toContain("CC-BY-4.0");
    expect(html).toContain('href="https://example.org/fiction" rel="noopener noreferrer"');
    expect(html).toContain("demo-v1");
  }
});
it("AI-assisted claims and an AI-composed page show the AI-assisted label", () => {
  expect(
    render(model({ aiComposed: true, claims: [claim("a", { aiAssisted: true })] })).match(
      /data-badge="ai-assisted"/g,
    ),
  ).toHaveLength(2);
});
it("mock content shows the Demo badge", () => {
  const html = render();
  expect(html.match(/data-badge="demo"/g)).toHaveLength(2);
  expect(html.slice(0, html.indexOf("</header>"))).toContain('data-badge="demo"');
});
it("two disputed claims are both shown under accounts differ, each once", () => {
  const html = render(
    model({
      sentences: [sentence("b")],
      claims: [
        claim("a", { status: "disputed", disputedWith: "b" }),
        claim("b", { status: "disputed", disputedWith: "a" }),
      ],
    }),
  );
  const section = html.match(/<section id="disputed"[\s\S]*?<\/section>/)?.[0] ?? "";
  expect(section).toContain("Two accounts of this differ. Both are shown.");
  for (const id of ["a", "b"]) {
    expect(section.split(`架空の証言 ${id}`)).toHaveLength(2);
    expect(html).toContain(`id="fn-${id}"`);
  }
  expect(section.indexOf("架空の証言 b")).toBeLessThan(section.indexOf("架空の証言 a"));
  expect(section).toMatch(/href="#fn-b"[^>]*>1<\/a>/);
  expect(section).toMatch(/href="#fn-a"[^>]*>2<\/a>/);
  expect(html).toContain('href="#disputed-ref-a"');
});
it("cautions use the region labels and show unreviewed when not reviewed", () => {
  const labels = Object.fromEntries(
    region.cautionVocabulary.map((item) => [
      item.key,
      { label: item.labels.en, reviewed: item.labelsReviewedBy !== null },
    ]),
  );
  const html = render(
    model({
      claims: [
        claim("a"),
        claim("c", { kind: "caution", cautionType: "cash_only" }),
        claim("d", { kind: "caution", cautionType: "fictional_key" }),
      ],
      cautionLabels: labels,
    }),
  );
  expect(html).toContain("Cash only");
  expect(html).toContain("fictional_key");
  expect(html.match(/data-badge="unreviewed"/g)).toHaveLength(2);
  expect(html).toContain('href="#caution-ref-c"');
  const reviewed = render(
    model({
      claims: [claim("c", { kind: "caution", cautionType: "cash_only" })],
      sentences: [],
      cautionLabels: { cash_only: { label: "Cash only", reviewed: true } },
    }),
  );
  expect(reviewed).not.toContain('data-badge="unreviewed"');
});
it("no rating, star, score or sentiment wording or class appears", () => {
  expect(render()).not.toMatch(/\b(?:ratings?|stars?|scores?|sentiment)\b/i);
});
it("footnoteOrder numbers by first citation", () => {
  const story = model({
    sentences: [
      sentence("a", { ordinal: 2, claimIds: ["a", "b", "a"] }),
      sentence("b", { ordinal: 1 }),
      sentence("d", { lang: "ja" }),
    ],
    claims: [claim("a"), claim("b"), claim("c", { kind: "caution" }), claim("d")],
  });
  expect(footnoteOrder(story)).toEqual([
    { claimId: "b", number: 1 },
    { claimId: "a", number: 2 },
    { claimId: "c", number: 3 },
  ]);
});
it("disputedPairs returns each pair once", () => {
  const a = claim("a", { status: "disputed", disputedWith: "b" });
  const b = claim("b", { status: "disputed", disputedWith: "a" });
  expect(disputedPairs([a, b])).toEqual([[a, b]]);
  expect(disputedPairs([b, a])).toEqual([[b, a]]);
  expect(disputedPairs([a])).toEqual([]);
  expect(disputedPairs([claim("x", { status: "disputed", disputedWith: "x" })])).toEqual([]);
});
it("story messages have the same keys in both locales", () => {
  expect(Object.keys(storyMessages.en).sort()).toEqual(Object.keys(storyMessages.ja).sort());
  for (const messages of Object.values(storyMessages))
    for (const text of Object.values(messages)) expect(text.trim()).not.toBe("");
});
it("empty or ungrounded sentences show a localised no-story message", () => {
  expect(render(model({ sentences: [] }))).toContain("No story yet.");
  expect(render(model({ locale: "ja", sentences: [] }))).toContain(storyMessages.ja.noStoryYet);
  const html = render(model({ sentences: [sentence("missing"), sentence("a", { claimIds: [] })] }));
  expect(html).not.toContain("Fictional account");
  expect(html).toContain("No story yet.");
});

it("uses the reading type scale and quiet source list without cards", () => {
  const html = render();
  expect(html).toContain('class="font-sans text-[22px] font-bold">Story</h2>');
  expect(html).toContain("text-[18px] leading-[1.8]");
  expect(html).toMatch(/class="text-ai underline[^"]*" href="#fn-a"/);
  expect(html).toContain("text-[15px] leading-relaxed text-muted-foreground");
  expect(html).not.toContain('data-slot="card"');
  expect(html).not.toContain("·");
});

it("sources have one section Demo badge, compact inline back links and preserved quotes in both locales", () => {
  for (const locale of ["en", "ja"] as const) {
    for (const mock of [true, false]) {
      const html = render(
        model({
          locale,
          sentences: ["a", "b", "c"].map((id, ordinal) => sentence(id, { lang: locale, ordinal })),
          claims: [
            claim("a", { isMock: false }),
            claim("b", { isMock: mock }),
            claim("c", { isMock: mock }),
          ],
        }),
      );
      const sources = html.slice(
        html.indexOf(`<section aria-label="${storyMessages[locale].footnotesHeading}"`),
      );
      expect(sources.match(/data-badge="demo"/g) ?? []).toHaveLength(mock ? 1 : 0);
      const list = sources.slice(sources.indexOf("<ol"));
      expect(list).not.toContain('data-badge="demo"');
      expect(list).toContain("space-y-2");
      for (const [index, id] of ["a", "b", "c"].entries()) {
        expect(list).toContain(`id="fn-${id}" value="${index + 1}"`);
        expect(list).toContain(`架空の引用 ${id}`);
        expect(list).toContain(
          `aria-label="${storyMessages[locale].backToReference}" href="#ref-${locale}-${index}-${id}"`,
        );
        expect(html).toContain(`id="ref-${locale}-${index}-${id}"`);
        expect(html).toContain(`href="#fn-${id}"`);
      }
      expect(list).toContain("inline-flex size-11");
      expect(list).not.toContain('class="block');
    }
  }
});
