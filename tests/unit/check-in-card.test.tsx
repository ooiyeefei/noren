import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CheckInCard,
  judgeReading,
  type CheckInActions,
  type CheckInOutcome,
  type CheckInSpot,
} from "@/components/collection/check-in-card";
import { CheckInResult } from "@/components/collection/check-in-result";
import { Noren } from "@/components/collection/noren";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import type { SetLike } from "@/components/collection/next-panel-card";
import { region } from "../fixtures/public-ui";

// The card runs without a DOM; this harness keeps its state between calls and drives its handlers.
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
      if (!(index in state.values)) state.values[index] = initial;
      return [
        state.values[index],
        (value: unknown) => {
          state.values[index] = value;
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
  };
});
afterEach(() => {
  hooks.current = undefined;
});

const pin = { lat: 32.7415, lng: 129.8755 };
const reach = { checkInMetres: 50, accuracyAllowanceMetres: 30 };
const spot: CheckInSpot = {
  neighbourhoodId: "shinchi",
  setNames: { ja: "新地中華街", en: "Shinchi" },
  panelIndex: 2,
  panelCount: 6,
  visited: false,
  panelDyed: false,
  dyedPanels: [0],
  pickedLine: null,
};
const dyedOutcome: CheckInOutcome = {
  outcome: "dyed",
  panelIndex: 2,
  dyedCount: 2,
  panelCount: 6,
  finished: false,
};
const nearby = (name: string, lat: number) => ({
  placeId: name,
  slug: name,
  names: [{ lang: "en", script: "latin" as const, value: name, isPrimary: true }],
  pin: { lat, lng: pin.lng },
  line: null,
});
const set: SetLike = {
  neighbourhoodId: "shinchi",
  names: spot.setNames,
  panelCount: 6,
  center: pin,
  finished: false,
  finishedOn: null,
  wholeArtUrl: null,
  lastVisitedPlaceId: null,
  panels: [0, 1, 2, 3, 4, 5].map((index) => ({
    index,
    dyed: index === 0 || index === 2,
    artUrl: index === 0 || index === 2 ? `https://art.test/${index}.png` : null,
    places: [nearby(`Place ${index}`, pin.lat + index * 0.001)],
  })),
};
const actions = (over: Partial<CheckInActions> = {}): CheckInActions => ({
  signedIn: true,
  locate: async () => ({ kind: "read", ...pin, accuracy: 10 }),
  checkIn: async () => dyedOutcome,
  writeLine: async () => null,
  stillHere: async () => null,
  ...over,
});

function card(over: Partial<Parameters<typeof CheckInCard>[0]> = {}) {
  return (
    <CheckInCard
      locale="en"
      region={region}
      slug="a-shop"
      pin={pin}
      spot={spot}
      set={set}
      actions={actions()}
      {...over}
    />
  );
}

