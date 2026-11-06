"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { useDraft } from "@/components/drafts/drafts";
import { api } from "../../../convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { FormView } from "./form-view";
import {
  pageFromQuery,
  submitArguments,
  takedownError,
  validateForm,
  type FormDraft,
  type SubmitResult,
} from "./takedown-logic";

export function FormContainer({ locale, decideDays }: { locale: Locale; decideDays: number }) {
  const query = useSearchParams();
  const page = pageFromQuery(query);
  const empty: FormDraft = {
    pageUrl: page,
    details: "",
    privacyOrMinor: false,
    contact: "",
    website: "",
  };
  // Kept per linked page, so a request started for one place never fills the form for another.
  const [draft, setDraft] = useDraft(page ? `takedown:form:${page}` : "takedown:form", empty);
  const [result, setResult] = useState<SubmitResult>();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const submit = useMutation(api.takedown.submit);
  return (
    <FormView
      locale={locale}
      decideDays={decideDays}
      draft={draft}
      result={result}
      pending={pending}
      error={error}
      copied={copied}
      onChange={setDraft}
      onSubmit={async () => {
        if (busy.current) return;
        const reason = validateForm(draft, locale);
        setError(reason ?? undefined);
        if (reason) return;
        busy.current = true;
        setPending(true);
        try {
          setResult(await submit(submitArguments(draft, locale)));
          setDraft(empty);
        } catch (error) {
          setError(takedownError(error, locale));
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
      onCopy={async () => {
        if (!result) return;
        try {
          await navigator.clipboard.writeText(result.code);
          setCopied(true);
        } catch (error) {
          setError(takedownError(error, locale));
        }
      }}
    />
  );
}
