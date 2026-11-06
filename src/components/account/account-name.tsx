"use client";

import { useRef, useState } from "react";
import { useDraft } from "@/components/drafts/drafts";
import { ErrorMessage } from "@/components/layout/error-message";
import { DISPLAY_NAME_LIMIT, cleanDisplayName } from "@/lib/domain/display-name";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { accountMessages } from "@/lib/i18n/messages/account";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 py-2 font-bold disabled:opacity-50";

/** The name shown beside what a member shares, and the way to change it later (FR-130, FR-131). */
export function AccountName({
  locale,
  displayName,
  save,
}: {
  locale: Locale;
  displayName: string;
  save(displayName: string): Promise<unknown>;
}): React.JSX.Element {
  const m = messagesFor(addStoryMessages, locale);
  // Kept together, so a reload in the middle of a change reopens it with what was typed.
  const [edit, setEdit] = useDraft("account:name", { editing: false, name: displayName });
  const { editing, name } = edit;
  const [problem, setProblem] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function send() {
    const clean = cleanDisplayName(name);
    setProblem(clean === null);
    if (clean === null || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await save(clean);
      setEdit({ editing: false, name: clean });
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section data-account-name="" className="space-y-2">
      {editing ? (
        <label className="block space-y-1">
          <span className="font-bold">{m.yourName}</span>
          <input
            autoFocus
            value={name}
            maxLength={DISPLAY_NAME_LIMIT}
            aria-invalid={problem || undefined}
            onChange={(event) => setEdit({ editing: true, name: event.target.value })}
            // Enter also ends a Japanese conversion, which must not save a half-typed name.
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (!event.nativeEvent.isComposing) void send();
            }}
            className="block w-full rounded-[10px] border border-input bg-white p-3 text-[16px]"
          />
        </label>
      ) : (
        <p className="font-bold break-words">{format(m.shownAs, { name: displayName })}</p>
      )}
      <p className="text-[15px]">{messagesFor(accountMessages, locale).nameHint}</p>
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
              onClick={() => void send()}
            >
              {pending ? m.savingName : m.saveName}
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${BUTTON} border border-input text-kon`}
              onClick={() => {
                setEdit({ editing: false, name: displayName });
                setProblem(false);
                setError(null);
              }}
            >
              {m.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${BUTTON} border border-kon text-kon`}
            onClick={() => setEdit({ editing: true, name: displayName })}
          >
            {m.changeName}
          </button>
        )}
      </div>
    </section>
  );
}
