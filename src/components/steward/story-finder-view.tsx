"use client";

import type { ReactNode } from "react";
import { quoted } from "@/components/embeds/quoted";
import { checkDate } from "@/components/place/check-state";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { storyFinderMessages } from "@/lib/i18n/messages/story-finder";
import {
  MENTION_PLATFORMS,
  MENTION_STATUSES,
  type MentionKind,
  type MentionPlatform,
  type MentionStatus,
  type RejectReason,
} from "@/lib/story-finder/mention";
import { CheckFindings } from "./place-admin-view";
import { StewardFeedback, StewardNav, type ActionState } from "./steward-home-view";

/** A found post's quote whose translation the check held back. */
export type HeldQuoteRow = {
  id: string;
  placeSlug: string;
  placeName: string;
  url: string;
  quote: string;
  translation: string;
  added: readonly string[];
  missing: readonly string[];
};

export type FoundRow = {
  id: string;
  placeSlug: string;
  placeName: string;
  platform: MentionPlatform;
  url: string;
  author?: string;
  postedAt?: number;
  checkedAt?: number;
  attachedAt?: number;
  status: MentionStatus;
  reason?: RejectReason;
  attachError?: string;
  kind?: MentionKind;
  quote?: string;
  evidence?: string;
  topics: readonly string[];
  /** The linked source is no longer shown on the place's page. */
  sourceHidden: boolean;
};
export type StoryFinderProps = ActionState & {
  locale: Locale;
  /** The story agent's panel, which keeps its own state. */
  agent?: ReactNode;
  counts: readonly { status: MentionStatus; platform: MentionPlatform; count: number }[];
  attached: readonly FoundRow[];
  accepted: readonly FoundRow[];
  rejected: readonly FoundRow[];
  onCheck: (attach: boolean) => void;
  onAttach: () => void;
  onHide: (id: string) => void;
  held: readonly HeldQuoteRow[];
  onRelease: (id: string) => void;
};

type Messages = (typeof storyFinderMessages)[Locale];

function statusLabel(m: Messages, status: MentionStatus) {
  if (status === "attached") return m.attachedStatus;
  if (status === "hidden") return m.hiddenStatus;
  return m[status];
}

function attachErrorLabel(m: Messages, error: string) {
  const code = error.split(":")[0]!;
  return code === "already_linked" ||
    code === "place_full" ||
    code === "place_not_public" ||
    code === "invalid_url" ||
    code === "author_limit"
    ? m[code]
    : code;
}

