import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddForm, Chip, fillField } from "@/components/memory/chip";
import { RemembersView, type RemembersViewProps } from "@/components/memory/remembers-view";
import {
  JAPAN_UTC_OFFSET_HOURS,
  RULE_PRESETS,
  TASTE_PRESETS,
  addRule,
  addTaste,
  addVisited,
  emptyMemory,
  learn,
  ruleFromText,
  tasteFromText,
  type Memory,
} from "@/lib/memory";

const NOON = Date.UTC(2026, 10, 10, 3, 0, 0);
const clock = { now: NOON, utcOffsetHours: JAPAN_UTC_OFFSET_HOURS };

function full(): Memory {
  let memory = emptyMemory(clock);
  memory = addRule(memory, "vegetarian");
  memory = addRule(memory, "allergic to peanuts");
  memory = addRule(memory, "no alcohol");
  memory = addTaste(memory, "history", clock);
  memory = learn(memory, { category: "cafe", action: "save" }, clock);
  memory = addVisited(memory, { label: "Champon at lunch" }, clock);
  memory = addVisited(memory, { label: "Dejima", slug: "dejima-museum" }, clock);
  return memory;
}

function props(over: Partial<RemembersViewProps> = {}): RemembersViewProps {
  return {
    locale: "en",
    memory: full(),
    now: NOON,
    checkable: ["no-alcohol"],
    canKeep: true,
    onAddRule: vi.fn(),
    onRemoveRule: vi.fn(),
    onAddTaste: vi.fn(),
    onRemoveTaste: vi.fn(),
    onAddVisited: vi.fn(),
    onRemoveVisited: vi.fn(),
    onKeepVisited: vi.fn(),
    onForgetAll: vi.fn(),
    ...over,
  };
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(all)];
}
const labelOf = (node: ReactNode): string =>
  Children.toArray(node as ReactNode)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<Record<string, unknown>>(child)
          ? labelOf(child.props.children as ReactNode)
          : "",
    )
    .join("");
const buttonLabelled = (tree: ReactNode, label: string) =>
  all(tree).find(
    (el) => el.type === "button" && labelOf(el.props.children as ReactNode).trim() === label,
  );

