import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MapsLinkFeedback,
  GeoSearchView,
  NewPlaceView,
  PlacePinSearch,
  PinPicker,
  type NewPlaceViewProps,
} from "@/components/creator/new-place-view";
import { PlaceMap } from "@/components/map/place-map";
import { CreatorHomeView } from "@/components/creator/creator-home-view";
import { PlaceEditorView, type PlaceEditorViewProps } from "@/components/creator/place-editor-view";
import { loadRegions } from "@/lib/region";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { PlaceEditorGate } from "@/components/creator/place-editor-container";

// Views run without a DOM; this harness drives their real handlers and rerenders state.
const hooks = vi.hoisted(() => ({
  current: undefined as { values: unknown[]; cursor: number } | undefined,
}));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const state = hooks.current;
      if (!state) return react.useState(initial);
      const index = state.cursor++;
      if (!(index in state.values))
        state.values[index] = typeof initial === "function" ? initial() : initial;
      return [
        state.values[index],
        (value: unknown) => {
          state.values[index] = typeof value === "function" ? value(state.values[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const state = hooks.current;
      if (!state) return react.useRef(initial);
      const index = state.cursor++;
      if (!(index in state.values)) state.values[index] = { current: initial };
      return state.values[index];
    },
    useId: () => (hooks.current ? "test-view" : react.useId()),
    useEffect: (...args: Parameters<typeof react.useEffect>) => {
      if (!hooks.current) react.useEffect(...args);
    },
  };
});
function mountView<P>(view: (props: P) => ReactNode, props: P) {
  const state = { values: [] as unknown[], cursor: 0 };
  return () => {
    state.cursor = 0;
    hooks.current = state;
    try {
      return view(props);
    } finally {
      hooks.current = undefined;
    }
  };
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}
function element<P>(node: ReactNode, type: unknown): ReactElement<P> {
  const found = elements(node).find((item) => item.type === type);
  if (!found) throw new Error("Missing element");
  return found as ReactElement<P>;
}
function click(node: ReactNode, text: string) {
  const found = elements(node).find(
    (item) => item.props.children === text && typeof item.props.onClick === "function",
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return (found.props.onClick as () => unknown)();
}
afterEach(() => {
  hooks.current = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
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
  onSaveDetails: vi.fn(),
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
      "地図をタップ",
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
  it("suggestions keep their attribution and leave placement to the shared map picker", () => {
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
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Place pin at this suggestion");
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
      "Interview in Japanese, awaiting consent",
      "ja",
      'data-badge="demo"',
      "/en/creator/interviews/mock-interview",
      "/en/places/mock-place",
    ])
      expect(html).toContain(text);
  });
  it("the source preview shows refusals and editable author fields", () => {
    const render = mountView(PlaceEditorView, {
      ...editorProps,
      sourceDraft: {
        ...editorProps.sourceDraft,
        url: "https://127.0.0.1/mock",
        authorHandle: "@typed_mock",
      },
      sourceError: "authorUrl",
    });
    click(render(), "Add a post");
    const html = renderToStaticMarkup(render());
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
    for (const text of [">Remove<", ">Save<", ">Save pin<", ">Add post<", ">Start interview<"])
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
  expect(html).toContain(">Save</button>");
  expect(html).not.toContain(">Save category</button>");
  expect(html).not.toContain(">Save names</button>");
  expect(
    renderToStaticMarkup(
      <PlaceEditorView {...editorProps} place={{ ...editorProps.place, canEdit: false }} />,
    ),
  ).not.toContain(">Save</button>");
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

it.each(["en", "ja"] as const)(
  "%s gives the open wizard its own heading and Cancel link",
  (locale) => {
    const m = creatorMessages[locale];
    const html = renderToStaticMarkup(
      <CreatorHomeView locale={locale} region={region} places={[]} adding>
        <NewPlaceView {...newProps} locale={locale} />
      </CreatorHomeView>,
    );
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${m.newPlace}</h1>`));
    expect(html).toMatch(new RegExp(`href="/${locale}/creator"[^>]*>${m.cancel}</a>`));
    expect(html).not.toContain(m.whatToDo);
  },
);

it.each(["en", "ja"] as const)(
  "%s leads with plain interview labels before details and posts",
  (locale) => {
    const m = creatorMessages[locale];
    const html = renderToStaticMarkup(
      <PlaceEditorView
        {...editorProps}
        locale={locale}
        interviews={[
          { id: "finished", language: "ja", status: "done", isMock: true },
          { id: "pending", language: "en", status: "consent_pending", isMock: false },
        ]}
      />,
    );
    expect(html.indexOf(m.ownerInterview)).toBeLessThan(html.indexOf(m.details));
    expect(html.indexOf(m.details)).toBeLessThan(html.indexOf(`id="posts"`));
    expect(html).toContain(
      m.interviewLabel
        .replace("{language}", m.interviewJapanese)
        .replace("{status}", m.interviewFinished),
    );
    expect(html).not.toContain("(ja)");
    expect(html).toContain(m.startInterview);
    expect(html.match(new RegExp(`>${m.saveDetails}</button>`, "g"))).toHaveLength(1);
  },
);

it("hides post fields until Add a post, preserves all fields and submits explicitly", () => {
  const onAddPost = vi.fn();
  const render = mountView(PlaceEditorView, { ...editorProps, onAddPost });
  const before = renderToStaticMarkup(render());
  expect(before).toContain('aria-expanded="false"');
  expect(before).not.toContain(creatorMessages.en.url);
  click(render(), "Add a post");
  const tree = render();
  const html = renderToStaticMarkup(tree);
  for (const key of ["url", "title", "note", "noteLang", "authorHandle", "authorUrl"] as const)
    expect(html).toContain(creatorMessages.en[key]);
  expect(html).toContain(creatorMessages.en.authorHint);
  expect(html).toContain('aria-expanded="true"');
  expect(html.indexOf("Mock source note")).toBeLessThan(html.indexOf(creatorMessages.en.url));
  const form = elements(tree).find(
    (item) => item.type === "form" && item.props.id === "test-view-post-form",
  )!;
  (form.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: vi.fn() });
  expect(onAddPost).toHaveBeenCalledOnce();
});

it("shows a pin preview without coordinates and opens the shared picker only on Move the pin", () => {
  const pin = { lat: 32.7396, lng: 129.8697 };
  const onSavePin = vi.fn();
  const render = mountView(PlaceEditorView, {
    ...editorProps,
    draft: { ...editorProps.draft, pin },
    onSavePin,
  });
  const before = renderToStaticMarkup(render());
  expect(before).toContain("Pin placed");
  expect(before).not.toContain(String(pin.lat));
  expect(before).not.toContain(String(pin.lng));
  expect(before).not.toContain("Find a place");
  click(render(), "Move the pin");
  const after = render();
  expect(element(after, PlacePinSearch)).toBeDefined();
  expect(onSavePin).not.toHaveBeenCalled();
  click(after, "Save pin");
  expect(onSavePin).toHaveBeenCalledOnce();
});

it.each(["suggestion", "location", "maps link"])(
  "%s recentres at zoom 17 without changing the person's pin",
  async (method) => {
    const point = { lat: 32.75, lng: 129.87 };
    const onChange = vi.fn();
    const props = { ...newProps, locale: "en" as const, onChange, prefillNames: true };
    const render = mountView(PlacePinSearch, props);
    const tree = render();
    if (method === "suggestion") {
      element<{ actions: NewPlaceViewProps["searchActions"] }>(
        tree,
        GeoSearchView,
      ).props.actions.onSelect({
        ...point,
        name: "Mock shop",
        provider: "nominatim",
        attribution: ["© OpenStreetMap contributors"],
      });
    } else if (method === "location") {
      vi.stubGlobal("navigator", {
        geolocation: {
          getCurrentPosition: (success: (value: unknown) => void) =>
            success({ coords: { latitude: point.lat, longitude: point.lng } }),
        },
      });
      await click(tree, "Use my location");
    } else {
      const mapsLink = elements(tree).find((item) => "onSuggestion" in item.props)!;
      (mapsLink.props.onSuggestion as (suggestion: typeof point) => void)(point);
    }
    const picker = element<Parameters<typeof PinPicker>[0]>(render(), PinPicker);
    expect(picker.props.center).toEqual(point);
    const pinRender = mountView(PinPicker, picker.props);
    const map = element<Parameters<typeof PlaceMap>[0]>(pinRender(), PlaceMap);
    expect(map.props.center).toEqual({ ...point, zoom: 17 });
    expect(map.props.picker?.value).toBe(newProps.draft.pin);
    for (const [draft] of onChange.mock.calls) expect(draft.pin).toBe(newProps.draft.pin);
    expect(props.searchActions.onConfirm).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(pinRender())).toContain(
      "Now tap the shop&#x27;s entrance on the map",
    );
  },
);

it("Put the pin here is the map's centre button, and only the person's action sets the pin", () => {
  const onChange = vi.fn();
  const render = mountView(PinPicker, { ...newProps, onChange });
  const picker = element<Parameters<typeof PlaceMap>[0]>(render(), PlaceMap).props.picker!;
  // PlaceMap renders the crosshair and the button for this label (tested in place-ui.test.tsx).
  expect(picker.centreLabel).toBe("ここにピンを置く");
  expect(onChange).not.toHaveBeenCalled();
  const liveCentre = { lat: 32.750123, lng: 129.871234 };
  picker.onChange(liveCentre);
  expect(onChange).toHaveBeenCalledWith(liveCentre);
});

function invokeComponent(node: ReactNode): ReactNode {
  if (!isValidElement<Record<string, unknown>>(node) || typeof node.type !== "function")
    throw new Error("Expected a component");
  return (node.type as (props: Record<string, unknown>) => ReactNode)(node.props);
}

function editorContainer() {
  const place = {
    _id: "mock-place",
    slug: "mock-place",
    regionId: region.id,
    kind: "business",
    category: "cafe",
    names: newProps.draft.names,
    pin: { lat: 32.75, lng: 129.87 },
    canManage: true,
    canEdit: true,
    isMock: true,
  };
  vi.mocked(useQuery).mockImplementation((...args: Parameters<typeof useQuery>) => {
    const reference = args[0];
    switch (getFunctionName(reference)) {
      case "ids:normalize":
        return place._id;
      case "places:get":
        return place;
      case "sources:listForPlace":
      case "interviews:listForPlace":
        return [];
      default:
        throw new Error(`Unexpected query ${getFunctionName(reference)}`);
    }
  });
  const mutations = new Map<
    string,
    ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<undefined>>>
  >();
  vi.mocked(useMutation).mockImplementation((reference) => {
    const name = getFunctionName(reference);
    if (!mutations.has(name))
      mutations.set(
        name,
        vi.fn<(...args: unknown[]) => Promise<undefined>>().mockResolvedValue(undefined),
      );
    return Object.assign(mutations.get(name)!, { withOptimisticUpdate: vi.fn() });
  });
  const render = mountView(
    () =>
      invokeComponent(
        invokeComponent(
          invokeComponent(<PlaceEditorGate locale="en" region={region} placeId={place._id} />),
        ),
      ),
    {},
  );
  const current = () => element<PlaceEditorViewProps>(render(), PlaceEditorView).props;
  current();
  return { current, mutations, place };
}

it.each(["unchanged", "names", "category", "clear category", "both"])(
  "details Save calls only changed mutations: %s",
  async (change) => {
    const { current, mutations, place } = editorContainer();
    const draft = current().draft;
    current().onChange({
      ...draft,
      names:
        change === "names" || change === "both"
          ? draft.names.map((name) => ({ ...name, value: "Changed mock name" }))
          : draft.names,
      category:
        change === "category" || change === "both"
          ? "bar"
          : change === "clear category"
            ? undefined
            : draft.category,
    });
    current().onSaveDetails();
    await vi.waitFor(() => expect(current().pending).toBeUndefined());
    const names = mutations.get("places:updateNames")!;
    const category = mutations.get("places:setCategory")!;
    expect(names).toHaveBeenCalledTimes(change === "names" || change === "both" ? 1 : 0);
    expect(category).toHaveBeenCalledTimes(
      ["category", "clear category", "both"].includes(change) ? 1 : 0,
    );
    if (change === "clear category")
      expect(category).toHaveBeenCalledWith({ placeId: place._id, clear: true });
    expect(mutations.get("places:movePin")).not.toHaveBeenCalled();
  },
);

it("details Save still rejects a missing name before any mutation", () => {
  const { current, mutations } = editorContainer();
  current().onChange({ ...current().draft, names: [] });
  current().onSaveDetails();
  expect(current().errors?.names).toBe("no_name");
  for (const mutation of mutations.values()) expect(mutation).not.toHaveBeenCalled();
});
