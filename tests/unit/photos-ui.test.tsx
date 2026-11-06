import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddStory, type AddStoryActions } from "@/components/place/add-story";
import { PhotoPicker, type PhotoPickerActions } from "@/components/place/photo-picker";
import { StoryFeed } from "@/components/place/story-feed";
import { StoryPhotos, type StoryPhotoLike } from "@/components/place/story-photos";
import { toStoryFeed, type WrittenStoryLike } from "@/components/public/mapping";
import { WaitingPhotosView, type WaitingPhotosProps } from "@/components/steward/waiting-photos";
import { photoMessages } from "@/lib/i18n/messages/photos";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { region } from "../fixtures/public-ui";

const BASE = "https://photos.fictional.example";
const FAR_FUTURE = Date.UTC(2099, 0, 1);

/** As it reaches the page, where React escapes the apostrophe. */
const onPage = (text: string) => text.replaceAll("'", "&#x27;");

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
    useId: () => (hooks.current ? "story" : react.useId()),
  };
});
afterEach(() => {
  hooks.current = undefined;
});

const picker = (fields: Partial<PhotoPickerActions> = {}): PhotoPickerActions => ({
  maxPerStory: 4,
  waitsUntil: null,
  upload: async () => ({ photoId: "p", width: 10, height: 10 }),
  remove: async () => null,
  ...fields,
});

const actions = (fields: Partial<AddStoryActions> = {}): AddStoryActions => ({
  signedIn: true,
  add: async () => null,
  write: async () => null,
  preview: async () => ({ outcome: "unread" }),
  draftNote: async () => ({ note: null }),
  ...fields,
});

function walk(node: ReactNode, visit: (element: ReactElement) => void) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    visit(child);
    walk((child.props as { children?: ReactNode }).children, visit);
  });
}

/** Opens the write form with a harness that keeps state between renders, then finds the picker. */
function writeForm(add: AddStoryActions) {
  hooks.current = { values: [], cursor: 0 };
  const draw = () => {
    hooks.current!.cursor = 0;
    return AddStory({ locale: "en", region, actions: add });
  };
  let writeButton: ReactElement<{ onClick: () => void }> | undefined;
  walk(draw(), (element) => {
    const props = element.props as { children?: unknown };
    if (props.children === addStoryMessages.en.write)
      writeButton = element as ReactElement<{ onClick: () => void }>;
  });
  writeButton!.props.onClick();
  const tree = draw();
  const pickers: ReactElement[] = [];
  walk(tree, (element) => {
    if (element.type === PhotoPicker) pickers.push(element);
  });
  return { draw, tree, pickers };
}

describe("the photo control on the form", () => {
  it("does not exist when this member can't add photos here", () => {
    expect(writeForm(actions()).pickers).toEqual([]);
  });

  it("shows when the server says they can", () => {
    expect(writeForm(actions({ photos: picker() })).pickers).toHaveLength(1);
  });

  it.each([
    ["en", "Photos are shown publicly with your name"],
    ["en", "Add only photos you took"],
    ["en", "Ask people before showing their faces"],
    ["ja", "写真はあなたの名前とともに公開されます"],
    ["ja", "自分で撮った写真だけを追加してください"],
    ["ja", "公開する前に本人に確認してください"],
  ] as const)("says the rules in %s: %s", (locale, words) => {
    const html = render(<PhotoPicker locale={locale} actions={picker()} onChange={() => {}} />);
    expect(html).toContain(words);
  });

  it("offers the phone's photo chooser", () => {
    const html = render(<PhotoPicker locale="en" actions={picker()} onChange={() => {}} />);
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain("multiple");
    expect(html).toContain(photoMessages.en.add);
    expect(html).toContain("Up to 4 photos.");
  });

  it("tells a new member a steward looks first, and no one else", () => {
    const newcomer = render(
      <PhotoPicker locale="en" actions={picker({ waitsUntil: FAR_FUTURE })} onChange={() => {}} />,
    );
    expect(newcomer).toContain(onPage(photoMessages.en.waitNotice));
    for (const waitsUntil of [null, Date.UTC(2020, 0, 1)]) {
      const html = render(
        <PhotoPicker locale="en" actions={picker({ waitsUntil })} onChange={() => {}} />,
      );
      expect(html).not.toContain(onPage(photoMessages.en.waitNotice));
    }
  });
});

