import { ConvexError } from "convex/values";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  accountInitials,
  AccountMenuView,
  type AccountState,
} from "@/components/layout/account-menu";
import { errorText } from "@/components/layout/error-text";
import { LanguageSwitcherView } from "@/components/layout/language-switcher";
import { PageContainer } from "@/components/layout/page-container";
import { RequireRoleView } from "@/components/layout/require-role";
import { SiteFooter } from "@/components/layout/site-footer";
import { NorenMark } from "@/components/layout/noren-mark";
import { SiteHeader } from "@/components/layout/site-header";
import type { Role } from "@/lib/domain/constants";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { ERROR_STATUS } from "../../convex/lib/errors";

// Open menus and inline only the portal for static markup assertions. The real
// Radix content, items and trigger still render; browser focus is owned by Radix.
const menu = vi.hoisted(() => ({ open: true }));
const navigation = vi.hoisted(() => ({ pathname: "/ja" }));
const headerAccount = vi.hoisted(() => ({ state: { kind: "signedOut" } as AccountState }));
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

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isLoading: headerAccount.state.kind === "loading",
    isAuthenticated:
      headerAccount.state.kind === "signedIn" || headerAccount.state.kind === "settingUp",
  }),
  useQuery: () => (headerAccount.state.kind === "signedIn" ? headerAccount.state : null),
  useMutation: () => vi.fn(),
}));

const signedIn = (role: Role, isMock = false): AccountState => ({
  kind: "signedIn",
  displayName: "Demo person",
  role,
  isMock,
});
const account = (role: Role, isMock = false, locale: Locale = "en") =>
  render(
    <AccountMenuView
      locale={locale}
      state={signedIn(role, isMock)}
      signOut={<button>Sign out</button>}
    />,
  );

it("the header has a skip link to #main, the product name linking to /ja, and both languages", () => {
  const html = render(<SiteHeader locale="ja" regionName="長崎" locales={SUPPORTED_LOCALES} />);
  expect(html).toContain('href="#main"');
  expect(html.match(/<(?:a|button)\b[^>]*>/g)?.[0]).toContain('href="#main"');
  expect(html).toMatch(
    /href="\/ja"><svg[^]*?aria-hidden="true"[^]*?<\/svg><span class="max-\[379px\]:sr-only">Noren<\/span><\/a>/,
  );
  expect(html).toContain("長崎");
  expect(html).toContain("日本語");
  expect(html).toContain("English");
});

it("the language switcher keeps the path: /ja/places/x links to /en/places/x", () => {
  const html = render(
    <LanguageSwitcherView locale="ja" locales={SUPPORTED_LOCALES} pathname="/ja/places/x" />,
  );
  expect(html).toContain('href="/en/places/x"');
  expect(html).toContain('href="/ja/places/x"');
});

it("marks the current language with aria-current and labels each language in its own language", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const html = render(
      <LanguageSwitcherView locale={locale} locales={SUPPORTED_LOCALES} pathname={`/${locale}`} />,
    );
    expect(html).toMatch(
      new RegExp(`lang="${locale}" hrefLang="${locale}"[^>]*aria-current="page"`),
    );
    expect(html.match(/aria-current=/g)).toHaveLength(1);
    expect(html).toContain('lang="ja"');
    expect(html).toContain('lang="en"');
    const links = html.match(/<a\b[^>]*>[^]*?<\/a>/g) ?? [];
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.replace(/<[^>]*>/g, ""))).toEqual(["日本語", "English"]);
    for (const link of links) {
      expect(link).not.toContain("aria-label=");
      expect(link).not.toContain("aria-hidden=");
      expect(link).toContain("min-h-11 min-w-11");
    }
    expect(html).toContain('aria-label="日本語 / English"');
    expect(html).toMatch(/aria-current="page" class="[^"]*bg-kon[^"]*text-white/);
  }
});

