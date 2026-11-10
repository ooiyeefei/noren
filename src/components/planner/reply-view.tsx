import Link from "next/link";
import { DemoBadge, UnconfirmedBadge } from "@/components/badges";
import { normaliseTag } from "@/lib/draw/rules";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { DRAW_TEXT_JA, plannerMessages } from "@/lib/i18n/messages/planner";
import { remembersMessages } from "@/lib/i18n/messages/remembers";
import { ruleFromText, ruleLabel, tasteFromText, tasteLabel } from "@/lib/memory/vocabulary";
import type { ProposalState } from "@/lib/planner/chat";
import type {
  PlannerPlace,
  PlannerProposal,
  PlannerReply,
  PlannerStop,
  PlannerWalk,
  PlannerWhy,
} from "@/lib/planner/reply";
import { QuoteView } from "./quote-view";

// What the planner answered, as the page shows it. Every name, link, walking time and quote comes from
// the reply, which comes from Noren's tools; the only words the AI may have written are `intro`.

const placeHref = (locale: Locale, slug: string) =>
  localePath(locale, `/places/${encodeURIComponent(slug)}`);
const writeHref = (locale: Locale, slug: string) =>
  `${placeHref(locale, slug)}?tab=stories&write=1`;

/** The draw's own English sentences, in Japanese where there is a Japanese version. */
export function drawText(locale: Locale, text: string): string {
  return locale === "ja" ? (DRAW_TEXT_JA[text] ?? text) : text;
}

/** "3 stops, about 14 minutes on foot, 1 wild card", worded by code from the draw. */
export function summaryLine(locale: Locale, walk: PlannerWalk): string {
  const m = messagesFor(plannerMessages, locale);
  const n = walk.stops.length;
  const parts = [
    n === 1 ? m.stopsOne : format(m.stopsMany, { n }),
    format(m.minutesOnFoot, { n: walk.totalMinutes }),
    walk.wildCards === 0
      ? m.wildNone
      : walk.wildCards === 1
        ? m.wildOne
        : format(m.wildMany, { n: walk.wildCards }),
  ];
  return parts.join(locale === "ja" ? "、" : ", ") + (locale === "ja" ? "。" : ".");
}

export function whyText(locale: Locale, why: PlannerWhy, interestLabel: (tag: string) => string) {
  const m = messagesFor(plannerMessages, locale);
  switch (why.kind) {
    case "wild":
      return m.whyWild;
    case "matched":
      return format(m.whyMatched, {
        list: why.interests.map(interestLabel).join(locale === "ja" ? "、" : " and "),
      });
    case "random":
      return why.hadInterests ? m.whyRandomHad : m.whyRandom;
  }
}

/** How a proposal reads: "Remember: vegetarian?" and the like, in the visitor's language. */
export function proposalText(locale: Locale, proposal: PlannerProposal): string {
  const m = messagesFor(plannerMessages, locale);
  const prefix = messagesFor(remembersMessages, locale).allergyPrefix;
  let text = proposal.text;
  if (proposal.kind === "rule") {
    const draft = ruleFromText(proposal.text);
    if (draft !== null) text = ruleLabel(draft, locale, prefix);
  } else if (proposal.kind === "taste") {
    const draft = tasteFromText(proposal.text);
    if (draft !== null) text = tasteLabel(draft, locale);
  }
  if (proposal.kind === "visited") {
    return format(proposal.op === "add" ? m.proposalVisitedAdd : m.proposalVisitedRemove, { text });
  }
  return format(proposal.op === "add" ? m.proposalRemember : m.proposalForget, { text });
}

function PlaceTags({ locale, place }: { locale: Locale; place: PlannerPlace }) {
  const where = [place.category?.[locale], place.neighbourhood?.[locale]].filter(Boolean);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
      {where.length > 0 && <span>{where.join(" · ")}</span>}
      {!place.confirmed && <UnconfirmedBadge locale={locale} />}
      {place.demo && <DemoBadge locale={locale} />}
    </p>
  );
}