describe("sharing a story with photos", () => {
  function setPhotos(form: ReturnType<typeof writeForm>, photoIds: string[], busy = false) {
    const onChange = (form.pickers[0]!.props as { onChange: (d: unknown) => void }).onChange;
    onChange({ photoIds, busy });
  }
  function typeBody(form: ReturnType<typeof writeForm>, body: string) {
    walk(form.draw(), (element) => {
      if (element.type === "textarea")
        (element.props as { onChange: (e: unknown) => void }).onChange({ target: { value: body } });
    });
  }
  function submitForm(form: ReturnType<typeof writeForm>) {
    walk(form.draw(), (element) => {
      if (element.type === "form")
        (element.props as { onSubmit: (e: unknown) => void }).onSubmit({
          preventDefault: () => {},
        });
    });
  }

  it("sends the finished photos with the words", async () => {
    const write = vi.fn(async () => null);
    const form = writeForm(actions({ write, photos: picker() }));
    typeBody(form, "A story.");
    setPhotos(form, ["a", "b"]);
    submitForm(form);
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(write).toHaveBeenCalledWith({ body: "A story.", lang: "en", photoIds: ["a", "b"] });
  });

  it("sends no photo field when none were added, as before", async () => {
    const write = vi.fn(async () => null);
    const form = writeForm(actions({ write, photos: picker() }));
    typeBody(form, "A story.");
    submitForm(form);
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(write).toHaveBeenCalledWith({ body: "A story.", lang: "en" });
  });

  it("waits while a photo is still uploading", async () => {
    const write = vi.fn(async () => null);
    const form = writeForm(actions({ write, photos: picker() }));
    typeBody(form, "A story.");
    setPhotos(form, ["a"], true);
    submitForm(form);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps the words required when photos are ready", async () => {
    const write = vi.fn(async () => null);
    const form = writeForm(actions({ write, photos: picker() }));
    setPhotos(form, ["a"]);
    submitForm(form);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(write).not.toHaveBeenCalled();
  });
});

const photo = (fields: Partial<StoryPhotoLike> = {}): StoryPhotoLike => ({
  _id: "photo1",
  key: "photos/abc.jpg",
  width: 2048,
  height: 1536,
  waiting: false,
  canRemove: false,
  ...fields,
});

const written = (fields: Partial<WrittenStoryLike> = {}): WrittenStoryLike => ({
  _id: "written",
  body: "坂の途中で猫が昼寝していた。",
  lang: "ja",
  authorName: "Fictional walker",
  addedAt: Date.UTC(2026, 9, 2),
  isMock: false,
  canRemove: false,
  ...fields,
});