it("signed out shows a sign-in link to /<locale>/sign-in", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const html = render(<AccountMenuView locale={locale} state={{ kind: "signedOut" }} />);
    expect(html).toContain(`href="/${locale}/sign-in"`);
    expect(html).toContain(shellMessages[locale].signIn);
  }
});
it("a creator sees the creator link and no steward link", () => {
  const html = account("creator");
  expect(html).toContain('href="/en/creator"');
  expect(html).not.toContain('href="/en/steward"');
  expect(html).not.toContain('href="/en/owner"');
});
it("a steward sees creator and steward links", () => {
  const html = account("steward");
  expect(html).toContain('href="/en/creator"');
  expect(html).toContain('href="/en/steward"');
});
it("a business owner sees the owner link", () => {
  const html = account("business_owner");
  expect(html).toContain('href="/en/owner"');
  expect(html).not.toContain('href="/en/creator"');
});
it("a mock account shows the Demo badge", () => {
  expect(account("user", true)).toContain('data-badge="demo"');
});
it("a real account does not", () => {
  expect(account("user")).not.toContain('data-badge="demo"');
});
it("account names, roles and sign-out slots are visible in both languages", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const role of ["user", "creator", "business_owner", "steward"] as const) {
      const html = account(role, false, locale);
      expect(html).toContain("Demo person");
      expect(html).toContain(shellMessages[locale][role]);
      expect(html).toMatch(/<button[^>]*>Sign out<\/button>/);
    }
  }
});
it("RequireRoleView shows children to a steward on a creator page", () => {
  expect(
    render(
      <RequireRoleView locale="en" state={signedIn("steward")} roles={["creator"]}>
        <p>Allowed content</p>
      </RequireRoleView>,
    ),
  ).toContain("Allowed content");
});
it("shows the localised message to a user", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const html = render(
      <RequireRoleView locale={locale} state={signedIn("user")} roles={["creator"]}>
        Secret content
      </RequireRoleView>,
    );
    expect(html).not.toContain("Secret content");
    expect(html).toContain(
      shellMessages[locale].pageForRoles.replace("{roles}", shellMessages[locale].creator),
    );
  }
});
it("role gates offer sign-in and loading skeletons without revealing children", () => {
  for (const kind of ["loading", "settingUp", "signedOut"] as const) {
    const html = render(
      <RequireRoleView locale="en" state={{ kind }} roles={["creator"]}>
        Secret content
      </RequireRoleView>,
    );
    expect(html).not.toContain("Secret content");
    expect(html).toContain(kind === "signedOut" ? 'href="/en/sign-in"' : 'data-slot="skeleton"');
  }
  const html = render(
    <RequireRoleView locale="en" state={signedIn("steward")} roles={["business_owner"]}>
      Secret content
    </RequireRoleView>,
  );
  expect(html).not.toContain("Secret content");
});

describe("error text", () => {
  it("errorText maps every error code in both languages", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const code of Object.keys(ERROR_STATUS) as (keyof typeof ERROR_STATUS)[]) {
        const data = { code, message: "detail", rule: "test_rule" };
        const expected = shellMessages[locale][code].replace("{rule}", "test_rule");
        expect(errorText(new ConvexError(data), locale)).toBe(`${expected} (detail)`);
        expect(errorText(new ConvexError({ ...data, message: "  " }), locale)).toBe(expected);
      }
    }
  });
  it("names the rule of a rule violation", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(
        errorText(
          new ConvexError({ code: "rule_violation", rule: "person_token_unique", message: "" }),
          locale,
        ),
      ).toContain("person_token_unique");
    }
  });
  it("is never empty for a TypeError, a thrown string, undefined and an object without a code", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const error of [
        new TypeError("bad value"),
        "thrown text",
        undefined,
        {},
        null,
        "",
        new Error(""),
        { data: { code: "unknown" } },
      ]) {
        const text = errorText(error, locale);
        expect(text).toContain(shellMessages[locale].somethingWentWrong);
        expect(text).toMatch(/\(.+: .+\)/);
      }
      expect(errorText(new TypeError("bad value"), locale)).toContain("(TypeError: bad value)");
      expect(errorText("thrown text", locale)).toContain("(Error: thrown text)");
    }
  });
});
it("shell messages have the same keys in both locales", () => {
  expect(Object.keys(shellMessages.ja).sort()).toEqual(Object.keys(shellMessages.en).sort());
  for (const locale of SUPPORTED_LOCALES) {
    for (const value of Object.values(shellMessages[locale])) expect(value.trim()).not.toBe("");
  }
});
it("page container supplies the main target, heading and actions", () => {
  const html = render(
    <PageContainer title="Title" actions={<button>Action</button>}>
      <p>Content</p>
    </PageContainer>,
  );
  expect(html).toContain('<main id="main" tabindex="-1"');
  expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
  expect(html).toContain("<button>Action</button>");
  expect(html).toContain("<p>Content</p>");
});

