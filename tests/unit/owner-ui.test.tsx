import { renderToStaticMarkup } from "react-dom/server";
import { Children, isValidElement, type ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { OwnerHomeContainer } from "@/components/owner/owner-home-container";
import { OwnerHomeView } from "@/components/owner/owner-home-view";
import { OwnerPlaceContainer } from "@/components/owner/owner-place-container";
import {
  ReviewCard,
  OwnerNotFound,
  OwnerPlaceView,
  WithdrawDialogBody,
  type InterviewLike,
  type OwnerPlaceViewProps,
} from "@/components/owner/owner-place-view";
import type { OwnerClaim, OwnerRegionProps } from "@/components/owner/review";
import { RemoveClaim } from "@/components/owner/remove-claim";
import { Dialog } from "@/components/ui/dialog";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { ownerMessages } from "@/lib/i18n/messages/owner";
import { shellMessages } from "@/lib/i18n/messages/shell";

// Exercise the component's handlers without adding a DOM dependency to the node test project.
// All other renders use real React hooks, including the existing server-markup tests.
const hooks = vi.hoisted(() => ({ active: false, index: 0, values: [] as unknown[] }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useId() {
      return hooks.active ? "mock-review-field" : react.useId();
    },
    useState(initial?: unknown) {
      if (!hooks.active) return react.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [
        hooks.values[index],
        (value: unknown) => {
          hooks.values[index] = value;
        },
      ];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return react.useRef(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = { current: initial };
      return hooks.values[index];
    },
  };
});

// The containers only wire Convex to the views, so Convex is replaced by a table of results.
const convex = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  calls: [] as { name: string; args: unknown }[],
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference);
    convex.calls.push({ name, args });
    return args === "skip" ? undefined : convex.results.get(name);
  },
  useQueries: (
    queries: Record<string, { query: Parameters<typeof getFunctionName>[0]; args: unknown }>,
  ) =>
    Object.fromEntries(
      Object.entries(queries).map(([id, { query, args }]) => {
        const name = getFunctionName(query);
        convex.calls.push({ name, args });
        return [id, convex.results.get(`${name}:${id}`) ?? convex.results.get(name)];
      }),
    ),
  useMutation: () => async () => null,
}));

const region: OwnerRegionProps = {
  locales: ["ja", "en"],
  defaultLocale: "ja",
  nameFallback: { ja: ["kanji", "latin"], en: ["latin", "kanji"] },
  cautionVocabulary: [
    { key: "cash_only", labels: { ja: "現金のみ", en: "Cash only" }, labelsReviewedBy: null },
  ],
};
const place = {
  _id: "mock-place",
  slug: "mock-cafe",
  isMock: true,
  names: [
    { lang: "ja", script: "kanji", value: "架空の喫茶店", isPrimary: true },
    { lang: "en", script: "latin", value: "Mock Cafe", isPrimary: true },
  ],
} as const;
const interview: InterviewLike = {
  _id: "mock-interview",
  language: "ja",
  status: "owner_review",
  isMock: true,
  createdAt: Date.UTC(2026, 9, 29),
};

function claim(id: string, overrides: Partial<OwnerClaim> = {}): OwnerClaim {
  return {
    _id: id,
    kind: "story",
    textOriginal: `架空の店主は毎朝パンを焼きます（${id}）`,
    langOriginal: "ja",
    origin: "interview",
    quote: `毎朝パンを焼いています（${id}）`,
    spanStart: 0,
    sourceTranscriptId: "mock-transcript",
    status: "proposed",
    aiAssisted: true,
    isMock: true,
    translations: [],
    ...overrides,
  };
}

const noop = async () => {};
function props(
  claims: readonly OwnerClaim[],
  options: { locale?: Locale; interviews?: readonly InterviewLike[] } = {},
): OwnerPlaceViewProps {
  return {
    locale: options.locale ?? "ja",
    region,
    place,
    claims,
    interviews: options.interviews ?? [interview],
    onConfirm: noop,
    onEdit: noop,
    onRemove: noop,
    onTranslate: async () => ({ pending: 0 }),
    onWithdraw: noop,
  };
}
const view = (...args: Parameters<typeof props>) =>
  renderToStaticMarkup(<OwnerPlaceView {...props(...args)} />);
