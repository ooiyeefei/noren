import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/[lang]/layout";
import SignInPage from "@/app/[lang]/sign-in/[[...sign-in]]/page";
import SignUpPage from "@/app/[lang]/sign-up/[[...sign-up]]/page";
import { clerkLocalization } from "@/lib/i18n/clerk-localization";
import type { RegionConfig } from "@/lib/region/schema";
import { config } from "../fixtures/public-ui";

const state = vi.hoisted(() => ({ region: undefined as unknown, locale: "en" as string }));

vi.mock("@/lib/region/registry", async (original) => {
  const actual = await original<typeof import("@/lib/region/registry")>();
  return { ...actual, activeRegionConfig: () => state.region };
});
vi.mock("@/lib/region", async (original) => {
  const actual = await original<typeof import("@/lib/region")>();
  return { ...actual, getActiveRegion: () => state.region };
});
vi.mock("next/root-params", () => ({ lang: async () => state.locale }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font-mock" });
  return { BIZ_UDPGothic: font, Geist_Mono: font, Shippori_Mincho_B1: font };
});
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: function ClerkProvider() {},
  SignIn: function SignIn() {},
  SignUp: function SignUp() {},
}));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: function SiteHeader() {} }));
vi.mock("@/components/providers/convex-client-provider", () => ({
  ConvexClientProvider: function ConvexClientProvider() {},
}));

/** Finds an element by its component's name in a tree that has not been rendered. */
function find(node: ReactNode, name: string): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  const walk = (current: ReactNode) => {
    Children.forEach(current, (child) => {
      if (found || !isValidElement(child)) return;
      const type = child.type as { name?: string } | string;
      if (typeof type !== "string" && type.name === name)
        found = child.props as Record<string, unknown>;
      else walk((child.props as { children?: ReactNode }).children);
    });
  };
  walk(node);
  if (!found) throw new Error(`no ${name} in the tree`);
  return found;
}

function region(over: (r: RegionConfig) => void = () => {}): RegionConfig {
  const copy = structuredClone(config);
  over(copy);
  return copy;
}
const open = () =>
  region((r) => {
    r.legal.accountsOpen = true;
    r.legal.documentsVersion = "2030-01-31";
  });

const layout = async () =>
  RootLayout({ children: null, params: Promise.resolve({ lang: state.locale }) } as never);

beforeEach(() => {
  state.region = config;
  state.locale = "en";
});

describe.each(["en", "ja"] as const)("sign-up in %s (T060)", (locale) => {
  beforeEach(() => {
    state.locale = locale;
  });

  describe("while accounts are closed, as shipped", () => {
    it("the shipped region is closed", () => {
      expect(config.legal.accountsOpen).toBe(false);
    });

    it("the sign-up page answers 404", async () => {
      await expect(SignUpPage()).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("the sign-in form has no sign-up link", async () => {
      expect(find(await SignInPage(), "SignIn").signUpUrl).toBeUndefined();
    });

    it("the provider has no sign-up address", async () => {
      expect(find(await layout(), "ClerkProvider").signUpUrl).toBeUndefined();
    });
  });

  describe("once accounts are open", () => {
    beforeEach(() => {
      state.region = open();
    });

    it("the sign-up page shows Clerk's form at its own address", async () => {
      const form = find(await SignUpPage(), "SignUp");
      expect(form.path).toBe(`/${locale}/sign-up`);
      expect(form.signInUrl).toBe(`/${locale}/sign-in`);
      expect(form.fallbackRedirectUrl).toBe(`/${locale}`);
    });

    it("the sign-in form links to sign-up", async () => {
      expect(find(await SignInPage(), "SignIn").signUpUrl).toBe(`/${locale}/sign-up`);
    });

    it("the provider has both addresses", async () => {
      const provider = find(await layout(), "ClerkProvider");
      expect(provider.signInUrl).toBe(`/${locale}/sign-in`);
      expect(provider.signUpUrl).toBe(`/${locale}/sign-up`);
    });
  });

  it("documents open separately from accounts, because they must be readable first", async () => {
    state.region = region((r) => (r.legal.documentsVersion = null));
    expect(find(await layout(), "DocumentLinksProvider")).toMatchObject({ published: false });
    state.region = region((r) => (r.legal.documentsVersion = "2030-01-31"));
    expect(find(await layout(), "DocumentLinksProvider")).toMatchObject({ published: true });
    expect(find(await layout(), "ClerkProvider").signUpUrl).toBeUndefined();
    await expect(SignUpPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("the tick in Clerk's form (T060)", () => {
  const label = (locale: "en" | "ja", age: number) => {
    const text = clerkLocalization(locale, age).signUp?.legalConsent?.checkbox
      ?.label__termsOfServiceAndPrivacyPolicy;
    if (typeof text !== "string") throw new Error("no label");
    return text;
  };

  it("states the age and agreement to both documents in English", () => {
    expect(label("en", 16)).toBe(
      'I am 16 or over and agree to the {{ termsOfServiceLink || link("Terms") }} and the {{ privacyPolicyLink || link("Privacy Notice") }}',
    );
  });

  it("states the age and agreement to both documents in Japanese", () => {
    expect(label("ja", 16)).toBe(
      '私は16歳以上で、{{termsOfServiceLink || link("利用規約")}}と{{privacyPolicyLink || link("プライバシーポリシー")}}に同意します',
    );
  });

  it("takes the age from the region and keeps Clerk's link tokens", () => {
    for (const locale of ["en", "ja"] as const) {
      expect(label(locale, 19)).toContain("19");
      expect(label(locale, 19)).not.toContain("{age}");
      expect(label(locale, 19)).toContain("termsOfServiceLink");
      expect(label(locale, 19)).toContain("privacyPolicyLink");
    }
  });

  it("keeps the rest of Clerk's Japanese, and leaves English to Clerk's defaults", () => {
    const ja = clerkLocalization("ja", 16);
    expect(ja.locale).toBe("ja-JP");
    expect(ja.signUp?.legalConsent?.continue?.title).toBe("法的同意");
    expect(ja.signUp?.legalConsent?.checkbox?.label__onlyTermsOfService).toContain("利用規約");
    const en = clerkLocalization("en", 16);
    expect(Object.keys(en)).toEqual(["signUp"]);
    expect(Object.keys(en.signUp?.legalConsent ?? {})).toEqual(["checkbox"]);
  });

  it("reaches the provider with the region's age", async () => {
    state.region = region((r) => (r.minimumAge = 19));
    const provider = find(await layout(), "ClerkProvider") as {
      localization: ReturnType<typeof clerkLocalization>;
    };
    expect(
      provider.localization.signUp?.legalConsent?.checkbox?.label__termsOfServiceAndPrivacyPolicy,
    ).toContain("I am 19 or over");
  });
});
