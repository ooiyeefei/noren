"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useDraft } from "@/components/drafts/drafts";
import { api } from "../../../convex/_generated/api";
import { messagesFor, type Locale } from "@/lib/i18n";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { StatusView } from "./status-view";
import { takedownError, validateText } from "./takedown-logic";

export function StatusContainer({ locale }: { locale: Locale }) {
  const query = useSearchParams();
  const linked = (query.get("code") ?? "").trim();
  // A code from a link comes back with the link; one typed in is kept, with the appeal written for it.
  const [code, setCode] = useDraft(linked ? null : "takedown-status:code", linked);
  const [lookup, setLookup] = useDraft(linked ? null : "takedown-status:lookup", linked);
  const [note, setNote] = useDraft(lookup ? `takedown-status:${lookup}:appeal` : null, "");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const result = useQuery(api.takedown.statusByCode, lookup ? { code: lookup } : "skip");
  const appeal = useMutation(api.takedown.appeal);
  return (
    <StatusView
      locale={locale}
      code={code}
      searched={!!lookup}
      result={result}
      note={note}
      pending={pending}
      error={error}
      success={success}
      onCode={setCode}
      onNote={setNote}
      onCheck={() => {
        setLookup(code.trim());
        setNote("");
        setError(undefined);
        setSuccess(undefined);
      }}
      onAppeal={async () => {
        if (busy.current || result?.status !== "decided") return;
        const reason = validateText(note, locale);
        setError(reason ?? undefined);
        setSuccess(undefined);
        if (reason) return;
        busy.current = true;
        setPending(true);
        try {
          await appeal({ code: lookup, note: note.trim() });
          setNote("");
          setSuccess(messagesFor(takedownMessages, locale).appealSent);
        } catch (error) {
          setError(takedownError(error, locale));
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    />
  );
}
