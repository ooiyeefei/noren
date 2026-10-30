import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MapsLinkFeedback,
  GeoSearchView,
  NewPlaceView,
  type NewPlaceViewProps,
} from "@/components/creator/new-place-view";
import { CreatorHomeView } from "@/components/creator/creator-home-view";
import { PlaceEditorView, type PlaceEditorViewProps } from "@/components/creator/place-editor-view";
import { loadRegions } from "@/lib/region";
import { creatorMessages } from "@/lib/i18n/messages/creator";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("maplibre-gl", () => {
  throw new Error("No map runtime during SSR");
});
const region = [...loadRegions().values()][0]!;
const newProps: NewPlaceViewProps = {
  locale: "ja",
  region,
  role: "steward",
  draft: {
    kind: "business",
    names: [{ lang: "ja", script: "kanji", value: "仮の場所", isPrimary: true }],
    pin: null,
  },
  search: { query: "", pending: false, coolingDown: false },
  searchActions: { onQuery: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(), onConfirm: vi.fn() },
  onChange: vi.fn(),
  onCreate: vi.fn(),
};
const editorProps: PlaceEditorViewProps = {
  ...newProps,
  pending: undefined,
  locale: "en",
  place: { id: "mock-place", slug: "mock-place", canEdit: true, isMock: true },
  sourceDraft: { url: "", title: "", note: "", noteLang: "en", authorHandle: "", authorUrl: "" },
  posts: [
    {
      id: "mock-source",
      platform: "instagram",
      canonicalUrl: "https://www.instagram.com/p/mock/",
      embed: { kind: "link", url: "https://example.com/mock" },
      authorHandle: "@mock_creator",
      title: "Mock title",
      creatorNote: "Mock source note",
      noteLang: "en",
      isMock: true,
    },
  ],
  interviews: [{ id: "mock-interview", language: "ja", status: "consent_pending", isMock: true }],
  interviewLanguage: "ja",
  onSaveCategory: vi.fn(),
  onSaveNames: vi.fn(),
  onSavePin: vi.fn(),
  onSourceChange: vi.fn(),
  onAddPost: vi.fn(),
  onRemovePost: vi.fn(),
  onInterviewLanguage: vi.fn(),
  onStartInterview: vi.fn(),
};
describe("creator UI", () => {
  it("the new-place view in ja shows categories, name rows, search and the map picker hint", () => {
    const html = ([1, 2, 3] as const)
      .map((step) => renderToStaticMarkup(<NewPlaceView {...newProps} step={step} />))
      .join("");
    for (const text of [
      "カテゴリー（任意）",
      "カフェ・喫茶店",
      "場所の名前",
      "漢字",
      "かな",
      "ローマ字",
      "Latin",
      "場所を探す",
      "地図をクリック",
      "Enterキー",
    ])
      expect(html).toContain(text);
    expect(html).toMatch(/type="submit"[^>]*>検索/);
  });
  it("the creator form no longer offers a kind", () => {
    for (const role of ["creator", "steward"] as const) {
      const html = renderToStaticMarkup(<NewPlaceView {...newProps} role={role} step={3} />);
      expect(html).not.toContain("場所の種類");
      expect(html).not.toContain('value="business"');
      expect(html).not.toContain('value="landmark"');
      expect(html).toContain(creatorMessages.ja.businessHint);
    }
  });
  it("the creator form displays the chosen category", () => {
    expect(
      renderToStaticMarkup(
        <NewPlaceView {...newProps} step={3} draft={{ ...newProps.draft, category: "cafe" }} />,
      ),
    ).toMatch(/aria-pressed="true"[^>]*>カフェ・喫茶店/);
  });
  it("suggestions are labelled as suggestions with their attribution and require pin confirmation", () => {
    const suggestion = {
      name: "Mock harbour",
      lat: 32.75,
      lng: 129.87,
      provider: "nominatim" as const,
      attribution: ["© OpenStreetMap contributors", "Mock attribution"],
    };
    const html = renderToStaticMarkup(
      <GeoSearchView
        locale="en"
        state={{
          ...newProps.search,
          outcome: { ok: true, suggestions: [suggestion] },
          selected: suggestion,
        }}
        actions={newProps.searchActions}
      />,
    );
    for (const text of [
      "Suggestion from OpenStreetMap",
      "© OpenStreetMap contributors",
      "Mock attribution",
      "Place pin at this suggestion",
    ])
      expect(html).toContain(text);
  });
  it("field errors render next to their inputs", () => {
    const html = ([1, 2] as const)
      .map((step) =>
        renderToStaticMarkup(
          <NewPlaceView
            {...newProps}
            step={step}
            errors={{ "name.0": "too_long", pin: "no_pin" }}
          />,
        ),
      )
      .join("");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="');
    expect(html).toContain("名前は120文字");
    expect(html).toContain("地図にピンを置いてください。");
  });
  it("search is disabled during a request and during cooldown", () => {
    for (const patch of [{ pending: true }, { coolingDown: true }]) {
      const html = renderToStaticMarkup(
        <GeoSearchView
          locale="en"
          state={{ ...newProps.search, ...patch }}
          actions={newProps.searchActions}
        />,
      );
      expect(html).toMatch(/type="submit"[^>]*disabled/);
    }
  });
  it("the editor view lists posts with credit and remove buttons and interviews with their status", () => {
    const html = renderToStaticMarkup(<PlaceEditorView {...editorProps} />);
    for (const text of [
      "Posted by @mock_creator (as entered by the creator)",
      "Mock source note",
      "Remove",
      "Awaiting consent",
      "ja",
      'data-badge="demo"',
      "/en/creator/interviews/mock-interview",
      "/en/places/mock-place",
    ])
      expect(html).toContain(text);
  });
  it("the source preview shows refusals and editable author fields", () => {
    const html = renderToStaticMarkup(
      <PlaceEditorView
        {...editorProps}
        sourceDraft={{
          ...editorProps.sourceDraft,
          url: "https://127.0.0.1/mock",
          authorHandle: "@typed_mock",
        }}
        sourceError="authorUrl"
      />,
    );
    expect(html).toContain("IP addresses and non-default ports are refused");
    expect(html).toContain("As you know it; shown as entered by you, not verified.");
    expect(html).toContain('value="@typed_mock"');
    expect(html).toContain("Check this field.");
    expect(html).not.toContain("use this note in the story");
  });
  it("a read-only editor shows no edit controls", () => {
    const html = renderToStaticMarkup(
      <PlaceEditorView {...editorProps} place={{ ...editorProps.place, canEdit: false }} />,
    );
    expect(html).toContain("Its creator or a steward can edit it.");
    expect(html).not.toMatch(/<input|<select/);
    for (const text of [
      ">Remove<",
      ">Save names<",
      ">Save pin<",
      ">Add post<",
      ">Start interview<",
    ])
      expect(html).not.toContain(text);
    expect(html).toContain("Mock source note");
  });
  it("creator message keys match in Japanese and English", () =>
    expect(Object.keys(creatorMessages.ja).sort()).toEqual(Object.keys(creatorMessages.en).sort()));
});

