"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { messagesFor, type Locale } from "@/lib/i18n";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { StatusView } from "./status-view";
import { takedownError, validateText } from "./takedown-logic";

export function StatusContainer({ locale }: { locale: Locale }) {
  const query = useSearchParams();
  const [code, setCode] = useState((query.get("code") ?? "").trim());
  const [lookup, setLookup] = useState(code);
  const [note, setNote] = useState("");
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
