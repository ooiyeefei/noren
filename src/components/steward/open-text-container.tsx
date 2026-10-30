"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import type { RegionConfig } from "@/lib/region/schema";
import { pickPlaceName } from "@/lib/region/names";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { OpenTextView, emptySnippetDraft, type SnippetDraft } from "./open-text-view";
import { addExcerpt } from "./steward-logic";
import { useStewardAction } from "./steward-home-container";

export function OpenTextContainer({
  params,
  locale,
  region,
}: {
  params: Promise<{ lang: string }>;
  locale: Locale;
  region: RegionConfig;
}) {
  use(params);
  const places = useQuery(api.places.listAll, { regionId: region.id });
  const unlinked = useQuery(api.openText.listUnlinked, {});
  const [placeId, setPlaceId] = useState("");
  const linked = useQuery(
    api.openText.listForPlace,
    placeId ? { placeId: placeId as Id<"place"> } : "skip",
  );
  const link = useMutation(api.openText.link);
  const approve = useMutation(api.openText.approveExcerpts);
  const [drafts, setDrafts] = useState<Record<string, SnippetDraft>>({});
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(stewardMessages, locale);
  if (!places || !unlinked) return <p role="status">{m.loading}</p>;
  return (
    <OpenTextView
      locale={locale}
      landmarks={places
        .filter((place) => place.kind === "landmark")
        .map((place) => ({
          id: place._id,
          name: pickPlaceName(place.names, locale, region).primary?.value ?? place.slug,
          canLink: place.pin !== null && place.ownerCount === 0,
        }))}
      placeId={placeId}
      onPlace={setPlaceId}
      unlinked={unlinked}
      linked={linked ?? []}
      linkedLoading={!!placeId && linked === undefined}
      drafts={drafts}
      {...state}
      onDraft={(id, draft) => setDrafts((old) => ({ ...old, [id]: draft }))}
      onLink={(id) =>
        void run(`link:${id}`, async () => {
          const draft = drafts[id];
          if (!draft?.placeId) throw { data: { code: "invalid_input", message: m.selectPlace } };
          await link({
            snippetId: id as Id<"openTextSnippet">,
            placeId: draft.placeId as Id<"place">,
          });
          setPlaceId(draft.placeId);
        })
      }
      onAdd={(id, kind) =>
        void run(`excerpt:${id}`, async () => {
          const snippet = linked?.find((snippet) => snippet._id === id);
          if (!snippet) throw { data: { code: "not_found", message: m.empty } };
          const draft = drafts[id] ?? emptySnippetDraft();
          const result = addExcerpt(snippet.text, draft.excerpts, draft, kind);
          if (!result.ok) throw { data: { code: "invalid_input", message: m[result.reason] } };
          setDrafts((old) => ({ ...old, [id]: { ...draft, excerpts: result.excerpts } }));
        })
      }
      onApprove={(id) =>
        void run(`approve:${id}`, async () => {
          const ids = await approve({
            snippetId: id as Id<"openTextSnippet">,
            excerpts: drafts[id]?.excerpts ?? [],
          });
          setDrafts((old) => ({ ...old, [id]: emptySnippetDraft() }));
          return format(m.approvedCount, { count: ids.length });
        })
      }
    />
  );
}