const count = (html: string, text: string) => html.split(`>${text}<`).length - 1;

describe("owner place view", () => {
  it("the place view in ja shows each proposed claim with its quote and three actions", () => {
    const first = claim("one");
    const second = claim("two", { kind: "caution", cautionType: "cash_only", aiAssisted: false });
    const html = view([first, second]);
    for (const shown of [first, second]) {
      expect(html).toContain(shown.textOriginal);
      expect(html).toContain(
        `<blockquote lang="ja" class="border-l-2 border-line pl-3 whitespace-pre-wrap text-muted-foreground">${shown.quote}</blockquote>`,
      );
    }
    expect(html).toContain("お話しいただいた内容");
    expect(html).toContain("現金のみ");
    // Two cards, so each of the three actions appears twice.
    expect(count(html, "確認する")).toBe(2);
    expect(count(html, "修正する")).toBe(2);
    expect(count(html, "削除する")).toBe(2);
    expect(html).toContain("確認をお願いします");
    expect(html).toContain("架空の喫茶店");
    expect(html).toContain('data-badge="ai-assisted"');
    // The caution's label is not yet reviewed by a Japanese speaker, and it says so.
    expect(html).toContain('data-badge="unreviewed"');
  });

  it("shows the same claims in English with the original text still tagged ja", () => {
    const html = view([claim("one")], { locale: "en" });
    expect(count(html, "Confirm")).toBe(1);
    expect(count(html, "Edit")).toBe(1);
    expect(count(html, "Remove")).toBe(1);
    expect(html).toContain(
      '<p lang="ja" class="whitespace-pre-wrap">架空の店主は毎朝パンを焼きます（one）</p>',
    );
    expect(html).toContain("Mock Cafe");
  });

  it("published machine translations carry the machine label and the original text with its lang attribute", () => {
    const html = view([
      claim("published", {
        status: "published",
        translations: [
          { lang: "en", text: "The mock owner bakes bread every morning.", origin: "machine" },
        ],
      }),
      claim("checked", {
        status: "published",
        translations: [
          {
            lang: "en",
            text: "A checked English sentence.",
            origin: "human",
            reviewedBy: "Mock Reviewer",
          },
        ],
      }),
    ]);
    expect(html).toContain('data-badge="machine-translation"');
    expect(html.match(/data-badge="machine-translation"/g)).toHaveLength(1);
    expect(html).toContain(
      '<p lang="ja" class="whitespace-pre-wrap">架空の店主は毎朝パンを焼きます（published）</p>',
    );
    expect(html).toContain(
      '<p lang="en" class="whitespace-pre-wrap">The mock owner bakes bread every morning.</p>',
    );
    expect(html).toContain("Mock Reviewerが確認済み");
    expect(html).toContain("掲載中");
    // Published text is read-only, but each statement can be removed.
    expect(count(html, "確認する")).toBe(0);
    expect(count(html, "修正する")).toBe(0);
    expect(count(html, "削除する")).toBe(2);
  });

  it("a confirmed claim without a translation shows pending and offers the translate button", () => {
    const html = view([claim("confirmed", { status: "owner_confirmed" })]);
    expect(html).toContain('data-badge="translation-pending"');
    expect(html).toContain("確認済みの内容を翻訳する");
    expect(view([claim("none", { status: "proposed" })])).not.toContain("確認済みの内容を翻訳する");
  });

  it("open-text claims show licence and no buttons", () => {
    const html = view(
      [
        claim("open", {
          origin: "open_text",
          status: "published",
          quote: "公開資料の一文",
          isMock: false,
          aiAssisted: false,
          sourceTranscriptId: undefined,
          openText: {
            sourceUrl: "https://example.invalid/open-text",
            attribution: "架空の公開資料",
            licence: "CC-BY-4.0",
            revisionRef: "rev-1",
          },
        }),
        claim("open-proposed", { origin: "open_text", status: "proposed", isMock: false }),
      ],
      { interviews: [] },
    );
    expect(html).toContain("CC-BY-4.0");
    expect(html).toContain('href="https://example.invalid/open-text"');
    expect(html).toContain("架空の公開資料");
    expect(html).toContain("rev-1");
    expect(html).not.toContain("<button");
  });

  it("an open-text source that is not https is shown as text, not a link", () => {
    const html = view(
      [
        claim("open", {
          origin: "open_text",
          status: "published",
          openText: {
            sourceUrl: "javascript:alert(1)",
            attribution: "架空の公開資料",
            licence: "CC0",
          },
        }),
      ],
      { interviews: [] },
    );
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("CC0");
  });

  it("lists each interview with its date, language and status, and withdraws only live ones", () => {
    const html = view([], {
      interviews: [interview, { ...interview, _id: "gone", status: "withdrawn", isMock: false }],
    });
    expect(html).toContain("2026/10/29のインタビュー");
    expect(html).toContain("言語：日本語");
    expect(html).toContain("確認をお待ちしています");
    expect(html).toContain("取り下げ済み");
    expect(count(html, "このインタビューを取り下げる")).toBe(1);
    expect(html.match(/data-badge="demo"/g)).toHaveLength(2);
  });

  it("an unknown place and one that is not the viewer's show the shell's not-found text", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const html = renderToStaticMarkup(<OwnerPlaceView {...props([], { locale })} place={null} />);
      expect(html).toContain(shellMessages[locale].notFoundTitle);
      expect(html).toContain(shellMessages[locale].notFoundBody);
      expect(html).toBe(renderToStaticMarkup(<OwnerNotFound locale={locale} />));
      expect(html).toContain(`href="/${locale}/owner"`);
    }
  });
});