/** Renders the card with kept state, and returns its markup and a way to press "I'm here". */
function mount(props: Partial<Parameters<typeof CheckInCard>[0]> = {}) {
  hooks.current = { values: [], cursor: 0 };
  const draw = () => {
    hooks.current!.cursor = 0;
    return CheckInCard(card(props).props);
  };
  return {
    draw,
    async press() {
      const button = findButton(draw());
      button.props.onClick();
      await vi.waitFor(() => expect(hooks.current!.values[1]).toBeDefined());
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function findButton(node: ReactNode): ReactElement<{ onClick(): void }> {
  const found: ReactElement<{ onClick(): void }>[] = [];
  const walk = (current: ReactNode) => {
    Children.forEach(current, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as { "data-im-here"?: string; children?: ReactNode };
      if (props["data-im-here"] !== undefined) found.push(child as never);
      walk(props.children);
    });
  };
  walk(node);
  if (!found[0]) throw new Error("no I'm here button");
  return found[0];
}

const metresNorth = (metres: number) => pin.lat + metres / 111_195;

describe("judgeReading", () => {
  it("passes within the limit, with the phone's error helping up to the allowance", () => {
    const read = (metres: number, accuracy: number) =>
      judgeReading({ kind: "read", lat: metresNorth(metres), lng: pin.lng, accuracy }, pin, reach);
    expect(read(40, 5).kind).toBe("near");
    expect(read(79, 30).kind).toBe("near");
    expect(read(79, 500).kind).toBe("near");
    expect(read(85, 30)).toEqual({ kind: "far", metres: 85 });
  });

  it("passes a failed reading through by name", () => {
    expect(judgeReading({ kind: "denied" }, pin, reach)).toEqual({ kind: "denied" });
    expect(judgeReading({ kind: "timeout" }, pin, reach)).toEqual({ kind: "timeout" });
  });
});

describe("CheckInCard", () => {
  it("says which panel a place gives before anyone goes there", () => {
    const html = render(card());
    expect(html).toContain("Gives panel 3 of Shinchi&#x27;s noren");
    expect(html).toContain("I&#x27;m here");
    expect(html).toContain("It keeps only the place and the date.");
  });

  it("asks a signed-out person to sign in and returns them to the same place", () => {
    const html = render(card({ actions: actions({ signedIn: false }) }));
    expect(html).not.toContain("data-im-here");
    expect(html).toContain("/en/sign-in?redirect_url=%2Fen%2Fplaces%2Fa-shop");
    expect(html).toContain("invite-only");
  });

  it("shows no button until sign-in has settled", () => {
    expect(render(card({ actions: actions({ signedIn: undefined }) }))).not.toContain(
      "data-im-here",
    );
  });

  it("offers a stamp when another place already dyed this panel", () => {
    expect(render(card({ spot: { ...spot, panelDyed: true } }))).toContain("already yours");
  });

  it("reads no location and shows no button on a place already visited", () => {
    const html = render(card({ spot: { ...spot, visited: true, panelDyed: true } }));
    expect(html).not.toContain("data-im-here");
    expect(html).toContain("You&#x27;ve been here.");
    expect(html).toContain("data-next-panel");
  });

  it("still shows what people mention on a place already visited", () => {
    const picked = { en: "Try the toast.", ja: "トースト。", postsRead: 4 };
    const html = render(card({ spot: { ...spot, visited: true, pickedLine: picked } }));
    expect(html).toContain("Try the toast.");
    expect(html).toContain("AI can still misread them");
  });

  it("reads the location only on a press", () => {
    const locate = vi.fn(actions().locate);
    render(card({ actions: actions({ locate }) }));
    expect(locate).not.toHaveBeenCalled();
  });

  it.each([
    ["denied", "Turn location on for this site"],
    ["unavailable", "Step outside or nearer the door"],
    ["timeout", "Step outside or nearer the door"],
    ["unsupported", "phone&#x27;s own browser"],
  ] as const)("records nothing when the reading is %s, and says what to do", async (kind, text) => {
    const checkIn = vi.fn(actions().checkIn);
    const { draw, press } = mount({
      actions: actions({ locate: async () => ({ kind }), checkIn }),
    });
    await press();
    expect(checkIn).not.toHaveBeenCalled();
    expect(render(draw())).toContain(text);
  });

  it("records nothing from too far away, and says how far and how near to come", async () => {
    const checkIn = vi.fn(actions().checkIn);
    const { draw, press } = mount({
      actions: actions({
        locate: async () => ({ kind: "read", lat: metresNorth(240), lng: pin.lng, accuracy: 10 }),
        checkIn,
      }),
    });
    await press();
    expect(checkIn).not.toHaveBeenCalled();
    expect(render(draw())).toContain("You are 240 m from this place. Come within 50 m");
  });

  it("sends only which place, with nothing from the reading", async () => {
    const checkIn = vi.fn(actions().checkIn);
    const { press } = mount({ actions: actions({ checkIn }) });
    await press();
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn).toHaveBeenCalledWith();
  });

  it("shows the result once the check-in passes", async () => {
    const { draw, press } = mount();
    await press();
    expect((draw() as ReactElement).type).toBe(CheckInResult);
  });

  it("shows the error when the check-in itself fails", async () => {
    const { draw, press } = mount({
      actions: actions({ checkIn: () => Promise.reject(new Error("offline")) }),
    });
    await press();
    expect(render(draw())).toContain('role="alert"');
  });
});

describe("CheckInResult", () => {
  const result = (over: Partial<Parameters<typeof CheckInResult>[0]> = {}) =>
    render(
      <CheckInResult
        locale="en"
        region={region}
        outcome={dyedOutcome}
        pin={pin}
        spot={spot}
        set={set}
        setHref="/en/collection/shinchi"
        displayName="Hana"
        actions={actions()}
        {...over}
      />,
    );

  it("keeps the order: panel, what people mention, what you had, still here, next panel", () => {
    const html = result({
      spot: { ...spot, pickedLine: { en: "Try the toast.", ja: "トースト。", postsRead: 4 } },
    });
    const order = [
      "Panel 3 dyed",
      "data-noren",
      "People mention",
      "What did you have?",
      "Still here?",
      "data-next-panel",
    ].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("labels a picked line as AI, and leaves the box out with no line", () => {
    const picked = { en: "Try the toast.", ja: "トースト。", postsRead: 4 };
    expect(result({ spot: { ...spot, pickedLine: picked } })).toContain(
      "Stitched by Noren&#x27;s AI from 4 posts.",
    );
    expect(result()).not.toContain("People mention");
  });

  it("says a line goes public and can be removed, beside the button", () => {
    expect(result()).toContain("Shown publicly as Hana. You can remove it any time.");
    expect(result({ displayName: undefined })).toContain(
      "Shown publicly with your name. You can remove it any time.",
    );
    expect(result()).toMatch(/aria-describedby="[^"]*-public"/);
  });

  it("shows the name first and holds the line until it is settled, since it is a share too", () => {
    const m = addStoryMessages.en;
    const shownAs = { displayName: "Hana", confirm: async () => null, save: async () => null };
    const held = result({ actions: actions({ shownAs }) });
    expect(held).toContain(`>${m.useThisName}</button>`);
    expect(held).toContain(`>${m.changeName}</button>`);
    expect(held).toMatch(
      /<button type="button" disabled=""[^>]*>Add it to this place&#x27;s page</,
    );
    const open = result();
    expect(open).not.toContain(m.useThisName);
    expect(open).not.toMatch(
      /<button type="button" disabled=""[^>]*>Add it to this place&#x27;s page</,
    );
  });

  it("can take focus at its heading, since the press removes the button", () => {
    expect(result()).toMatch(/<h2 tabindex="-1"/i);
  });

  it("leads to the whole picture on the last panel", () => {
    const html = result({ outcome: { ...dyedOutcome, finished: true, dyedCount: 6 } });
    expect(html).toContain("See the whole picture");
    expect(html).toContain('href="/en/collection/shinchi"');
    expect(html).not.toContain("data-next-panel");
  });

  it("says so when the panel was already theirs", () => {
    expect(result({ outcome: { ...dyedOutcome, outcome: "already_dyed" } })).toContain(
      "already yours",
    );
  });
});

describe("Noren", () => {
  const panels = (dyed: number[]) =>
    [0, 1, 2, 3, 4, 5].map((index) => ({
      index,
      dyed: dyed.includes(index),
      artUrl: dyed.includes(index) ? `https://art.test/${index}.png` : null,
    }));

  it("draws art only for a dyed panel, and gives progress as text", () => {
    const html = render(
      <Noren locale="en" name="Shinchi" panels={panels([1, 4])} panelCount={6} />,
    );
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html).toContain("2 of 6 panels dyed");
    expect(html).not.toContain("The finished noren");
  });

  it("describes the picture only once it is whole", () => {
    const html = render(
      <Noren locale="en" name="Shinchi" panels={panels([0, 1, 2, 3, 4, 5])} panelCount={6} />,
    );
    expect(html).toContain("The finished noren of Shinchi");
  });

  it("keeps the dye animation behind the reduced motion setting", () => {
    const html = render(
      <Noren locale="en" name="Shinchi" panels={panels([1])} panelCount={6} fresh={1} />,
    );
    expect(html).toContain("prefers-reduced-motion: no-preference");
    expect(html).toContain("data-noren-fresh");
  });
});
