import type { ReactElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceAdminGate } from "@/components/steward/place-admin-container";
import { PlaceEditorGate } from "@/components/creator/place-editor-container";
import { OwnerPlaceGate } from "@/components/owner/owner-place-container";
import { InterviewGate } from "@/components/interview-workspace/workspace-container";
import { PageContainer } from "@/components/layout/page-container";
import { loadRegions } from "@/lib/region";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { ownerMessages } from "@/lib/i18n/messages/owner";
import { shellMessages } from "@/lib/i18n/messages/shell";

const query = vi.hoisted(() => ({
  result: undefined as string | null | undefined,
  useQuery: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: query.useQuery,
  useMutation: () => vi.fn(),
  useQueries: () => ({}),
}));

const region = [...loadRegions().values()][0]!;
const rawId = "not-a-place-id";
const cases = [
  {
    name: "steward",
    table: "place",
    element: (locale: Locale) => <PlaceAdminGate placeId={rawId} locale={locale} region={region} />,
    loading: (locale: Locale) => stewardMessages[locale].loading,
    missing: (locale: Locale) => stewardMessages[locale].notFound,
  },
  {
    name: "creator",
    table: "place",
    element: (locale: Locale) => (
      <PlaceEditorGate placeId={rawId} locale={locale} region={region} />
    ),
    loading: (locale: Locale) => creatorMessages[locale].loading,
    missing: (locale: Locale) => creatorMessages[locale].notFound,
  },
  {
    name: "owner",
    table: "place",
    element: (locale: Locale) => (
      <PageContainer locale={locale}>
        <OwnerPlaceGate placeId={rawId} locale={locale} region={region} />
      </PageContainer>
    ),
    loading: (locale: Locale) => ownerMessages[locale].loading,
    missing: (locale: Locale) => shellMessages[locale].notFoundBody,
  },
  {
    name: "interview",
    table: "interview",
    element: (locale: Locale) => <InterviewGate id={rawId} locale={locale} region={region} />,
    loading: (locale: Locale) => shellMessages[locale].signingIn,
    missing: (locale: Locale) => shellMessages[locale].not_found,
  },
];

beforeEach(() => {
  query.result = undefined;
  query.useQuery.mockReset();
  query.useQuery.mockImplementation((reference) =>
    getFunctionName(reference) === "ids:normalize" ? query.result : undefined,
  );
});

function calls() {
  return query.useQuery.mock.calls.map(([reference, args]) => ({
    name: getFunctionName(reference),
    args,
  }));
}

describe.each(cases)("$name normalization gate", ({ table, element, loading, missing }) => {
  it.each(SUPPORTED_LOCALES)("%s waits for normalization without querying the raw ID", (locale) => {
    const html = render(element(locale));
    expect(html).toContain('role="status"');
    expect(html).toContain(loading(locale));
    expect(html).not.toContain(missing(locale));
    expect(calls()).toEqual([{ name: "ids:normalize", args: { table, id: rawId } }]);
  });

  it.each(SUPPORTED_LOCALES)(
    "%s shows not-found for null without mounting other queries",
    (locale) => {
      query.result = null;
      const html = render(element(locale));
      expect(html).toContain(missing(locale));
      expect(html).not.toContain('role="status"');
      expect(html.match(/<main\b/g)).toHaveLength(1);
      expect(html.match(/<main id="main" tabindex="-1"/g)).toHaveLength(1);
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(calls()).toEqual([{ name: "ids:normalize", args: { table, id: rawId } }]);
    },
  );

  it("passes the normalized ID, rather than the raw string, into the query tree", () => {
    query.result = "normalized-id";
    render(element("en") as ReactElement);
    const name = table === "place" ? "places:get" : "interviews:get";
    const args = table === "place" ? { placeId: query.result } : { interviewId: query.result };
    expect(calls()).toContainEqual({ name, args });
    expect(calls().filter((call) => call.name !== "ids:normalize")).not.toContainEqual({
      name,
      args: table === "place" ? { placeId: rawId } : { interviewId: rawId },
    });
  });
});
