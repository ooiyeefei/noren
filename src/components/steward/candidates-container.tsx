"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { messagesFor, type Locale } from "@/lib/i18n";
import { candidateMessages } from "@/lib/i18n/messages/candidates";
import type { RegionConfig } from "@/lib/region/schema";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  buildNameSet,
  candidateDraft,
  candidateError,
  categoryOptions,
  listArgs,
  nextPage,
  validatePin,
  type Candidate,
  type CandidateDraft,
} from "./candidates-logic";
import { CandidatesView, type SavedCandidate } from "./candidates-view";
import { useStewardAction } from "./steward-home-container";

export function CandidatesContainer({
  params,
  locale,
  region,
}: {
  params: Promise<{ lang: string }>;
  locale: Locale;
  region: RegionConfig;
}) {
  use(params);
  const [filter, setFilter] = useState({ category: "", focusOnly: true, localOnly: true });
  const [pagination, setPagination] = useState<{ cursor: string | null; previous: Candidate[] }>({
    cursor: null,
    previous: [],
  });
  const result = useQuery(
    api.osmSeed.listCandidates,
    listArgs({
      regionId: region.id,
      ...filter,
      paginationOpts: { numItems: 25, cursor: pagination.cursor },
    }),
  );
  const confirm = useMutation(api.osmSeed.confirmCandidate);
  const publish = useMutation(api.places.setVisibility);
  const dismiss = useMutation(api.osmSeed.dismissCandidate);
  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedCandidate[]>([]);
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(candidateMessages, locale);
  const candidates = [
    ...new Map(
      [...pagination.previous, ...(result?.page ?? [])].map((candidate) => [
        candidate._id,
        candidate,
      ]),
    ).values(),
  ].filter((candidate) => !removed.includes(candidate._id));
  return (
    <CandidatesView
      locale={locale}
      region={region}
      candidates={candidates}
      {...filter}
      {...state}
      loading={result === undefined}
      hasMore={result !== undefined && nextPage(result) !== null}
      activeId={activeId}
      dismissId={dismissId}
      drafts={drafts}
      saved={saved}
      onFilter={(category, focusOnly, localOnly) => {
        setFilter({ category, focusOnly, localOnly });
        setPagination({ cursor: null, previous: [] });
        setActiveId(null);
        setDismissId(null);
      }}
      onLoadMore={() => {
        if (!result) return;
        const cursor = nextPage(result);
        if (cursor !== null && cursor !== pagination.cursor)
          setPagination({ cursor, previous: candidates });
      }}
      onReview={(candidate) => {
        setActiveId(candidate?._id ?? null);
        setDismissId(null);
        if (candidate)
          setDrafts((old) => ({
            ...old,
            [candidate._id]: old[candidate._id] ?? candidateDraft(candidate),
          }));
      }}
      onDraft={(id, draft) => setDrafts((old) => ({ ...old, [id]: draft }))}
      onConfirm={(id, shouldPublish) =>
        run(`confirm:${id}`, async () => {
          const draft = drafts[id];
          if (!draft) throw { data: { code: "invalid_input", message: m.invalidNames } };
          const names = buildNameSet(draft.names, locale);
          if (!names.ok) throw { data: { code: "invalid_input", message: names.reason } };
          const pin = validatePin(region.id, draft, locale);
          if (!pin.ok) throw { data: { code: "invalid_input", message: pin.reason } };
          if (!categoryOptions(region, locale).some((category) => category.key === draft.category))
            throw { data: { code: "invalid_input", message: m.invalidCategory } };
          const place = await confirm({
            candidateId: id as Id<"seedOsmCandidate">,
            names: names.value,
            pin: pin.value,
            category: draft.category,
          });
          setRemoved((old) => [...old, id]);
          setActiveId(null);
          setDismissId(null);
          setSaved((old) => [...old, { ...place, visibility: "draft" }]);
          if (!shouldPublish) return m.savedDraft;
          try {
            await publish({ placeId: place.placeId, visibility: "public" });
            setSaved((old) =>
              old.map((entry) =>
                entry.placeId === place.placeId ? { ...entry, visibility: "public" } : entry,
              ),
            );
            return m.published;
          } catch (error) {
            // Confirmation already committed. Keep its draft and refusal visible outside the removed row.
            setSaved((old) =>
              old.map((entry) =>
                entry.placeId === place.placeId
                  ? { ...entry, publishError: candidateError(error, locale) }
                  : entry,
              ),
            );
            return m.savedDraft;
          }
        })
      }
      onDismissAsk={setDismissId}
      onDismiss={(id) =>
        run(`dismiss:${id}`, async () => {
          if (dismissId !== id) return;
          await dismiss({ candidateId: id as Id<"seedOsmCandidate"> });
          setRemoved((old) => [...old, id]);
          setDismissId(null);
          if (activeId === id) setActiveId(null);
          return m.dismissed;
        })
      }
    />
  );
}
