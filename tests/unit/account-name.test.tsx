import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountName } from "@/components/account/account-name";
import { format, messagesFor, SUPPORTED_LOCALES } from "@/lib/i18n";
import { accountMessages } from "@/lib/i18n/messages/account";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";

// The control runs without a DOM; this harness keeps its state between calls and drives its handlers.
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

const m = messagesFor(addStoryMessages, "en");

type Props = Record<string, unknown> & { children?: ReactNode };
function all(node: ReactNode, found: ReactElement<Props>[] = []): ReactElement<Props>[] {
  Children.forEach(node, (child) => {
    if (!isValidElement<Props>(child)) return;
    found.push(child);
    all(child.props.children, found);
  });
  return found;
}

function mount(save: (name: string) => Promise<unknown>) {
  const state = { values: [] as unknown[], cursor: 0 };
  hooks.current = state;
  const tree = () => {
    state.cursor = 0;
    return AccountName({ locale: "en", displayName: "Fictional Walker", save });
  };
  const button = (label: string) => {
    const found = all(tree()).find(
      (element) => element.type === "button" && element.props.children === label,
    );
    if (!found) throw new Error(`no button called ${label}`);
    return found.props as { onClick(): void };
  };
  const type = (value: string) => {
    const input = all(tree()).find((element) => element.type === "input");
    if (!input) throw new Error("no name input");
    (input.props as { onChange(event: { target: { value: string } }): void }).onChange({
      target: { value },
    });
  };
  return { button, type, html: () => render(tree()) };
}

describe("the name on the account page", () => {
  it("shows the name and says what it is for, in each language", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const html = render(
        <AccountName locale={locale} displayName="Fictional Walker" save={async () => null} />,
      );
      const words = messagesFor(addStoryMessages, locale);
      expect(html).toContain(format(words.shownAs, { name: "Fictional Walker" }));
      expect(html).toContain(render(<>{messagesFor(accountMessages, locale).nameHint}</>));
      expect(html).toContain(words.changeName);
    }
  });

  it("saves a changed name and goes back to showing it", async () => {
    const save = vi.fn(async () => null);
    const control = mount(save);
    control.button(m.changeName).onClick();
    control.type("  Another Walker  ");
    control.button(m.saveName).onClick();
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith("Another Walker"));
    await vi.waitFor(() => expect(control.html()).toContain(m.changeName));
  });

  it("refuses an email address as a name before asking the server", () => {
    const save = vi.fn(async () => null);
    const control = mount(save);
    control.button(m.changeName).onClick();
    control.type("walker@example.invalid");
    control.button(m.saveName).onClick();
    expect(save).not.toHaveBeenCalled();
    expect(control.html()).toContain(m.nameProblem);
  });

  it("keeps the form open with the error when saving fails", async () => {
    const control = mount(async () => {
      throw new Error("fictional failure");
    });
    control.button(m.changeName).onClick();
    control.type("Another Walker");
    control.button(m.saveName).onClick();
    await vi.waitFor(() => expect(control.html()).toContain('role="alert"'));
    expect(control.html()).toContain(m.saveName);
  });

  it("puts the old name back on cancel", () => {
    const control = mount(async () => null);
    control.button(m.changeName).onClick();
    control.type("Another Walker");
    control.button(m.cancel).onClick();
    expect(control.html()).toContain("Fictional Walker");
    expect(control.html()).not.toContain("<input");
  });
});