describe("photos on a story card", () => {
  const card = (photos: StoryPhotoLike[], locale: "en" | "ja" = "en", authorName = "Ayako") =>
    render(<StoryPhotos locale={locale} photos={photos} baseUrl={BASE} authorName={authorName} />);

  it("loads lazily, with fixed dimensions, a served address built from the key, and alt text", () => {
    const html = card([photo()]);
    expect(html).toContain(`src="${BASE}/photos/abc.jpg"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="2048"');
    expect(html).toContain('height="1536"');
    expect(html).toContain("aspect-[4/3]");
    expect(html).toContain(
      `alt="${onPage(photoMessages.en.alt.replace("{number}", "1").replace("{name}", "Ayako"))}"`,
    );
  });

  it("gives every photo alt text in Japanese, and when the writer has no name", () => {
    expect(card([photo()], "ja")).toContain('alt="Ayakoさんの話の写真 1"');
    expect(card([photo()], "en", "")).toContain('alt="Photo 1 from this story"');
  });

  it("numbers several photos and puts them in two columns for a phone", () => {
    const html = card([photo(), photo({ _id: "photo2", key: "photos/def.jpg" })]);
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("Photo 2 from");
    expect(card([photo()])).not.toContain("grid-cols-2");
  });

  it("marks a waiting photo for the writer who can see it", () => {
    expect(card([photo({ waiting: true })])).toContain(onPage(photoMessages.en.waiting));
    expect(card([photo()])).not.toContain(onPage(photoMessages.en.waiting));
  });

  it("offers removal only when the server says this viewer may, and an action exists", () => {
    const remove = async () => null;
    const shown = (fields: Partial<StoryPhotoLike>, send?: typeof remove) =>
      render(
        <StoryPhotos
          locale="en"
          photos={[photo(fields)]}
          baseUrl={BASE}
          authorName="Ayako"
          remove={send}
        />,
      );
    expect(shown({ canRemove: true }, remove)).toContain(photoMessages.en.remove);
    expect(shown({ canRemove: false }, remove)).not.toContain(photoMessages.en.remove);
    expect(shown({ canRemove: true })).not.toContain(photoMessages.en.remove);
  });

  it("shows no number, star or score", () => {
    const html = card([photo()]);
    expect(html).not.toMatch(/star|rating|score|★/i);
  });
});

describe("the story feed", () => {
  const feed = (story: WrittenStoryLike, photoBaseUrl?: string) =>
    render(
      <StoryFeed
        locale="en"
        entries={toStoryFeed([], [story], false)}
        scriptOrigins={[]}
        frameOrigins={[]}
        photoBaseUrl={photoBaseUrl}
      />,
    );

  it("shows a story's photos while photos are on", () => {
    expect(feed(written({ photos: [photo()] }), BASE)).toContain(`${BASE}/photos/abc.jpg`);
  });

  it("shows no image while photos are off, even with photos on the story", () => {
    expect(feed(written({ photos: [photo()] }))).not.toContain("<img");
  });

  it("looks as before for a story with no photos", () => {
    const html = feed(written(), BASE);
    expect(html).not.toContain("<img");
    expect(html).toBe(feed(written()));
  });
});

describe("the steward's waiting section", () => {
  const props = (fields: Partial<WaitingPhotosProps> = {}): WaitingPhotosProps => ({
    locale: "en",
    rows: [
      {
        id: "photo1",
        url: `${BASE}/photos/abc.jpg`,
        width: 2048,
        height: 1536,
        authorName: "Ayako",
        storyBody: "The cat on the steps.",
        placeName: "Fictional Cafe",
        placeHref: "/en/places/fictional-cafe",
      },
    ],
    removalsFailing: 0,
    onApprove: () => {},
    onRemove: () => {},
    ...fields,
  });

  it("shows the photo, whose it is, where, the words and both choices", () => {
    const html = render(<WaitingPhotosView {...props()} />);
    expect(html).toContain(`${BASE}/photos/abc.jpg`);
    expect(html).toContain("Ayako");
    expect(html).toContain("Fictional Cafe");
    expect(html).toContain("The cat on the steps.");
    expect(html).toContain(photoMessages.en.approve);
    expect(html).toContain(photoMessages.en.reject);
    expect(html).toContain('loading="lazy"');
  });

  it("says when nothing waits", () => {
    expect(render(<WaitingPhotosView {...props({ rows: [] })} />)).toContain(
      photoMessages.en.waitingEmpty,
    );
  });

  it("warns only when a deletion is failing", () => {
    const warning = "could not be deleted from storage yet";
    expect(render(<WaitingPhotosView {...props()} />)).not.toContain(warning);
    expect(render(<WaitingPhotosView {...props({ removalsFailing: 3 })} />)).toContain(
      `3 removed photos ${warning}`,
    );
  });

  it("the buttons wait while something is pending", () => {
    expect(render(<WaitingPhotosView {...props({ pending: "approve:photo1" })} />)).toContain(
      "disabled",
    );
  });
});

describe("the wording", () => {
  it("every string exists in both languages", () => {
    expect(Object.keys(photoMessages.ja).sort()).toEqual(Object.keys(photoMessages.en).sort());
  });

  it("avoids dashes and any word that scores a place", () => {
    for (const table of [photoMessages.en, photoMessages.ja]) {
      for (const text of Object.values(table)) {
        expect(text).not.toMatch(/[–—]/);
        expect(text).not.toMatch(/\b(star|rating|score|rank)\b/i);
      }
    }
  });
});