it.each([
  ["Demo Creator (mock)", "DC"],
  ["Alex Morgan", "AM"],
  ["Noren", "N"],
  ["山田 太郎", "山"],
  ["さくら", "さ"],
  ["サクラ", "サ"],
  ["  Alex   Morgan  ", "AM"],
])("uses initials for %s", (name, initials) => {
  expect(accountInitials(name)).toBe(initials);
  const html = render(
    <AccountMenuView
      locale="en"
      state={{ kind: "signedIn", displayName: name, role: "user", isMock: false }}
    />,
  );
  expect(html).toMatch(new RegExp(`>${initials}</span>`));
});

it("keeps the role and demo line inside the menu, with localised trigger names", () => {
  for (const locale of SUPPORTED_LOCALES) {
    menu.open = false;
    try {
      const html = account("creator", true, locale);
      expect(html).toContain(`aria-label="${shellMessages[locale].accountMenu}"`);
      expect(html).toContain('aria-haspopup="menu"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain(shellMessages[locale].creator);
      expect(html).not.toContain('data-badge="demo"');
      expect(html).not.toContain('href="/en/creator"');
    } finally {
      menu.open = true;
    }
  }
});

it("lists exactly each role's destinations, in order, in both languages", () => {
  const paths = {
    user: [""],
    creator: ["/creator", ""],
    business_owner: ["/owner", ""],
    steward: ["/creator", "/steward", ""],
  };
  for (const locale of SUPPORTED_LOCALES) {
    for (const role of ["user", "creator", "business_owner", "steward"] as const) {
      const html = account(role, true, locale);
      expect(Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1])).toEqual(
        paths[role].map((path) => `/${locale}${path}`),
      );
      expect(html).toContain(shellMessages[locale].demoAccount);
      expect(account(role, false, locale)).not.toContain(shellMessages[locale].demoAccount);
      expect(html).toContain(shellMessages[locale].exploreMap);
      expect(html).toContain('role="separator"');
    }
  }
  expect(shellMessages.en.user).toBe("Visitor");
  expect(shellMessages.en.business_owner).toBe("Shop owner");
  expect(shellMessages.en.creatorPages).toBe("My places");
  expect(shellMessages.en.ownerPages).toBe("My shop");
  expect(shellMessages.en.stewardPages).toBe("Steward desk");
});

it("loading and setup have named circular skeletons and no management links", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const kind of ["loading", "settingUp"] as const) {
      const html = render(<AccountMenuView locale={locale} state={{ kind }} />);
      expect(html).toContain(
        `role="status" aria-label="${kind === "loading" ? shellMessages[locale].signingIn : shellMessages[locale].settingUp}"`,
      );
      expect(html).toContain('data-slot="skeleton"');
      expect(html).toContain("size-10 rounded-full");
      expect(html).not.toContain("href=");
    }
  }
});