/** The counts table: one row per platform, one column per status. */
function Counts({ m, counts }: { m: Messages; counts: StoryFinderProps["counts"] }) {
  const cell = (platform: MentionPlatform, status: MentionStatus) =>
    counts.find((row) => row.platform === platform && row.status === status)?.count ?? 0;
  const platforms = MENTION_PLATFORMS.filter((platform) =>
    counts.some((row) => row.platform === platform),
  );
  if (!platforms.length) return <p>{m.empty}</p>;
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px]">
        <thead>
          <tr>
            <th scope="col" className="p-2">
              {m.platform}
            </th>
            {MENTION_STATUSES.map((status) => (
              <th key={status} scope="col" className="p-2 text-right">
                {statusLabel(m, status)}
              </th>
            ))}
            <th scope="col" className="p-2 text-right">
              {m.total}
            </th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((platform) => (
            <tr key={platform} className="border-t border-line">
              <th scope="row" className="p-2 font-normal">
                {m[platform]}
              </th>
              {MENTION_STATUSES.map((status) => (
                <td key={status} className="p-2 text-right tabular-nums">
                  {cell(platform, status)}
                </td>
              ))}
              <td className="p-2 text-right font-bold tabular-nums">
                {MENTION_STATUSES.reduce((sum, status) => sum + cell(platform, status), 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  locale,
  m,
  row,
  pending,
  onHide,
}: {
  locale: Locale;
  m: Messages;
  row: FoundRow;
  pending?: string;
  onHide?: (id: string) => void;
}) {
  return (
    <article
      data-steward-card="found-post"
      className="min-w-0 space-y-2 rounded-[10px] border border-line p-4"
    >
      <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[18px] font-bold">
        <a
          className="text-ai underline"
          href={localePath(locale, `/places/${encodeURIComponent(row.placeSlug)}`)}
        >
          {row.placeName}
        </a>
        <span className="text-[15px] font-normal text-muted-foreground">{m[row.platform]}</span>
      </h3>
      {row.quote && (
        <blockquote className="border-l-2 border-line pl-3 whitespace-pre-wrap">
          {quoted(row.quote, locale)}
        </blockquote>
      )}
      <dl className="grid gap-x-3 gap-y-1 text-[15px] sm:grid-cols-[max-content_1fr]">
        {row.reason && (
          <>
            <dt className="font-bold">{m.reason}</dt>
            <dd>{m[row.reason]}</dd>
          </>
        )}
        {row.kind && (
          <>
            <dt className="font-bold">{m.kind}</dt>
            <dd>{m[row.kind]}</dd>
          </>
        )}
        {row.evidence && (
          <>
            <dt className="font-bold">{m.evidence}</dt>
            <dd className="whitespace-pre-wrap">{row.evidence}</dd>
          </>
        )}
        {row.topics.length > 0 && (
          <>
            <dt className="font-bold">{m.topics}</dt>
            <dd>{row.topics.join(", ")}</dd>
          </>
        )}
      </dl>
      <p className="text-[15px] text-muted-foreground">
        {[
          row.author && format(m.by, { author: row.author }),
          row.postedAt !== undefined &&
            format(m.postedOn, { date: checkDate(row.postedAt, locale) }),
          row.checkedAt !== undefined &&
            format(m.checkedOn, { date: checkDate(row.checkedAt, locale) }),
          row.attachedAt !== undefined &&
            format(m.shownOn, { date: checkDate(row.attachedAt, locale) }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {row.attachError && (
        <p className="text-[15px]">
          {format(m.notLinked, { reason: attachErrorLabel(m, row.attachError) })}
        </p>
      )}
      {row.sourceHidden && <p className="text-[15px]">{m.sourceHidden}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={row.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {m.original}
        </a>
        {onHide && (
          <Button
            variant="outline"
            className="min-h-11 h-auto rounded-[10px] px-5 py-2 whitespace-normal"
            disabled={!!pending}
            onClick={() => onHide(row.id)}
          >
            {m.hide}
          </Button>
        )}
      </div>
    </article>
  );
}

function HeldQuote({
  locale,
  m,
  row,
  pending,
  onRelease,
}: {
  locale: Locale;
  m: Messages;
  row: HeldQuoteRow;
  pending?: string;
  onRelease: (id: string) => void;
}) {
  return (
    <article
      data-steward-card="held-quote"
      className="min-w-0 space-y-2 rounded-[10px] border border-line p-4"
    >
      <h3 className="text-[18px] font-bold">
        <a
          className="text-ai underline"
          href={localePath(locale, `/places/${encodeURIComponent(row.placeSlug)}`)}
        >
          {row.placeName}
        </a>
      </h3>
      <blockquote className="border-l-2 border-line pl-3 whitespace-pre-wrap">
        {quoted(row.quote, locale)}
      </blockquote>
      <p className="font-bold">{m.heldTranslation}</p>
      <p>{row.translation}</p>
      <CheckFindings locale={locale} added={row.added} missing={row.missing} />
      <div className="flex flex-wrap items-center gap-3">
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={row.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {m.original}
        </a>
        <Button
          variant="outline"
          className="min-h-11 h-auto rounded-[10px] px-5 py-2 whitespace-normal"
          disabled={!!pending}
          onClick={() => onRelease(row.id)}
        >
          {messagesFor(stewardMessages, locale).checkRelease}
        </Button>
      </div>
    </article>
  );
}

/** Steward-only: what the story finder found, what it showed, and why it left the rest out. */
export function StoryFinderView(props: StoryFinderProps) {
  const {
    locale,
    agent,
    counts,
    attached,
    accepted,
    rejected,
    held,
    pending,
    onCheck,
    onAttach,
    onHide,
    onRelease,
  } = props;
  const m = messagesFor(storyFinderMessages, locale);
  const button = "min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto";
  const section = (title: string, rows: readonly FoundRow[], hide: boolean, intro?: string) => (
    <section className="min-w-0 space-y-3">
      <h2 className="text-[22px] font-bold">{title}</h2>
      {intro && <p className="max-w-prose">{intro}</p>}
      {!rows.length && <p>{m.empty}</p>}
      {rows.map((row) => (
        <Row
          key={row.id}
          locale={locale}
          m={m}
          row={row}
          pending={pending}
          onHide={hide && !row.sourceHidden ? onHide : undefined}
        />
      ))}
    </section>
  );
  return (
    <PageContainer locale={locale} title={m.title}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} current="story-finder" />
        <StewardFeedback {...props} />
        <p className="max-w-prose">{m.intro}</p>
        {agent}
        <section className="min-w-0 space-y-3">
          <h2 className="text-[22px] font-bold">{m.counts}</h2>
          <Counts m={m} counts={counts} />
          <div className="flex flex-wrap gap-3">
            <Button className={button} disabled={!!pending} onClick={() => onCheck(true)}>
              {m.check}
            </Button>
            <Button
              variant="outline"
              className={button}
              disabled={!!pending}
              onClick={() => onCheck(false)}
            >
              {m.checkOnly}
            </Button>
            <Button variant="outline" className={button} disabled={!!pending} onClick={onAttach}>
              {m.attach}
            </Button>
          </div>
        </section>
        {held.length > 0 && (
          <section className="min-w-0 space-y-3">
            <h2 className="text-[22px] font-bold">{m.heldTitle}</h2>
            <p className="max-w-prose">{m.heldIntro}</p>
            {held.map((row) => (
              <HeldQuote
                key={row.id}
                locale={locale}
                m={m}
                row={row}
                pending={pending}
                onRelease={onRelease}
              />
            ))}
          </section>
        )}
        {section(m.linkedTitle, attached, true, m.linkedIntro)}
        {section(m.acceptedTitle, accepted, true)}
        {section(m.rejectedTitle, rejected, false, m.rejectedIntro)}
      </div>
    </PageContainer>
  );
}
