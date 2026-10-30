"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { messagesFor, type Locale } from "@/lib/i18n";
import { takedownsMessages } from "@/lib/i18n/messages/takedowns";
import {
  takedownError,
  validateText,
  type TakedownStatus,
} from "@/components/takedown/takedown-logic";
import { orderQueue, queueStatuses, type TakedownRequest, type Windows } from "./takedowns-logic";
import { TakedownsView } from "./takedowns-view";

export function TakedownsContainer({ locale, windows }: { locale: Locale; windows: Windows }) {
  const [filter, setFilter] = useState<TakedownStatus | "">("");
  const [pagination, setPagination] = useState<{
    cursor: string | null;
    phase: number;
    previous: TakedownRequest[];
  }>({ cursor: null, phase: 0, previous: [] });
  const result = useQuery(api.takedown.list, {
    status: filter || queueStatuses[pagination.phase]!,
    paginationOpts: { cursor: pagination.cursor, numItems: 25 },
  });
  const decide = useMutation(api.takedown.decide);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [now] = useState(() => Date.now());
  const rows = orderQueue([
    ...new Map<string, TakedownRequest>(
      [...pagination.previous, ...(result?.page ?? [])].map((row: TakedownRequest) => [
        row._id,
        row,
      ]),
    ).values(),
  ]);
  const hasNextPhase = !filter && pagination.phase < queueStatuses.length - 1;
  // An empty completed group has nothing to show; advance before rendering its queue.
  if (result?.isDone && result.page.length === 0 && hasNextPhase)
    setPagination({ ...pagination, cursor: null, phase: pagination.phase + 1 });
  return (
    <TakedownsView
      locale={locale}
      windows={windows}
      now={now}
      rows={rows}
      filter={filter}
      drafts={drafts}
      pending={pending}
      loading={result === undefined}
      hasMore={result !== undefined && (!result.isDone || hasNextPhase)}
      error={error}
      success={success}
      onDraft={(id, value) => setDrafts((old) => ({ ...old, [id]: value }))}
      onFilter={(status) => {
        setFilter(status);
        setPagination({ cursor: null, phase: 0, previous: [] });
        setError(undefined);
        setSuccess(undefined);
      }}
      onLoadMore={() => {
        if (!result) return;
        if (!result.isDone && result.continueCursor !== pagination.cursor)
          setPagination({ ...pagination, cursor: result.continueCursor, previous: rows });
        else if (result.isDone && hasNextPhase)
          setPagination({ cursor: null, phase: pagination.phase + 1, previous: rows });
      }}
      onDecide={async (id, status) => {
        if (busy.current) return;
        const outcome = drafts[id] ?? "";
        const reason = validateText(outcome, locale);
        setError(reason ?? undefined);
        setSuccess(undefined);
        if (reason) return;
        busy.current = true;
        setPending(true);
        try {
          await decide({
            requestId: id as Parameters<typeof decide>[0]["requestId"],
            status,
            outcome: outcome.trim(),
          });
          setPagination({ cursor: null, phase: 0, previous: [] });
          setDrafts((old) => ({ ...old, [id]: "" }));
          setSuccess(messagesFor(takedownsMessages, locale).saved);
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