it("the editor offers category changes and clearing with a save action", () => {
  const html = renderToStaticMarkup(
    <PlaceEditorView {...editorProps} draft={{ ...editorProps.draft, category: "bar" }} />,
  );
  expect(html).toContain('<option value="bar" selected="">');
  expect(html).toContain('<option value="">Not selected</option>');
  expect(html).toContain(">Save category</button>");
  expect(
    renderToStaticMarkup(
      <PlaceEditorView {...editorProps} place={{ ...editorProps.place, canEdit: false }} />,
    ),
  ).not.toContain(">Save category</button>");
});

it("the Maps field and fill button come in the location step before the names step", () => {
  const first = renderToStaticMarkup(<NewPlaceView {...newProps} locale="en" step={1} />);
  expect(first).toContain("Paste a Google Maps link");
  expect(first).toContain("Fill from link");
  expect(first).not.toContain("Japanese name");
  const second = renderToStaticMarkup(<NewPlaceView {...newProps} locale="en" step={2} />);
  expect(second).toContain("What is it called?");
  expect(second).toContain("Japanese name");
});
it("failure shows a readable message", () => {
  const html = renderToStaticMarkup(
    <MapsLinkFeedback locale="en" error="No coordinates were found in this link." />,
  );
  expect(html).toContain("No coordinates were found in this link.");
  expect(html).toContain('role="alert"');
});
it("Maps suggestions ask the person to check the name and pin in both languages", () => {
  for (const locale of ["ja", "en"] as const) {
    expect(renderToStaticMarkup(<MapsLinkFeedback locale={locale} suggested />)).toContain(
      creatorMessages[locale].checkMapsSuggestion,
    );
  }
});