function removalSession(
  shown: OwnerClaim,
  locale: Locale = "en",
  onRemove = vi.fn<(id: string) => Promise<void>>(async () => {}),
) {
  hooks.values = [];
  const render = () => {
    hooks.index = 0;
    hooks.active = true;
    try {
      return RemoveClaim({ locale, claim: shown, onRemove });
    } finally {
      hooks.active = false;
    }
  };
  const click = async (label: string) => {
    let handler: (() => void | Promise<void>) | undefined;
    const visit = (node: ReactNode) => {
      Children.forEach(node, (child) => {
        if (!isValidElement<{ children?: ReactNode; onClick?: () => void | Promise<void> }>(child))
          return;
        if (child.props.children === label) handler = child.props.onClick;
        visit(child.props.children);
      });
    };
    visit(render());
    expect(handler, `control ${label}`).toBeTypeOf("function");
    await handler!();
  };
  return { render, click, onRemove, html: () => renderToStaticMarkup(render()) };
}

function reviewSession(
  onConfirm = vi.fn(async () => {}),
  onEdit = vi.fn<(id: string, text: string) => Promise<void>>(async () => {}),
  onRemove = vi.fn(async () => {}),
) {
  hooks.values = [];
  const render = () => {
    hooks.index = 0;
    hooks.active = true;
    try {
      return ReviewCard({
        locale: "en",
        region,
        claim: claim("review"),
        onConfirm,
        onEdit,
        onRemove,
      });
    } finally {
      hooks.active = false;
    }
  };
  const click = async (label: string) => {
    let handler: (() => void | Promise<void>) | undefined;
    const visit = (node: ReactNode) =>
      Children.forEach(node, (child) => {
        if (
          !isValidElement<{
            children?: ReactNode;
            onClick?: () => void | Promise<void>;
            open?: boolean;
          }>(child)
        )
          return;
        if (child.type === Dialog && !child.props.open) return;
        if (child.props.children === label) handler = child.props.onClick;
        visit(child.props.children);
      });
    visit(render());
    expect(handler, label).toBeTypeOf("function");
    await handler!();
    // Event handlers deliberately discard the promise; settle its mutation and finally block.
    await Promise.resolve();
    await Promise.resolve();
  };
  return { render, click, onConfirm, onEdit, onRemove };
}

