"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { ReportView } from "./report-view";
import {
  deviceString,
  emptyDraft,
  pageFromQuery,
  reportError,
  submitArguments,
  validateDetails,
  type ReportDraft,
  type ReportResult,
} from "./report-logic";

const subscribeNever = () => () => {};
const serverDevice = () => "";
let cachedDevice: string | undefined;
function browserDevice() {
  cachedDevice ??= deviceString(window.innerWidth, window.innerHeight, navigator.userAgent);
  return cachedDevice;
}

export function ReportContainer({ locale }: { locale: Locale }) {
  const pagePath = pageFromQuery(useSearchParams());
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft);
  const [result, setResult] = useState<ReportResult>();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string>();
  // Read in the browser only, so the visitor sees exactly what will be sent; empty on the server.
  const device = useSyncExternalStore(subscribeNever, browserDevice, serverDevice);
  const submit = useMutation(api.problemReport.submit);
  return (
    <ReportView
      locale={locale}
      draft={draft}
      pagePath={pagePath}
      device={device}
      result={result}
      pending={pending}
      error={error}
      onChange={setDraft}
      onAnother={() => {
        setResult(undefined);
        setError(undefined);
      }}
      onSubmit={async () => {
        if (busy.current) return;
        const reason = validateDetails(draft.details, locale);
        setError(reason ?? undefined);
        if (reason) return;
        busy.current = true;
        setPending(true);
        try {
          setResult(await submit(submitArguments(draft, pagePath, device, locale)));
          setDraft(emptyDraft);
        } catch (error) {
          setError(reportError(error, locale));
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    />
  );
}