it("the home guides an empty creator and collapses the guide after their first place", () => {
  const empty = renderToStaticMarkup(<CreatorHomeView locale="en" region={region} places={[]} />);
  for (const text of [
    "My places",
    "What to do here",
    "Add a place",
    "Attach posts about it",
    "Interview the owner",
    creatorMessages.en.noPlaces,
  ])
    expect(empty).toContain(text);
  expect(empty).toContain('<details lang="en" open=""');
  expect(empty).toContain("/en/creator?add=1&amp;step=1");
  const places = [
    {
      _id: "draft",
      slug: "mock-draft",
      names: [
        { lang: "ja", script: "kanji" as const, value: "仮のお店", isPrimary: true },
        { lang: "en", script: "latin" as const, value: "Mock shop", isPrimary: true },
      ],
      visibility: "draft" as const,
      isMock: true,
    },
    { _id: "public", slug: "mock-public", names: [], visibility: "public" as const, isMock: false },
  ];
  const html = renderToStaticMarkup(
    <CreatorHomeView locale="en" region={region} places={places} />,
  );
  for (const text of [
    "Mock shop",
    "仮のお店",
    "Draft",
    "Public",
    "Add posts",
    "Open",
    'data-badge="demo"',
    "/en/creator/places/draft#posts",
    "/en/places/mock-public",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('<details lang="en" open=""');
  expect(html).toContain("border-b border-line");
});

it("category controls have no unreviewed badge while Demo rules stay visible", () => {
  const html = renderToStaticMarkup(<PlaceEditorView {...editorProps} />);
  expect(html).not.toContain('data-badge="unreviewed"');
  expect(html).toContain('data-badge="demo"');
});

it.each(["en", "ja"] as const)(
  "%s keeps Add a place outside the collapsed guide when places exist",
  (locale) => {
    const html = renderToStaticMarkup(
      <CreatorHomeView
        locale={locale}
        region={region}
        places={[
          {
            _id: "mock-place",
            slug: "mock-place",
            names: [],
            visibility: "draft",
            isMock: true,
          },
        ]}
      />,
    );
    const headingRow = html.match(/<section[^>]*><div[^>]*>[^]*?<\/div>/)?.[0];
    expect(headingRow).toContain(`<h2`);
    expect(headingRow).toContain(creatorMessages[locale].myPlaces);
    expect(headingRow).toContain("flex-wrap");
    expect(headingRow).toContain("justify-between");
    expect(headingRow).toContain(`href="/${locale}/creator?add=1&amp;step=1"`);
    expect(headingRow).toContain(creatorMessages[locale].newPlace);
    expect(headingRow).toContain("min-h-11");
    expect(headingRow).toContain("bg-primary");
    expect(html.match(/<details[^]*?<\/details>/)?.[0]).toContain(creatorMessages[locale].newPlace);
    expect(html).not.toMatch(/<details[^>]*open=/);
  },
);