describe("owner review actions", () => {
  it("confirm sends the statement id, while editing saves its original text", async () => {
    const session = reviewSession();
    await session.click("Confirm");
    expect(session.onConfirm).toHaveBeenCalledExactlyOnceWith("review");
    await session.click("Edit");
    await session.click("Save");
    expect(session.onEdit).toHaveBeenCalledExactlyOnceWith("review", claim("review").textOriginal);
  });

  it("the proposed statement removal retains the dialog wording and needs confirmation", async () => {
    const session = reviewSession();
    await session.click("Remove");
    expect(session.onRemove).not.toHaveBeenCalled();
    expect(JSON.stringify(session.render())).toContain('"open":true');
    expect(JSON.stringify(session.render())).toContain("Remove this statement?");
    await session.click("Cancel");
    expect(session.onRemove).not.toHaveBeenCalled();
    await session.click("Remove");
    await session.click("Remove");
    expect(session.onRemove).toHaveBeenCalledExactlyOnceWith("review");
  });

  it("failed confirmation shows an alert and permits retry", async () => {
    const confirm = vi.fn(async () => {
      throw new Error("Unable to confirm");
    });
    const session = reviewSession(confirm);
    await session.click("Confirm");
    expect(renderToStaticMarkup(session.render())).toContain('role="alert"');
    await session.click("Confirm");
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});

describe("owner removal", () => {
  it.each(["owner_confirmed", "published", "disputed"] as const)(
    "%s has a remove control and read-only text",
    (status) => {
      const html = view([claim("visible", { status })], { locale: "en", interviews: [] });
      expect(count(html, "Remove")).toBe(1);
      expect(count(html, "Edit")).toBe(0);
      expect(count(html, "Confirm")).toBe(0);
    },
  );

  it("a hidden claim has no remove control", () => {
    const hidden = claim("hidden", { status: "hidden" });
    expect(view([hidden], { interviews: [] })).not.toContain(hidden.textOriginal);
    expect(removalSession(hidden).render()).toBeNull();
  });

  it("remove needs a second click: nothing is sent on the first", async () => {
    const session = removalSession(claim("published", { status: "published" }));
    await session.click("Remove");
    expect(session.onRemove).not.toHaveBeenCalled();
    expect(session.html()).toContain(ownerMessages.en.removePageEffect);
    await session.click("Confirm removal");
    expect(session.onRemove).toHaveBeenCalledExactlyOnceWith("published");
  });

  it("cancel sends nothing and closes the confirmation", async () => {
    const session = removalSession(claim("published", { status: "published" }));
    await session.click("Remove");
    await session.click("Cancel");
    expect(session.onRemove).not.toHaveBeenCalled();
    expect(session.html()).not.toContain(ownerMessages.en.removePageEffect);
  });

  it("a failed removal keeps the claim visible and shows a non-empty message", async () => {
    const shown = claim("published", { status: "published" });
    const onRemove = vi.fn<(id: string) => Promise<void>>(async () => {
      throw new Error("");
    });
    const session = removalSession(shown, "en", onRemove);
    await session.click("Remove");
    await session.click("Confirm removal");
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(shown._id);
    expect(session.html()).toMatch(/role="alert"[^>]*>[^<\s][^<]+</);
    expect(session.html()).toContain(ownerMessages.en.removeConfirm);
    expect(view([shown])).toContain(shown.textOriginal);
  });

  it("the confirmation text names the immediate page effect, in ja and en", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const session = removalSession(claim("published", { status: "published" }), locale);
      await session.click(ownerMessages[locale].remove);
      expect(session.html()).toContain(ownerMessages[locale].removePageEffect);
      expect(session.html()).not.toContain(ownerMessages[locale].removeDisputedEffect);
    }
    expect(ownerMessages.en.removePageEffect).toMatch(/immediately.*every sentence.*cites/);
    expect(ownerMessages.ja.removePageEffect).toMatch(/引用.*すぐに非表示/);
  });

  it("removing a disputed claim says the other account stays", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const session = removalSession(claim("disputed", { status: "disputed" }), locale);
      await session.click(ownerMessages[locale].remove);
      expect(session.html()).toContain(ownerMessages[locale].removeDisputedEffect);
      await session.click(ownerMessages[locale].removeConfirm);
      expect(session.onRemove).toHaveBeenCalledExactlyOnceWith("disputed");
    }
  });
});

