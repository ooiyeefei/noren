import { X } from "lucide-react";

const REMOVE =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-kon hover:bg-kamenozoki focus-visible:ring-2 focus-visible:ring-ai";

/** The ✕ that removes something. At least 44 px square, and named for what it removes. */
export function RemoveButton({
  label,
  onRemove,
}: {
  label: string;
  onRemove(): void;
}): React.JSX.Element {
  return (
    <button type="button" aria-label={label} onClick={onRemove} className={REMOVE}>
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}

/** One remembered thing, with a ✕ to remove it. */
export function Chip({
  label,
  note,
  removeLabel,
  onRemove,
  lang,
}: {
  label: string;
  note?: string;
  removeLabel: string;
  onRemove(): void;
  lang?: string;
}): React.JSX.Element {
  return (
    <li className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-white py-1 pr-1 pl-4">
      <span className="min-w-0">
        <span lang={lang} className="block break-words font-bold text-kon">
          {label}
        </span>
        {note && <span className="block text-[13px] text-muted-foreground">{note}</span>}
      </span>
      <RemoveButton label={removeLabel} onRemove={onRemove} />
    </li>
  );
}

/** Puts words into a field by its id, for the voice input and the quick-add buttons. */
export function fillField(id: string, text: string): void {
  if (typeof document === "undefined") return;
  const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (field === null) return;
  field.value = text;
  field.focus();
}

/**
 * A line to type into, with a "+ Add" button. The field is not controlled, so the voice input can
 * fill it by id and the form holds no state of its own.
 */
export function AddForm({
  id,
  label,
  help,
  addLabel,
  onAdd,
}: {
  id: string;
  label: string;
  help: string;
  addLabel: string;
  onAdd(text: string): void;
}): React.JSX.Element {
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const field = event.currentTarget.elements.namedItem("text") as { value: string } | null;
        if (field === null || field.value.trim() === "") return;
        const text = field.value;
        field.value = "";
        onAdd(text);
      }}
    >
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <p id={`${id}-help`} className="text-[14px] text-muted-foreground">
        {help}
      </p>
      <div className="flex gap-2">
        <input
          id={id}
          name="text"
          type="text"
          maxLength={80}
          autoComplete="off"
          aria-describedby={`${id}-help`}
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-input bg-background px-3 text-base"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-[10px] bg-kon px-4 font-bold text-white focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2"
        >
          {addLabel}
        </button>
      </div>
    </form>
  );
}
