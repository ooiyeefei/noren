"use client";

import { useMutation, useQuery } from "convex/react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { storyFinderMessages } from "@/lib/i18n/messages/story-finder";
import { pickPlaceName } from "@/lib/region/names";
import type { RegionConfig } from "@/lib/region/schema";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useStewardAction } from "./steward-home-container";
import { StoryFinderView, type FoundRow } from "./story-finder-view";

export function StoryFinderContainer({ locale, region }: { locale: Locale; region: RegionConfig }) {
  const overview = useQuery(api.storyFinder.stewardOverview, {});
  const requestCheck = useMutation(api.storyFinder.requestCheck);
  const attachNow = useMutation(api.storyFinder.attachAcceptedNow);
  const hide = useMutation(api.storyFinder.hide);
  const held = useQuery(api.translationChecks.heldExcerpts, {});
  const release = useMutation(api.translationChecks.releaseExcerpt);
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(storyFinderMessages, locale);
  if (!overview) return <p role="status">{messagesFor(stewardMessages, locale).loading}</p>;
  const toRow = (row: (typeof overview.attached)[number]): FoundRow => ({
    id: row.candidateId,
    placeSlug: row.placeSlug,
    placeName: pickPlaceName(row.placeNames, locale, region).primary?.value ?? row.placeSlug,
    platform: row.platform,
    url: row.url,
    author: row.author,
    postedAt: row.postedAt,
    checkedAt: row.checkedAt,
    attachedAt: row.attachedAt,
    status: row.status,
    reason: row.reason,
    attachError: row.attachError,
    kind: row.verdict?.kind,
    quote: row.verdict?.quote,
    evidence: row.verdict?.evidence,
    topics: row.verdict?.topics ?? [],
    sourceHidden: row.sourceStatus !== undefined && row.sourceStatus !== "live",
  });
  return (
    <StoryFinderView
      locale={locale}
      counts={overview.counts}
      attached={overview.attached.map(toRow)}
      accepted={overview.accepted.map(toRow)}
      rejected={overview.rejected.map(toRow)}
      held={(held ?? []).map((row) => ({
        id: row.checkId,
        placeSlug: row.placeSlug,
        placeName: pickPlaceName(row.placeNames, locale, region).primary?.value ?? row.placeSlug,
        url: row.url,
        quote: row.quote,
        translation: row.translation,
        added: row.added,
        missing: row.missing,
      }))}
      {...state}
      onCheck={(attach) =>
        void run("check", async () => {
          const { scheduled } = await requestCheck({ attach });
          return format(m.checkStarted, { count: String(scheduled) });
        })
      }
      onAttach={() =>
        void run("attach", async () => {
          const { attached } = await attachNow({});
          return format(m.attached, { count: String(attached) });
        })
      }
      onHide={(id) =>
        void run(`hide:${id}`, async () => {
          await hide({ candidateId: id as Id<"mentionCandidate"> });
          return m.hidden;
        })
      }
      onRelease={(id) =>
        void run(`release:${id}`, async () => {
          await release({ checkId: id as Id<"translationCheck"> });
          return m.released;
        })
      }
    />
  );
}