describe("withdraw dialog", () => {
  it("the withdraw dialog text lists what will disappear", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const m = ownerMessages[locale];
      const html = renderToStaticMarkup(
        <Dialog open>
          <WithdrawDialogBody
            locale={locale}
            pending={false}
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </Dialog>,
      );
      const text = html.replaceAll("&#x27;", "'");
      for (const line of [
        m.withdrawTitle,
        m.withdrawIntro,
        m.withdrawRecording,
        m.withdrawTranscript,
        m.withdrawClaims,
        m.withdrawSentences,
        m.withdrawIrreversible,
        m.withdrawConfirm,
        m.cancel,
      ]) {
        expect(text).toContain(line);
      }
      expect(html.match(/<li>/g)).toHaveLength(4);
    }
  });

  it("shows the reason a withdrawal failed and disables the buttons while it runs", () => {
    const html = renderToStaticMarkup(
      <Dialog open>
        <WithdrawDialogBody
          locale="en"
          pending
          error="You do not have permission to do this."
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </Dialog>,
    );
    expect(html).toMatch(/role="alert"[^>]*>You do not have permission to do this\./);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain(ownerMessages.en.withdrawing);
  });
});

describe("owner home view", () => {
  it("the home view's empty state explains how a place gets linked", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const html = renderToStaticMarkup(<OwnerHomeView locale={locale} items={[]} />);
      expect(html).toContain(ownerMessages[locale].homeEmpty);
      expect(html).toContain(`href="/${locale}/notice"`);
      expect(html).toContain(ownerMessages[locale].noticeLink);
      expect(html).not.toContain("/takedown");
      expect(html).toMatch(/<details[^>]*open=""/);
      for (const key of ["stepsTitle", "stepLink", "stepRead", "stepReview"] as const)
        expect(html).toContain(ownerMessages[locale][key]);
    }
    expect(ownerMessages.ja.homeEmpty).toContain("担当者");
    expect(ownerMessages.en.homeEmpty).toContain("steward will check it is yours");
  });

  it("lists each place with a link, the Demo badge for a mock place and a status", () => {
    const html = renderToStaticMarkup(
      <OwnerHomeView
        locale="ja"
        items={[
          {
            id: "a",
            href: "/ja/owner/a",
            name: "架空の喫茶店",
            lang: "ja",
            isMock: true,
            needsReview: true,
            status: <span>確認待ち 2 件</span>,
          },
          {
            id: "b",
            href: "/ja/owner/b",
            name: "Real Place",
            lang: "en",
            isMock: false,
            needsReview: false,
          },
        ]}
      />,
    );
    expect(html).toContain('<strong lang="ja"');
    expect(html).toContain('href="/ja/owner/a"');
    expect(html).not.toMatch(/<details[^>]*open=/);
    expect(html.match(/>内容を確認する<\/a>/g)).toHaveLength(1);
    expect(html).toContain(">内容を見る</a>");
    expect(html).toContain("確認待ち 2 件");
    expect(html.match(/data-badge="demo"/g)).toHaveLength(1);
  });
});

