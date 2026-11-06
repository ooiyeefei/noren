"use client";

import { useRef, useState } from "react";
import { ErrorMessage } from "@/components/layout/error-message";
import { DISPLAY_NAME_LIMIT, cleanDisplayName } from "@/lib/domain/display-name";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";

/** What a form can do about a name its member has yet to confirm; `useShownAs` wires these. */
export type ShownAsActions = {
  displayName: string;
  confirm(): Promise<unknown>;
  save(displayName: string): Promise<unknown>;
};

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 py-2 font-bold disabled:opacity-50";

/**
 * FR-131: the name that goes beside what a member shares, before their first share, with a way to
 * change it. The form holds its share button until they decide, and goes on once their name is
 * confirmed, which removes this. The server refuses a share anyway (`name_not_confirmed`).
 */
export function ShownAs({
  locale,
  hintId,
  actions,
}: {
  locale: Locale;
  /** The form's share button points here to say why it is held. */
  hintId: string;
  actions: ShownAsActions;
}) {
  const m = messagesFor(addStoryMessages, locale);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(actions.displayName);
  const [problem, setProblem] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function send(work: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function keep() {
    // A sign-in provider's name can break the rule, and then the server would refuse it.
    if (cleanDisplayName(actions.displayName) === null) {
      setEditing(true);
      setProblem(true);
      return;
    }
    void send(actions.confirm);
  }
  function save() {
    const clean = cleanDisplayName(name);
    setProblem(clean === null);
    if (clean !== null) void send(() => actions.save(clean));
  }
  return (
    <div data-shown-as="" className="space-y-2 rounded-[10px] bg-kamenozoki/60 p-4">
      {editing ? (
        <label className="block space-y-1">
          <span className="font-bold">{m.yourName}</span>
          <input
            autoFocus
            value={name}
            maxLength={DISPLAY_NAME_LIMIT}
            aria-invalid={problem || undefined}
            onChange={(event) => setName(event.target.value)}
            // This sits inside the story form, whose own submit must not run. Enter also ends a
            // Japanese conversion, which must not save a half-typed name.
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (!event.nativeEvent.isComposing) save();
            }}
            className="block w-full rounded-[10px] border border-input bg-white p-3 text-[16px]"
          />
        </label>
      ) : (
        <p className="font-bold break-words">{format(m.shownAs, { name: actions.displayName })}</p>
      )}
      <p id={hintId} className="text-[15px]">
        {m.shownAsHint}
      </p>
      {problem && (
        <p role="alert" className="text-beni">
          {m.nameProblem}
        </p>
      )}
      {error !== null && <ErrorMessage error={error} locale={locale} />}
      <div className="flex flex-wrap gap-3">
        {editing ? (
          <>
            <button
              type="button"
              disabled={pending}
              className={`${BUTTON} bg-kon text-white`}
              onClick={save}
            >
              {pending ? m.savingName : m.saveName}
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${BUTTON} border border-input text-kon`}
              onClick={() => {
                setEditing(false);
                setProblem(false);
                setError(null);
                setName(actions.displayName);
              }}
            >
              {m.cancel}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              className={`${BUTTON} bg-kon text-white`}
              onClick={keep}
            >
              {pending ? m.savingName : m.useThisName}
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${BUTTON} border border-kon text-kon`}
              onClick={() => setEditing(true)}
            >
              {m.changeName}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