it("the logo is a decorative 24px indigo curtain without text", () => {
  const html = render(<NorenMark />);
  expect(html).toContain('width="24" height="24"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('fill="#23305c"');
  expect(html).not.toContain("<text");
});

it("the footer has the three ordered destinations and review notice in both locales", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const compact of [false, true]) {
      const html = render(<SiteFooter locale={locale} compact={compact} />);
      expect(Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1])).toEqual([
        `/${locale}/notice`,
        `/${locale}/takedown`,
        "https://www.openstreetmap.org/copyright",
      ]);
      for (const key of ["aboutData", "askRemoval", "mapCredit", "japaneseReview"] as const)
        expect(html).toContain(shellMessages[locale][key]);
      expect(html.includes("mt-8")).toBe(!compact);
      expect(html).toContain("border-line");
    }
  }
  expect(shellMessages.en.aboutData).toBe("About Noren and your data");
  expect(shellMessages.en.askRemoval).toBe("Ask to remove something");
  expect(shellMessages.en.mapCredit).toBe("Map data © OpenStreetMap contributors");
  expect(shellMessages.en.japaneseReview).toBe(
    "Japanese wording is still being checked by native speakers.",
  );
  expect(shellMessages.ja.japaneseReview).toBe(
    "日本語の表現は、ネイティブスピーカーによる確認中です。",
  );
});

it("only adds the footer after main when PageContainer receives a locale", () => {
  expect(render(<PageContainer>Content</PageContainer>)).not.toContain("<footer");
  for (const locale of SUPPORTED_LOCALES) {
    const html = render(<PageContainer locale={locale}>Content</PageContainer>);
    expect(html).toContain(`</main><footer lang="${locale}"`);
  }
});

it("shell copy never introduces ratings or sentiment", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const text = [
      render(<SiteHeader locale={locale} regionName="長崎" locales={SUPPORTED_LOCALES} />),
      account("steward", true, locale),
      render(<SiteFooter locale={locale} />),
    ]
      .join(" ")
      .replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\b(ratings?|scores?|stars?|sentiment)\b|評価|口コミ|星|評判/i);
  }
});

it("keeps the language navigation in every account state", () => {
  const states: AccountState[] = [
    { kind: "loading" },
    { kind: "settingUp" },
    { kind: "signedOut" },
    signedIn("creator"),
  ];
  try {
    for (const state of states) {
      headerAccount.state = state;
      for (const locale of SUPPORTED_LOCALES) {
        const html = render(
          <SiteHeader locale={locale} regionName="長崎" locales={SUPPORTED_LOCALES} />,
        );
        expect(html).toContain('aria-label="日本語 / English"');
        expect(html).toMatch(/<a[^>]*>日本語<\/a>/);
        expect(html).toMatch(/<a[^>]*>English<\/a>/);
        expect(html).toContain("h-14 shrink-0");
        expect(html).toContain("h-full flex-nowrap max-w-[1200px]");
        expect(html).toContain("flex-nowrap");
      }
    }
  } finally {
    headerAccount.state = { kind: "signedOut" };
  }
});

it.each(SUPPORTED_LOCALES)(
  "%s hides header Sign in only on sign-in routes and keeps languages",
  (locale) => {
    headerAccount.state = { kind: "signedOut" };
    try {
      for (const path of [
        "/sign-in",
        "/sign-in/",
        "/sign-in/factor-one",
        "/sign-in/factor-two/verify",
        "",
        "/notice",
        "/sign-in-help",
        "/places/sign-in",
      ]) {
        navigation.pathname = `/${locale}${path}`;
        const html = render(
          <SiteHeader locale={locale} regionName="長崎" locales={SUPPORTED_LOCALES} />,
        );
        const onSignIn = path === "/sign-in" || path.startsWith("/sign-in/");
        expect(html.includes(`>${shellMessages[locale].signIn}</a>`)).toBe(!onSignIn);
        expect(html).toContain('aria-label="日本語 / English"');
        expect(html).toMatch(/<a[^>]*>日本語<\/a>/);
        expect(html).toMatch(/<a[^>]*>English<\/a>/);
        if (!onSignIn) expect(html).toContain(shellMessages[locale].signIn);
      }
    } finally {
      navigation.pathname = "/ja";
    }
  },
);