describe("owner phone review", () => {
  it.each(SUPPORTED_LOCALES)(
    "%s shows large named review and remove actions, and publication guidance",
    (locale) => {
      const html = view([claim("one")], { locale, interviews: [] });
      expect(html.split(ownerMessages[locale].publicationNote)).toHaveLength(2);
      expect(ownerMessages[locale].toReviewIntro).not.toMatch(
        /Nothing is published|掲載されません/,
      );
      const labels = locale === "ja" ? ["確認する", "削除する"] : ["Confirm", "Remove"];
      for (const label of labels) {
        const button = html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];
        expect(button).toContain("min-h-11");
        expect(button).toContain("rounded-[10px]");
      }
      expect(html).toContain("grid-cols-2");
      expect(html).toContain("max-[359px]:grid-cols-1");
      expect(html).toContain("border-beni");
      expect(html).toContain("rounded-[14px]");
      expect(html).toContain("border-line");
      const home = renderToStaticMarkup(
        <OwnerHomeView
          locale={locale}
          items={[
            {
              id: "one",
              href: `/${locale}/owner/one`,
              name: "架空のお店",
              lang: "ja",
              isMock: true,
              needsReview: true,
            },
          ]}
        />,
      );
      expect(home).toMatch(
        new RegExp(`<a[^>]*min-h-11[^>]*>${ownerMessages[locale].reviewButton}</a>`),
      );
    },
  );

  it("Japanese precedes the English original, with the quote before remaining translation text", () => {
    for (const status of ["proposed", "owner_confirmed", "published"] as const) {
      const html = view([
        claim("translated", {
          status,
          textOriginal: "Mock English statement",
          langOriginal: "en",
          quote: "Mock English quote",
          translations: [{ lang: "ja", text: "架空の日本語の文", origin: "machine" }],
        }),
      ]);
      expect(html.indexOf("架空の日本語の文")).toBeLessThan(html.indexOf("Mock English quote"));
      expect(html.indexOf("Mock English quote")).toBeLessThan(
        html.indexOf("Mock English statement"),
      );
      expect(html).toContain('data-badge="machine-translation"');
      expect(html).toContain('lang="en"');
    }
  });

  it("Japanese statements come before their quote, translation, badges and actions", () => {
    const shown = claim("ordered", {
      translations: [{ lang: "en", text: "Mock translated statement", origin: "machine" }],
    });
    const html = view([shown]);
    const ordered = [
      shown.textOriginal,
      shown.quote!,
      "Mock translated statement",
      'data-badge="ai-assisted"',
      ">確認する</button>",
    ];
    for (let i = 1; i < ordered.length; i++)
      expect(html.indexOf(ordered[i - 1]!)).toBeLessThan(html.indexOf(ordered[i]!));
  });

  it("the container selects the Japanese shop name and renders review counts in both languages", () => {
    for (const locale of SUPPORTED_LOCALES) {
      convex.results.clear();
      convex.results.set("places:listOwned", [place]);
      convex.results.set("claims:listForPlace", [
        claim("one"),
        claim("two"),
        claim("three"),
        claim("published", { status: "published" }),
      ]);
      const html = renderToStaticMarkup(<OwnerHomeContainer locale={locale} region={region} />);
      expect(html).toContain(locale === "ja" ? "確認待ち 3 件" : "3 statements to review");
      expect(html).toContain(locale === "ja" ? "架空の喫茶店" : "Mock Cafe");
      expect(html).not.toMatch(/<details[^>]*open=/);
    }
  });
});

describe("product rules", () => {
  it("no rating, score or star words in either language", () => {
    const banned = /\b(?:rating|score|star|sentiment)s?\b|評価|点数|スコア|星|[★☆]|感情分析/i;
    for (const locale of SUPPORTED_LOCALES) {
      const everything = [
        view(
          [
            claim("a"),
            claim("b", { status: "owner_confirmed" }),
            claim("c", {
              status: "published",
              translations: [{ lang: "en", text: "Words.", origin: "machine" }],
            }),
          ],
          { locale },
        ),
        renderToStaticMarkup(<OwnerHomeView locale={locale} items={[]} />),
        renderToStaticMarkup(
          <Dialog open>
            <WithdrawDialogBody
              locale={locale}
              pending={false}
              onConfirm={() => {}}
              onCancel={() => {}}
            />
          </Dialog>,
        ),
        Object.values(ownerMessages[locale]).join("\n"),
      ].join("\n");
      expect(everything).not.toMatch(banned);
    }
  });

  it("both languages define every owner message", () => {
    expect(Object.keys(ownerMessages.ja).sort()).toEqual(Object.keys(ownerMessages.en).sort());
  });
});

