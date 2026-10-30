import type { ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StewardErrorBoundary } from "@/components/steward/steward-home-container";
import { CreatorErrorBoundary } from "@/components/creator/creator-home-container";
import { OwnerBoundary } from "@/components/owner/owner-home-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { QueryBoundary } from "@/components/interview-workspace/workspace-container";
import { isInvalidIdError } from "@/components/owner/review";
import { PageContainer } from "@/components/layout/page-container";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { ownerMessages } from "@/lib/i18n/messages/owner";
import { interviewPageMessages } from "@/lib/i18n/messages/interview-page";

const unexpected = new Error(
  "[CONVEX Q(places:get)] [Request ID: test] Server Error Called by client",
);
const malformed = new Error('ArgumentValidationError: invalid id; Validator: v.id("place")');

function page(html: string) {
  expect(html.match(/<main\b/g)).toHaveLength(1);
  expect(html.match(/<main id="main" tabindex="-1"/g)).toHaveLength(1);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
}

function fallback(name: string, locale: Locale, error: unknown): ReactNode {
  const children = <p>Should be replaced</p>;
  if (name === "steward") {
    const boundary = new StewardErrorBoundary({ locale, malformedAsNotFound: true, children });
    boundary.state = StewardErrorBoundary.getDerivedStateFromError(error);
    return boundary.render();
  }
  if (name === "creator") {
    const boundary = new CreatorErrorBoundary({ locale, malformedAsNotFound: true, children });
    boundary.state = CreatorErrorBoundary.getDerivedStateFromError(error);
    return boundary.render();
  }
  if (name === "interview" || name === "claims") {
    const boundary = new QueryBoundary({ locale, children, claims: name === "claims" });
    boundary.state = QueryBoundary.getDerivedStateFromError(error);
    const output = boundary.render();
    return name === "claims" ? (
      <PageContainer locale={locale} title={interviewPageMessages[locale].title}>
        {output}
      </PageContainer>
    ) : (
      output
    );
  }
  if (name === "owner place" || name === "owner home") {
    const place = name === "owner place";
    const boundary = new OwnerBoundary({
      locale,
      children,
      notFound: place ? isInvalidIdError : undefined,
      errorTitle: place ? shellMessages[locale].errorTitle : undefined,
    });
    boundary.state = OwnerBoundary.getDerivedStateFromError(error);
    return (
      <PageContainer locale={locale} title={place ? undefined : ownerMessages[locale].homeTitle}>
        {boundary.render()}
      </PageContainer>
    );
  }
  const insideMain = name === "public home";
  const boundary = new PublicQueryBoundary({ locale, insideMain, children });
  boundary.state = PublicQueryBoundary.getDerivedStateFromError(error);
  return insideMain ? (
    <main id="main" tabIndex={-1}>
      {boundary.render()}
    </main>
  ) : (
    boundary.render()
  );
}

describe.each(SUPPORTED_LOCALES)("%s boundary fallbacks", (locale) => {
  it.each([
    "steward",
    "creator",
    "interview",
    "claims",
    "owner place",
    "owner home",
    "public home",
    "public place/takedown",
  ])("%s keeps one main and heading with recovery copy and diagnostics", (name) => {
    const html = render(fallback(name, locale, unexpected));
    page(html);
    expect(html).toContain(`<p role="alert">${shellMessages[locale].unexpectedError}</p>`);
    expect(html).toContain(shellMessages[locale].technicalDetails);
    expect(html).toContain("<details>");
    expect(html).not.toContain("Should be replaced");
  });

  it.each([
    ["steward", stewardMessages[locale].notFound],
    ["creator", creatorMessages[locale].notFound],
    ["interview", shellMessages[locale].not_found],
    ["owner place", shellMessages[locale].notFoundBody],
  ])("%s keeps the dev invalid-ID fallback in the page", (name, text) => {
    const html = render(fallback(name, locale, malformed));
    page(html);
    expect(html).toContain(text);
    expect(html).not.toContain(shellMessages[locale].unexpectedError);
  });

  it.each(["not_found", "forbidden"])("interview treats %s as not-found", (code) => {
    const html = render(fallback("interview", locale, { data: { code } }));
    page(html);
    expect(html).toContain(shellMessages[locale].not_found);
  });

  it("keeps the managers-only claims notice inside the workspace", () => {
    const html = render(fallback("claims", locale, { data: { code: "forbidden" } }));
    page(html);
    expect(html).toContain(interviewPageMessages[locale].managersOnly);
  });

  it("silent owner boundaries render nothing", () => {
    const boundary = new OwnerBoundary({ locale, children: "extra", silent: true });
    boundary.state = OwnerBoundary.getDerivedStateFromError(unexpected);
    expect(render(boundary.render())).toBe("");
  });
});
