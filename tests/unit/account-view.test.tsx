import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountView,
  DeletionSection,
  requestDeletion,
  type AccountActions,
  type DeletionAnswer,
  type DeletionStep,
} from "@/components/account/account-view";
import type { AccountState } from "@/components/layout/account-menu";
import type { Role } from "@/lib/domain/constants";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { accountMessages } from "@/lib/i18n/messages/account";

// The view runs without a DOM; this harness keeps its state between calls and drives its handlers.
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
  vi.restoreAllMocks();
});

const member: AccountState = {
  kind: "signedIn",
  displayName: "Aiko Tanaka",
  role: "user",
  isMock: false,
};
const noop = () => undefined;
const section = (step: DeletionStep, locale: Locale = "en", role?: Role) =>
  render(
    <DeletionSection
      locale={locale}
      step={step}
      role={role}
      onStart={noop}
      onConfirm={noop}
      onKeep={noop}
    />,
  );

type Section = Parameters<typeof DeletionSection>[0];

/** Renders the view with kept state, and returns what it would show now and how to press. */
function mount(
  over: { answers?: DeletionAnswer[]; state?: AccountState; nameSection?: ReactNode } = {},
) {
  hooks.current = { values: [], cursor: 0 };
  const answers = [...(over.answers ?? ["deleted"])];
  const actions = {
    deleteAccount: vi.fn(async () => answers.shift() ?? "failed"),
    leave: vi.fn(async () => undefined),
  } satisfies AccountActions;
  const view = { state: over.state ?? member };
  const draw = () => {
    hooks.current!.cursor = 0;
    return AccountView({
      locale: "en",
      state: view.state,
      actions,
      nameSection: over.nameSection,
    });
  };
  const current = (): ReactElement<Section> => {
    const found: ReactElement<Section>[] = [];
    const walk = (node: ReactNode) => {
      Children.forEach(node, (child) => {
        if (!isValidElement(child)) return;
        if (child.type === DeletionSection) found.push(child as ReactElement<Section>);
        walk((child.props as { children?: ReactNode }).children);
      });
    };
    walk(draw());
    if (!found[0]) throw new Error("no deletion section");
    return found[0];
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { actions, draw, current, settle, view };
}

describe("DeletionSection", () => {
  it.each(SUPPORTED_LOCALES)(
    "says what goes and what stays before anything is pressed (%s)",
    (locale) => {
      const m = accountMessages[locale];
      const html = section("idle", locale);
      for (const line of [
        m.deleteIntro,
        m.goesTitle,
        m.goesName,
        m.goesCollection,
        m.goesStories,
        m.goesChecks,
        m.goesLinks,
        m.staysTitle,
        m.staysPlaces,
        m.staysLinks,
        m.staysLog,
        m.deleteButton,
      ])
        expect(html).toContain(line.replaceAll("'", "&#x27;"));
      expect(html).not.toContain("data-delete-confirm");
    },
  );

  it.each(SUPPORTED_LOCALES)(
    "asks once more, still showing what goes and what stays (%s)",
    (locale) => {
      const m = accountMessages[locale];
      const html = section("confirming", locale);
      expect(html).toContain(m.confirmQuestion.replaceAll("'", "&#x27;"));
      expect(html).toContain(m.confirmYes);
      expect(html).toContain(m.confirmNo);
      expect(html).toContain(m.goesName);
      expect(html).toContain(m.staysPlaces);
      expect(html).toContain('role="alert"');
      expect(html).not.toContain("data-delete-start");
      // The safe choice takes the focus. React sets it on mount, so the markup shows only the order.
      expect(html.indexOf("data-delete-confirm")).toBeLessThan(html.indexOf("data-delete-keep"));
    },
  );

  it("names no outside service on the page", () => {
    for (const locale of SUPPORTED_LOCALES)
      for (const text of Object.values(accountMessages[locale]))
        expect(text).not.toMatch(/clerk|convex|vercel/i);
  });

  it.each(["creator", "business_owner"] as const)(
    "shows a %s who to ask, and no way to delete",
    (role) => {
      const html = section("idle", "en", role);
      expect(html).toContain("A steward deletes this account");
      expect(html).toContain('href="/en/takedown?page=%2Fen%2Faccount"');
      expect(html).not.toContain("data-delete-start");
      expect(html).not.toContain("data-delete-confirm");
    },
  );

  it("shows a steward to ask another steward, and no way to delete", () => {
    const html = section("idle", "ja", "steward");
    expect(html).toContain(accountMessages.ja.askOtherSteward);
    expect(html).not.toContain(accountMessages.ja.askSteward);
    expect(html).not.toContain("data-delete-start");
    expect(html).not.toContain("data-delete-confirm");
  });

  it("offers the button again after the sign-in step failed, and says what is already gone", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const html = section("clerk_failed", locale);
      expect(html).toContain(accountMessages[locale].clerkFailed.replaceAll("'", "&#x27;"));
      expect(html).toContain(accountMessages[locale].tryAgain);
      expect(html).toContain("data-delete-again");
    }
  });

  it("offers the button again after any other failure", () => {
    const html = section("failed");
    expect(html).toContain("may not be fully deleted");
    expect(html).toContain("data-delete-again");
  });

  it("explains a refusal with who to ask", () => {
    const html = section("refused");
    expect(html).toContain("A steward deletes this account");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("data-delete-again");
  });

  it("asks someone whose session ended to sign in", () => {
    const html = section("signed_out");
    expect(html).toContain("You&#x27;re signed out");
    expect(html).toContain('href="/en/sign-in"');
  });

  it("tells them it is done, with a way on if the page doesn't move", () => {
    const html = section("deleted");
    expect(html).toContain("Your account is deleted");
    expect(html).toContain('href="/en/welcome"');
  });
});

