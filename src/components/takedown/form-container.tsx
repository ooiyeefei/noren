"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useDraft } from "@/components/drafts/drafts";
import { api } from "../../../convex/_generated/api";
import { factDate } from "@/components/facts/fact-list";
import { factMessages } from "@/lib/i18n/messages/facts";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { FormView } from "./form-view";
import {
  linkedPlaceSlug,
  pageFromQuery,
  submitArguments,
  takedownError,
  validateForm,
  type FormDraft,
  type SubmitResult,
} from "./takedown-logic";

export function FormContainer({
  locale,
  decideDays,
  factLabels,
}: {
  locale: Locale;
  decideDays: number;
  factLabels?: Record<string, Record<string, string>>;
}) {
  const query = useSearchParams();
  const page = pageFromQuery(query);
  const factId = query.get("factId");
  const slug = factId !== null && linkedPlaceSlug(page);
  const place = useQuery(api.places.bySlug, slug ? { slug } : "skip");
  const rows = useQuery(api.facts.forPlace, place ? { placeId: place._id } : "skip");
  const fact = rows?.find((row) => row._id === factId);
  const m = messagesFor(takedownMessages, locale);
  const labels = messagesFor(factMessages, locale);
  let factDescription: string | undefined;
  if (fact && place) {
    factDescription = format(m.factReport, {
      label: factLabels?.[place.regionId]?.[fact.key] ?? fact.key,
      answer: labels[fact.value],
      credit: format(fact.basis === "member" ? labels.reportedBy : labels.visitorWords, {
        name: fact.basis === "member" ? fact.reporterName : "",
        date: factDate(fact.day, locale),
      }),
    });
  } else if (factId !== null) {
    factDescription =
      slug && (place === undefined || (place && rows === undefined))
        ? m.loading
        : m.factUnavailable;
  }
  const empty: FormDraft = {
    pageUrl: page,
    details: "",
    privacyOrMinor: false,
    contact: "",
    website: "",
  };
  // Kept per linked page, so a request started for one place never fills the form for another.
  const draftKey =
    factId !== null
      ? `takedown:fact:${factId}:${page}`
      : page
        ? `takedown:form:${page}`
        : "takedown:form";
  const [draft, setDraft] = useDraft(draftKey, empty);
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
      factDescription={factDescription}
      factUnavailable={factId !== null && !fact}
      draft={draft}
      result={result}
      pending={pending}
      error={error}
      copied={copied}
      onChange={setDraft}
      onSubmit={async () => {
        if (busy.current || (factId !== null && !fact)) return;
        const reason = validateForm(draft, locale);
        setError(reason ?? undefined);
        if (reason) return;
        busy.current = true;
        setPending(true);
        try {
          setResult(await submit(submitArguments(draft, locale, fact?._id)));
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