describe("What Noren remembers", () => {
  it("shows each rule, like and trip entry as something that can be removed, with the draw's honesty about rules", () => {
    const html = render(<RemembersView {...props()} />);
    for (const label of [
      "Remove Vegetarian",
      "Remove Allergy: peanuts",
      "Remove History",
      "Remove Champon at lunch",
    ]) {
      expect(html, label).toContain(`aria-label="${label}"`);
    }
    const body = text(html);
    expect(body).toContain("Hard rules");
    // Only the rule the draw can check says so; the others say plainly that it cannot.
    expect(body).toMatch(/No alcohol Noren can check this/);
    expect(body).toMatch(/Vegetarian Noren can't check this\. Ask the place\./);
    expect(body).toMatch(/Allergy: peanuts Noren can't check this/);
    // Tastes say whether they were told or noticed, and show no strength.
    expect(body).toMatch(/History You added this/);
    expect(body).toMatch(/Coffee Noticed from what you opened\. Fades\./);
    expect(body).toContain("Today's trip");
    expect(body).toContain("Champon at lunch");
    expect(html).toContain('href="/en/places/dejima-museum"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("says in plain words that the memory stays on the device, and what is sensitive", () => {
    const body = text(render(<RemembersView {...props()} />));
    expect(body).toContain("kept on this device");
    expect(body).toContain("APPI");
    expect(body).toContain("An allergy is health information");
    expect(body).toContain("religious belief");
    expect(body).toContain("special care-required");
    expect(body).toContain("never shown to the AI model");
    expect(body).toContain("Forget everything");
  });

  it("has no score, percentage, ranking or emoji", () => {
    const body = text(render(<RemembersView {...props()} />));
    expect(body).not.toMatch(/score|rank|rating|match|%|[★☆]/i);
    expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("is useful when empty, and says when the browser will not keep anything", () => {
    const html = render(
      <RemembersView {...props({ memory: emptyMemory(clock), canKeep: false })} />,
    );
    const body = text(html);
    expect(body).toContain("No rules yet.");
    expect(body).toContain("Nothing yet. Open and save places");
    expect(body).toContain("Nothing yet today.");
    expect(html).toContain('role="alert"');
    expect(body).toContain("won't keep your choices");
    const fine = render(<RemembersView {...props({ memory: emptyMemory(clock) })} />);
    expect(text(fine)).not.toContain("won't keep your choices");
  });

  it("offers the mic only when it is given one, once beside each way of adding", () => {
    expect(text(render(<RemembersView {...props()} />))).not.toContain("Use your voice instead");
    const voice = vi.fn((id: string) => <p data-field={id}>mic</p>);
    const html = render(<RemembersView {...props({ voice })} />);
    expect(text(html).match(/Use your voice instead/g)).toHaveLength(3);
    expect(voice.mock.calls.map(([id]) => id)).toEqual([
      "remember-rule",
      "remember-taste",
      "remember-trip",
    ]);
  });

  it("is in Japanese too", () => {
    const body = text(render(<RemembersView {...props({ locale: "ja" })} />));
    expect(body).toContain("守るルール");
    expect(body).toContain("ベジタリアン");
    expect(body).toContain("アレルギー：peanuts");
    expect(body).toContain("歴史");
    expect(body).toContain("すべて忘れる");
    expect(body).toContain("要配慮個人情報");
  });

  it("stops offering to add rules when the list is full", () => {
    let memory = emptyMemory(clock);
    for (let n = 0; n < 8; n++) memory = addRule(memory, `no thing ${n}`);
    const body = text(render(<RemembersView {...props({ memory })} />));
    expect(body).toContain("most rules Noren can use at once (8)");
    expect(body).not.toContain("+ Halal");
    expect(body).not.toContain("Add a rule");
    expect(body).not.toContain("+ Vegetarian");
  });

  it("hands every ✕, quick-add, keep and forget press to the container", () => {
    const p = props();
    const tree = RemembersView(p);
    const chip = (label: string) =>
      all(tree).find((el) => el.type === Chip && el.props.removeLabel === label)!;
    (chip("Remove Vegetarian").props.onRemove as () => void)();
    expect(p.onRemoveRule).toHaveBeenCalledWith("diet:vegetarian");
    (chip("Remove History").props.onRemove as () => void)();
    expect(p.onRemoveTaste).toHaveBeenCalledWith("history");
    (buttonLabelled(tree, "+ Halal")!.props.onClick as () => void)();
    expect(p.onAddRule).toHaveBeenCalledWith("Halal");
    (buttonLabelled(tree, "+ Nature")!.props.onClick as () => void)();
    expect(p.onAddTaste).toHaveBeenCalledWith("nature");
    (buttonLabelled(tree, "Keep after today")!.props.onClick as () => void)();
    expect(p.onKeepVisited).toHaveBeenCalledWith(expect.any(String), true);
    (buttonLabelled(tree, "Yes, forget")!.props.onClick as () => void)();
    expect(p.onForgetAll).toHaveBeenCalledOnce();
    // The trip's ✕ is its own button.
    const removeTrip = all(tree).find((el) => el.props.label === "Remove Champon at lunch")!;
    (removeTrip.props.onRemove as () => void)();
    expect(p.onRemoveVisited).toHaveBeenCalledWith(expect.any(String));
  });

  it("does not offer a rule or a like that is already there", () => {
    const tree = RemembersView(props());
    expect(buttonLabelled(tree, "+ Vegetarian")).toBeUndefined();
    expect(buttonLabelled(tree, "+ History")).toBeUndefined();
    expect(buttonLabelled(tree, "+ Halal")).toBeDefined();
  });

  it("a told like can be added from the presets even after Noren had noticed it", () => {
    const noticed = learn(emptyMemory(clock), { category: "museum", action: "save" }, clock);
    const tree = RemembersView(props({ memory: noticed }));
    expect(buttonLabelled(tree, "+ History")).toBeDefined();
  });
});

describe("adding by typing", () => {
  function submit(onAdd: (text: string) => void, value: string) {
    const form = AddForm({ id: "f", label: "Add", help: "Help", addLabel: "+ Add", onAdd });
    const field = { value };
    const event = {
      preventDefault: vi.fn(),
      currentTarget: {
        elements: { namedItem: (name: string) => (name === "text" ? field : null) },
      },
    };
    (form.props.onSubmit as (event: unknown) => void)(event);
    return { field, event };
  }

  it("sends what was typed and clears the field", () => {
    const onAdd = vi.fn();
    const { field, event } = submit(onAdd, "no spicy food");
    expect(onAdd).toHaveBeenCalledWith("no spicy food");
    expect(field.value).toBe("");
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("ignores an empty field", () => {
    const onAdd = vi.fn();
    submit(onAdd, "   ");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("is a labelled field with its help tied to it", () => {
    const html = render(
      <AddForm id="f" label="Add a rule" help="Help text" addLabel="+ Add" onAdd={() => {}} />,
    );
    expect(html).toContain('<label for="f"');
    expect(html).toContain('aria-describedby="f-help"');
    expect(html).toContain('id="f-help"');
    expect(html).toContain("+ Add");
  });

  it("the voice input and the quick-add chip can fill a field by its id", () => {
    const field = { value: "", focus: vi.fn() };
    vi.stubGlobal("document", { getElementById: (id: string) => (id === "f" ? field : null) });
    fillField("f", "allergic to ");
    expect(field.value).toBe("allergic to ");
    expect(field.focus).toHaveBeenCalled();
    expect(() => fillField("missing", "x")).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe("a chip", () => {
  it("is a name, a note and a ✕ button at least 44 px square", () => {
    const html = render(
      <Chip
        label="Vegetarian"
        note="Noren can check this"
        removeLabel="Remove Vegetarian"
        onRemove={() => {}}
      />,
    );
    expect(html).toContain("Vegetarian");
    expect(html).toContain('aria-label="Remove Vegetarian"');
    expect(html).toContain("size-11");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("the words a visitor can use", () => {
  it("every quick-add button adds exactly the rule or like it names", () => {
    for (const preset of RULE_PRESETS) {
      expect(ruleFromText(preset.label.en)?.tag, preset.key).toBe(preset.tag);
      expect(ruleFromText(preset.label.ja)?.tag, `${preset.key} (ja)`).toBe(preset.tag);
    }
    for (const preset of TASTE_PRESETS) {
      expect(tasteFromText(preset.key)?.key, preset.key).toBe(preset.key);
      expect(tasteFromText(preset.label.ja)?.key, `${preset.key} (ja)`).toBeDefined();
    }
  });
});