describe("AccountView", () => {
  it("needs two presses: the first only asks", async () => {
    const { actions, current } = mount();
    expect(current().props.step).toBe("idle");

    current().props.onStart();

    expect(current().props.step).toBe("confirming");
    expect(actions.deleteAccount).not.toHaveBeenCalled();
  });

  it("keeps the account when they say so", () => {
    const { actions, current } = mount();
    current().props.onStart();

    current().props.onKeep();

    expect(current().props.step).toBe("idle");
    expect(actions.deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes on the second press, then signs out and leaves", async () => {
    const { actions, current, settle } = mount();
    current().props.onStart();

    current().props.onConfirm();
    expect(current().props.step).toBe("deleting");
    await settle();

    expect(current().props.step).toBe("deleted");
    expect(actions.deleteAccount).toHaveBeenCalledOnce();
    expect(actions.leave).toHaveBeenCalledOnce();
  });

  it("sends one request however many times the button is pressed", async () => {
    const { actions, current, settle } = mount();
    const { onConfirm } = current().props;
    onConfirm();
    onConfirm();
    await settle();
    expect(actions.deleteAccount).toHaveBeenCalledOnce();
  });

  it("keeps a way to press again after the Clerk step fails, though the person's row is gone", async () => {
    const { actions, current, settle, view } = mount({ answers: ["clerk_failed", "deleted"] });
    current().props.onConfirm();
    // Deletion emptied the row, so people.current now reads null and the container says settingUp.
    view.state = { kind: "settingUp" };
    await settle();

    expect(current().props.step).toBe("clerk_failed");
    expect(actions.leave).not.toHaveBeenCalled();

    current().props.onConfirm();
    await settle();

    expect(actions.deleteAccount).toHaveBeenCalledTimes(2);
    expect(current().props.step).toBe("deleted");
    expect(actions.leave).toHaveBeenCalledOnce();
  });

  it("does not sign out on a refusal or a failure", async () => {
    for (const answer of ["refused", "failed", "signed_out"] as const) {
      const { actions, current, settle } = mount({ answers: [answer] });
      current().props.onConfirm();
      await settle();
      expect(current().props.step).toBe(answer);
      expect(actions.leave).not.toHaveBeenCalled();
    }
  });

  it("renders the name section above deletion while the account stands", () => {
    const { draw, current } = mount({ nameSection: <p>Name control</p> });
    const html = render(draw());
    expect(html).toContain("Name control");
    expect(html.indexOf("Name control")).toBeLessThan(html.indexOf("delete-account"));
    current().props.onStart();
    expect(render(draw())).toContain("Name control");
  });

  it("drops the name section once deletion has started", async () => {
    const { draw, current, settle } = mount({
      nameSection: <p>Name control</p>,
      answers: ["clerk_failed"],
    });
    current().props.onConfirm();
    await settle();
    expect(render(draw())).not.toContain("Name control");
  });

  it("renders without a name section", () => {
    const { draw } = mount();
    expect(render(draw())).toContain("delete-account");
  });

  it("shows the sign-in link before it knows who this is", () => {
    const { draw } = mount({ state: { kind: "signedOut" } });
    const html = render(draw());
    expect(html).toContain('href="/en/sign-in"');
    expect(html).not.toContain("delete-account");
  });
});

describe("requestDeletion", () => {
  const answering = (status: number, body?: unknown) =>
    vi.fn(
      async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
    ) as unknown as typeof fetch;

  it("posts to the route", async () => {
    const send = answering(200, { ok: true });
    expect(await requestDeletion(send)).toBe("deleted");
    expect(send).toHaveBeenCalledExactlyOnceWith("/api/account/delete", { method: "POST" });
  });

  it.each([
    [401, { error: { code: "unauthenticated" } }, "signed_out"],
    [403, { error: { code: "forbidden" } }, "refused"],
    [502, { error: { code: "clerk_failed" } }, "clerk_failed"],
    [500, { error: { code: "internal" } }, "failed"],
  ] as const)("reads %i as what it means", async (status, body, answer) => {
    expect(await requestDeletion(answering(status, body))).toBe(answer);
  });

  it("does not take a page some redirect ended at for a deleted account", async () => {
    const send = vi.fn(
      async () => new Response("<html>Sign in</html>", { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await requestDeletion(send)).toBe("failed");
    expect(await requestDeletion(answering(200, { something: "else" }))).toBe("failed");
  });

  it("does not mistake a gateway's own 502 for the Clerk step", async () => {
    const send = vi.fn(
      async () => new Response("<html>Bad Gateway</html>", { status: 502 }),
    ) as unknown as typeof fetch;
    expect(await requestDeletion(send)).toBe("failed");
  });

  it("counts no answer at all as a failure, and logs the error's name", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(noop);
    const send = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    expect(await requestDeletion(send)).toBe("failed");

    expect(logged.mock.calls.flat().join(" ")).toContain("TypeError: Failed to fetch");
  });

  it("logs something for a throw that isn't an Error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(noop);
    const send = vi.fn(async () => {
      throw "";
    }) as unknown as typeof fetch;

    expect(await requestDeletion(send)).toBe("failed");

    expect(logged.mock.calls.flat().join(" ")).toMatch(/\(\S.*\)/);
  });
});