describe("containers", () => {
  const params = (placeId: string) =>
    Object.assign(Promise.resolve({ lang: "ja", placeId }), {
      status: "fulfilled" as const,
      value: { lang: "ja", placeId },
    });
  const renderPlace = (results: Record<string, unknown>) => {
    convex.results.clear();
    convex.calls.length = 0;
    // The container first checks the URL ID's shape; a well-formed ID normalizes to itself.
    convex.results.set("ids:normalize", "mock-place");
    for (const [name, value] of Object.entries(results)) convex.results.set(name, value);
    return renderToStaticMarkup(
      <OwnerPlaceContainer params={params("mock-place")} locale="ja" region={region} />,
    );
  };
  const claimsArgs = () => convex.calls.filter(({ name }) => name === "claims:listForPlace");
  const notFound = shellMessages.ja.notFoundTitle;

  it("a place that is missing or not the viewer's shows not found and never asks for its claims", () => {
    for (const found of [null, { ...place, isOwner: false }]) {
      const html = renderPlace({ "places:get": found });
      expect(html).toContain(notFound);
      expect(claimsArgs().every(({ args }) => args === "skip")).toBe(true);
      expect(convex.calls.filter(({ name }) => name === "interviews:listForPlace")).toSatisfy(
        (calls: { args: unknown }[]) => calls.every(({ args }) => args === "skip"),
      );
    }
  });

  it("an owner sees the claims, and an open-text claim gets its licence from the published page", () => {
    const html = renderPlace({
      "places:get": { ...place, isOwner: true },
      "claims:listForPlace": [
        claim("proposed"),
        claim("open", { origin: "open_text", status: "published", sourceTranscriptId: undefined }),
      ],
      "interviews:listForPlace": [interview],
      "pages:getPublished": {
        claims: [
          {
            _id: "open",
            openText: {
              sourceUrl: "https://example.invalid/open",
              attribution: "架空の公開資料",
              licence: "CC0",
            },
          },
        ],
      },
    });
    expect(html).not.toContain(notFound);
    expect(html).toContain("架空の店主は毎朝パンを焼きます（proposed）");
    expect(html).toContain("CC0");
    expect(html).toContain("架空の公開資料");
    expect(claimsArgs().at(-1)?.args).toEqual({ placeId: "mock-place" });
  });

  it("without an open-text claim the published page is not requested", () => {
    renderPlace({
      "places:get": { ...place, isOwner: true },
      "claims:listForPlace": [claim("proposed")],
      "interviews:listForPlace": [],
    });
    const pages = convex.calls.filter(({ name }) => name === "pages:getPublished");
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every(({ args }) => args === "skip")).toBe(true);
  });

  it("the home list links each place and counts what waits for review", () => {
    convex.results.clear();
    convex.results.set("places:listOwned", [place]);
    convex.results.set("claims:listForPlace", [
      claim("one"),
      claim("two"),
      claim("three", { status: "published" }),
    ]);
    const html = renderToStaticMarkup(<OwnerHomeContainer locale="ja" region={region} />);
    expect(html).toContain('href="/ja/owner/mock-place"');
    expect(html).toContain("架空の喫茶店");
    expect(html).toContain("確認待ち 2 件");
  });
});

it.each(SUPPORTED_LOCALES)(
  "%s changes owner action words and style with the review count",
  (locale) => {
    for (const needsReview of [true, false]) {
      const html = renderToStaticMarkup(
        <OwnerHomeView
          locale={locale}
          items={[
            {
              id: "mock-place",
              href: `/${locale}/owner/mock-place`,
              name: "Mock shop",
              lang: "en",
              isMock: true,
              needsReview,
            },
          ]}
        />,
      );
      const action = html.match(
        new RegExp(`<a[^>]*href="/${locale}/owner/mock-place"[^>]*>[^]*?</a>`),
      )?.[0];
      expect(action).toContain(
        needsReview ? ownerMessages[locale].reviewButton : ownerMessages[locale].seeStatements,
      );
      expect(action).toContain("min-h-11");
      expect(action?.includes("bg-kon")).toBe(needsReview);
      expect(action?.includes("text-white")).toBe(needsReview);
      expect(action?.includes("border-input")).toBe(!needsReview);
    }
    expect(ownerMessages.en.seeStatements).toBe("See your statements");
    expect(ownerMessages.ja.seeStatements).toBe("内容を見る");
  },
);

it("the container derives each shop's action from its own review count and tolerates unavailable counts", () => {
  convex.results.clear();
  convex.results.set("places:listOwned", [place, { ...place, _id: "mock-second" }]);
  convex.results.set("claims:listForPlace:mock-place", [claim("pending")]);
  for (const claims of [
    [],
    [claim("published", { status: "published" })],
    undefined,
    new Error("unavailable"),
  ]) {
    convex.results.set("claims:listForPlace:mock-second", claims);
    const html = renderToStaticMarkup(<OwnerHomeContainer locale="en" region={region} />);
    expect(html).toMatch(/href="\/en\/owner\/mock-place"[^>]*bg-kon[^>]*>Review statements<\/a>/);
    expect(html).toMatch(
      /href="\/en\/owner\/mock-second"[^>]*border-input[^>]*>See your statements<\/a>/,
    );
    expect(html.includes(ownerMessages.en.nothingToReview)).toBe(Array.isArray(claims));
  }
});
