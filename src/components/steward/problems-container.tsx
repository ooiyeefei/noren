"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { errorText } from "@/components/layout/error-text";
import { messagesFor, type Locale } from "@/lib/i18n";
import { problemsMessages } from "@/lib/i18n/messages/problems";
import { newestFirst, type ProblemReport, type ProblemStatus } from "./problems-logic";
import { ProblemsView } from "./problems-view";

export function ProblemsContainer({ locale }: { locale: Locale }) {
  const [status, setStatus] = useState<ProblemStatus>("open");
  const [pagination, setPagination] = useState<{ cursor: string | null; previous: ProblemReport[] }>(
    { cursor: null, previous: [] },
  );
  const result = useQuery(api.problemReport.list, {
    status,
    paginationOpts: { cursor: pagination.cursor, numItems: 25 },
  });
  const close = useMutation(api.problemReport.close);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const rows = newestFirst([
    ...new Map(
      [...pagination.previous, ...(result?.page ?? [])].map((row: ProblemReport) => [row._id, row]),
    ).values(),
  ]);
  return (
    <ProblemsView
      locale={locale}
      rows={rows}
      status={status}
      pending={pending}
      loading={result === undefined}
      hasMore={result !== undefined && !result.isDone}
      error={error}
      success={success}
      onStatus={(next) => {
        setStatus(next);
        setPagination({ cursor: null, previous: [] });
        setError(undefined);
        setSuccess(undefined);
      }}
      onLoadMore={() => {
        if (result && !result.isDone && result.continueCursor !== pagination.cursor)
          setPagination({ cursor: result.continueCursor, previous: rows });
      }}
      onClose={async (id) => {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        setError(undefined);
        try {
          await close({ reportId: id as Parameters<typeof close>[0]["reportId"] });
          setPagination({ cursor: null, previous: [] });
          setSuccess(messagesFor(problemsMessages, locale).saved);
        } catch (error) {
          setError(errorText(error, locale));
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    />
  );
}
