import type { ComponentProps, ReactElement, ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import { regionSchema } from "@/lib/region/schema";
import { PlanContainer } from "@/components/planner/plan-container";
import { RemembersContainer } from "@/components/memory/remembers-container";
import { AccountMenuView, type AccountState } from "@/components/layout/account-menu";
import { FeatureLinksProvider } from "@/components/layout/features";
import { SiteFooter } from "@/components/layout/site-footer";

// The dark launch: while features.planner is false in the region file there is no page, no link and
// nothing that writes to the device.

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
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(),
}));
const auth = vi.hoisted(() => ({ loading: false, authenticated: false }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: auth.loading, isAuthenticated: auth.authenticated }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/lib/i18n/server", () => ({ getLocale: async () => "en" }));

const active = vi.hoisted(() => ({ planner: false }));
vi.mock("@/lib/region", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/region")>();
  return {
    ...original,
    getActiveRegion: () => ({
      ...original.getRegion("nagasaki")!,
      features: { connector: false, planner: active.planner, walk: false },
    }),
  };
});

import PlanPage, { generateMetadata as planMetadata } from "@/app/[lang]/plan/page";
import RemembersPage, { generateMetadata as remembersMetadata } from "@/app/[lang]/remembers/page";

beforeEach(() => {
  active.planner = false;
  auth.loading = false;
  auth.authenticated = false;
});

/** The page's server component, which sits inside a Suspense. */
async function content(Page: () => ReactElement): Promise<ReactElement> {
  const suspense = Page();
  const inner = (suspense.props as { children: ReactElement }).children;
  return await (inner.type as (props: unknown) => Promise<ReactElement>)(inner.props);
}

describe("the shipped switch", () => {
  it("is off", () => {
    expect(regionSchema.parse(nagasaki).features).toEqual({
      connector: false,
      planner: false,
      walk: false,
    });
  });
});

describe("the pages", () => {
  it("are a 404 while the planner is off", async () => {
    // Thrown before anything streams, so the response is a real 404 and not an empty 200.
    expect(() => PlanPage()).toThrow("NEXT_NOT_FOUND");
    expect(() => RemembersPage()).toThrow("NEXT_NOT_FOUND");
    const params = Promise.resolve({ lang: "en" });
    expect(await planMetadata({ params } as never)).toEqual({});
    expect(await remembersMetadata({ params } as never)).toEqual({});
  });

  it("answer once it is on", async () => {
    active.planner = true;
    const plan = render(await content(PlanPage));
    expect(plan).toContain("Plan my day");
    expect(plan).toContain("Sign in to plan your day");
    const remembers = render(await content(RemembersPage));
    expect(remembers).toContain("What Noren remembers");
    const params = Promise.resolve({ lang: "ja" });
    expect(await planMetadata({ params } as never)).toEqual({ title: "一日のプラン | Noren" });
    expect(await remembersMetadata({ params } as never)).toEqual({
      title: "Noren が覚えていること | Noren",
    });
  });
});

describe("the links", () => {
  const signedIn: AccountState = {
    kind: "signedIn",
    displayName: "Demo person",
    role: "user",
    isMock: false,
  };

  it("are absent from the footer and the account menu while it is off", () => {
    for (const html of [
      render(<SiteFooter locale="en" />),
      render(<AccountMenuView locale="en" state={signedIn} signOut={<button>Sign out</button>} />),
      render(
        <FeatureLinksProvider planner={false}>
          <SiteFooter locale="en" />
          <AccountMenuView locale="en" state={signedIn} signOut={<button>Sign out</button>} />
        </FeatureLinksProvider>,
      ),
    ]) {
      expect(html).not.toContain("/en/plan");
      expect(html).not.toContain("/en/remembers");
    }
  });

  it("appear in both once it is on, in the visitor's language", () => {
    const footer = render(
      <FeatureLinksProvider planner>
        <SiteFooter locale="en" />
      </FeatureLinksProvider>,
    );
    expect(footer).toContain('href="/en/plan"');
    expect(footer).toContain("Plan my day");
    expect(footer).toContain('href="/en/remembers"');
    expect(footer).toContain("What Noren remembers");
    const menuHtml = render(
      <FeatureLinksProvider planner>
        <AccountMenuView locale="ja" state={signedIn} signOut={<button>ログアウト</button>} />
      </FeatureLinksProvider>,
    );
    expect(menuHtml).toContain('href="/ja/plan"');
    expect(menuHtml).toContain("一日のプラン");
    expect(menuHtml).toContain('href="/ja/remembers"');
  });
});

describe("the containers", () => {
  const props = {
    locale: "en" as const,
    regionId: "nagasaki",
    neighbourhoods: regionSchema.parse(nagasaki).neighbourhoods ?? [],
    nameRegion: { nameFallback: regionSchema.parse(nagasaki).nameFallback, defaultLocale: "en" },
  };

  it("the planner waits for sign-in, asks a signed-out visitor to sign in, and opens for a member", () => {
    auth.loading = true;
    expect(render(<PlanContainer {...props} />)).toContain("Checking sign-in");
    auth.loading = false;
    expect(render(<PlanContainer {...props} />)).toContain("Sign in to plan your day");
    expect(render(<PlanContainer {...props} />)).not.toContain("plan-input");
    auth.authenticated = true;
    const html = render(<PlanContainer {...props} />);
    expect(html).toContain('id="plan-input"');
    expect(html).toContain("Where do you start?");
    expect(html).toContain("Nearest to me");
    expect(html).toContain("Nothing saved yet.");
    expect(html).not.toContain("Sign in to plan your day");
  });

  it("the memory page works signed out, with no mic, and signed in with one", () => {
    const signedOut = render(<RemembersContainer locale="en" checkable={["no-alcohol"]} />);
    expect(signedOut).toContain("Hard rules");
    expect(signedOut).toContain("No rules yet.");
    expect(signedOut).not.toContain("Use your voice instead");
    auth.authenticated = true;
    // The mic is the existing voice input, which says what it does and asks for consent.
    expect(render(<RemembersContainer locale="en" checkable={[]} />)).toContain(
      "Use your voice instead",
    );
  });
});