function StopView({
  locale,
  index,
  stop,
  interestLabel,
}: {
  locale: Locale;
  index: number;
  stop: PlannerStop;
  interestLabel: (tag: string) => string;
}) {
  const m = messagesFor(plannerMessages, locale);
  const { place } = stop;
  return (
    <li className="space-y-3 rounded-[10px] border border-line bg-white p-4">
      <p className="text-[15px] text-muted-foreground">
        <span aria-hidden="true" className="mr-2 font-bold text-kon">
          {index + 1}
        </span>
        {format(m.legFrom, { minutes: stop.minutes, from: stop.from })}
      </p>
      <h3 className="font-sans text-[20px] font-bold break-words">
        <Link className="text-ai underline" href={placeHref(locale, place.slug)}>
          {place.name}
        </Link>
      </h3>
      <PlaceTags locale={locale} place={place} />
      <p className="text-[16px]">{whyText(locale, stop.why, interestLabel)}</p>
      {stop.stories.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold">{m.peopleWroteHere}</h4>
          <ul className="space-y-3">
            {stop.stories.map((story) => (
              <li key={story.id}>
                <QuoteView locale={locale} quote={story} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {stop.quotes.length > 0 && (
        <ul className="space-y-3">
          {stop.quotes.map((quote) => (
            <li key={quote.id}>
              <QuoteView locale={locale} quote={quote} />
            </li>
          ))}
        </ul>
      )}
      <p className="flex flex-wrap items-center gap-x-4 text-[15px]">
        {!place.hasStory && <span className="text-muted-foreground">{m.nobodyWroteHere}</span>}
        {!place.hasStory && (
          <Link
            className="inline-flex min-h-11 items-center text-ai underline"
            href={writeHref(locale, place.slug)}
          >
            {m.writeFirst}
          </Link>
        )}
        <Link
          className="inline-flex min-h-11 items-center text-ai underline"
          href={placeHref(locale, place.slug)}
        >
          {m.openPage}
        </Link>
      </p>
    </li>
  );
}

function WalkView({
  locale,
  walk,
  ruleLabels,
  interestLabel,
}: {
  locale: Locale;
  walk: PlannerWalk;
  ruleLabels: Readonly<Record<string, string>>;
  interestLabel: (tag: string) => string;
}) {
  const m = messagesFor(plannerMessages, locale);
  const tagLabel = (tag: string) => ruleLabels[normaliseTag(tag)] ?? tag;
  return (
    <section aria-label={m.title} className="space-y-4">
      <p className="text-[15px] text-muted-foreground">
        {format(m.startedFrom, { name: walk.start.name })}
      </p>
      {walk.stops.length === 0 ? (
        <p>{m.noStops}</p>
      ) : (
        <ol className="space-y-4">
          {walk.stops.map((stop, index) => (
            <StopView
              key={stop.place.slug}
              locale={locale}
              index={index}
              stop={stop}
              interestLabel={interestLabel}
            />
          ))}
        </ol>
      )}
      {walk.stops.length > 0 && walk.stops.length < walk.asked && (
        <p>{format(m.shorter, { got: walk.stops.length, asked: walk.asked })}</p>
      )}
      <p role="note" className="max-w-prose text-[14px] text-muted-foreground">
        {m.drawNote}
      </p>

      {walk.rulesApplied.length > 0 && (
        <div className="space-y-1">
          <h3 className="font-bold">{m.rulesAppliedHeading}</h3>
          <ul className="space-y-1 text-[15px]">
            {walk.rulesApplied.map((rule) => (
              <li key={rule.tag}>
                {format(m.rulesAppliedLine, {
                  tag: tagLabel(rule.tag),
                  checks: drawText(locale, rule.checks),
                  limit: drawText(locale, rule.limit),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {walk.rulesNotChecked.length > 0 && (
        <div className="space-y-1 rounded-[10px] border border-kasutera bg-white p-3" role="note">
          <h3 className="font-bold">{m.rulesNotCheckedHeading}</h3>
          <p className="text-[15px]">{m.rulesNotCheckedIntro}</p>
          <ul className="space-y-1 text-[15px]">
            {walk.rulesNotChecked.map((rule) => (
              <li key={rule.tag}>
                {format(m.rulesNotCheckedLine, {
                  tag: tagLabel(rule.tag),
                  reason: drawText(locale, rule.reason),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {walk.interestsNotMatched.length > 0 && (
        <p className="text-[15px]">
          {format(m.interestsNotMatched, {
            list: walk.interestsNotMatched.join(locale === "ja" ? "、" : ", "),
          })}
        </p>
      )}
    </section>
  );
}

function ProposalRow({
  locale,
  entry,
  onAnswer,
}: {
  locale: Locale;
  entry: ProposalState;
  onAnswer(proposalId: string, answer: "yes" | "no"): void;
}) {
  const m = messagesFor(plannerMessages, locale);
  const { proposal } = entry;
  return (
    <li className="space-y-2 rounded-[10px] border border-ai bg-white p-3">
      {entry.status === "open" ? (
        <>
          <p className="font-bold">{proposalText(locale, proposal)}</p>
          <p className="text-[14px] text-muted-foreground">
            {format(m.saidAs, { words: proposal.saidAs })}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onAnswer(proposal.id, "yes")}
              className="min-h-11 min-w-20 rounded-[10px] bg-kon px-4 font-bold text-white"
            >
              {m.yes}
            </button>
            <button
              type="button"
              onClick={() => onAnswer(proposal.id, "no")}
              className="min-h-11 min-w-20 rounded-[10px] border border-kon px-4 font-bold text-kon"
            >
              {m.no}
            </button>
          </div>
        </>
      ) : (
        <p role="status" className="text-[15px]">
          {entry.status === "no"
            ? m.declined
            : proposal.op === "add"
              ? m.appliedAdd
              : m.appliedRemove}
        </p>
      )}
    </li>
  );
}

export function ReplyView({
  locale,
  reply,
  proposals,
  ruleLabels,
  interestLabel,
  onAnswer,
}: {
  locale: Locale;
  reply: PlannerReply;
  proposals: readonly ProposalState[];
  /** The visitor's own words for their rules, by tag. */
  ruleLabels: Readonly<Record<string, string>>;
  interestLabel: (tag: string) => string;
  onAnswer(proposalId: string, answer: "yes" | "no"): void;
}): React.JSX.Element {
  const m = messagesFor(plannerMessages, locale);
  const shown = reply.walk !== null || reply.omikuji !== null || reply.answers.length > 0;
  return (
    <div className="space-y-5" data-reply-state={reply.state}>
      {shown && (
        <p
          role="note"
          data-label={reply.pickedByAi ? "ai" : "drawn"}
          className="inline-block rounded-full border border-line bg-kamenozoki px-3 py-1 text-[14px] font-bold"
        >
          {reply.pickedByAi ? m.aiLabel : m.drawnLabel}
        </p>
      )}

      {reply.walk !== null && (
        <p className="text-[17px] font-bold">{reply.intro ?? summaryLine(locale, reply.walk)}</p>
      )}
      {reply.walk !== null && (
        <WalkView
          locale={locale}
          walk={reply.walk}
          ruleLabels={ruleLabels}
          interestLabel={interestLabel}
        />
      )}

      {reply.omikuji !== null && (
        <section
          aria-label={m.omikujiHeading}
          className="space-y-3 rounded-[10px] border border-line bg-white p-4"
        >
          <h3 className="font-sans text-[20px] font-bold">{m.omikujiHeading}</h3>
          <p className="text-[17px]">{reply.omikuji.slip[locale]}</p>
          <p className="font-sans text-[18px] font-bold break-words">
            <Link className="text-ai underline" href={placeHref(locale, reply.omikuji.place.slug)}>
              {reply.omikuji.place.name}
            </Link>
          </p>
          <PlaceTags locale={locale} place={reply.omikuji.place} />
          {!reply.omikuji.place.hasStory && (
            <Link
              className="inline-flex min-h-11 items-center text-ai underline"
              href={writeHref(locale, reply.omikuji.place.slug)}
            >
              {m.writeFirst}
            </Link>
          )}
          <p role="note" className="text-[14px] text-muted-foreground">
            {m.omikujiNote}
          </p>
        </section>
      )}

      {reply.answers.length > 0 && (
        <section aria-label={m.answersHeading} className="space-y-3">
          <h3 className="font-sans text-[20px] font-bold">{m.answersHeading}</h3>
          {reply.answers.map((answer, index) =>
            answer.kind === "quotes" ? (
              <ul key={index} className="space-y-3">
                {answer.quotes.map((quote) => (
                  <li key={quote.id}>
                    <QuoteView locale={locale} quote={quote} withPlace />
                  </li>
                ))}
              </ul>
            ) : (
              <div key={index} className="space-y-1 rounded-[10px] border border-line bg-white p-4">
                <p className="font-bold">{m.nobodyWrote}</p>
                <Link
                  className="inline-flex min-h-11 items-center text-ai underline"
                  href={
                    answer.place === undefined
                      ? localePath(locale, "/map")
                      : writeHref(locale, answer.place.slug)
                  }
                >
                  {answer.place === undefined
                    ? m.writeSomewhere
                    : format(m.writeAbout, { name: answer.place.name })}
                </Link>
              </div>
            ),
          )}
        </section>
      )}

      {reply.needsStart && <p role="status">{m.needsStart}</p>}
      {reply.state === "plain" && reply.walk !== null && (
        <p role="note" className="text-[15px]">
          {m.plainNote}
        </p>
      )}
      {reply.leftOut > 0 && reply.state === "ai" && (
        <p role="note" className="text-[15px]">
          {m.leftOut}
        </p>
      )}
      {reply.state === "empty" && <p role="status">{m.emptyReply}</p>}

      {proposals.length > 0 && (
        <ul className="space-y-3" aria-label={messagesFor(remembersMessages, locale).title}>
          {proposals.map((entry) => (
            <ProposalRow
              key={entry.proposal.id}
              locale={locale}
              entry={entry}
              onAnswer={onAnswer}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
