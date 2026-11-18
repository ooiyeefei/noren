"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { StewardFeedback, type ActionState } from "@/components/steward/steward-home-view";
import { useStewardAction } from "@/components/steward/steward-home-container";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { shareMessages } from "@/lib/i18n/messages/share";
import { cardPath, type CardSize } from "@/lib/share/card";
import { buildCaption } from "@/lib/share/caption";
import { TOKEN_WARN_DAYS, tokenDaysLeft } from "@/lib/share/auto-post";
import { copyCaption } from "@/lib/share/picture";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** One automatic Instagram post, as the steward screen shows it. */
export type AutoPostRow = {
  postId: string;
  storyId: string;
  status: "queued" | "publishing" | "posted" | "failed" | "cancelled";
  reason: string | null;
  permalink: string | null;
  postedAt: number | null;
  placeEnglish: string;
  placeJapanese: string | null;
  needsRemoval: boolean;
};

/** Automatic posting as a whole: the region's switch, whether Instagram is connected, and the posts. */
export type AutoPostView = {
  autoPost: boolean;
  configured: boolean;
  schedule: { perDay: number; hourJst: number } | null;
  /** When the token now in use was first seen; null when unknown. */
  tokenFirstSeenAt: number | null;
  posts: readonly AutoPostRow[];
};

export type ShareQueueRow = {
  storyId: string;
  body: string;
  /** The language the story was written in. */
  lang: string;
  authorName: string;
  placeEnglish: string;
  placeJapanese: string | null;
  /** The town in both languages, for the hashtags. */
  town: { en: string; ja: string };
  /** When a steward marked it posted, as a time in milliseconds. */
  postedAt: number | null;
  /** The newest automatic post for this story, if one was approved. */
  post?: AutoPostRow | null;
};

export type ShareQueueProps = ActionState & {
  locale: Locale;
  rows: readonly ShareQueueRow[];
  onMarkPosted: (storyId: string) => void;
  /** Absent, or with the switch off, the screen is the by-hand queue and nothing else. */
  auto?: AutoPostView;
  /** The time now, for the token's age; a prop so a test can fix it. */
  now: number;
  onApprove?: (storyId: string) => void;
  onRetry?: (postId: string) => void;
  onCancel?: (postId: string) => void;
  onMarkRemoved?: (postId: string) => void;
};

/** The caption a steward posts with: the same one the Instagram kit gives, crediting the writer. */
export function queueCaption(row: ShareQueueRow): string {
  return buildCaption({
    body: row.body,
    lang: row.lang,
    authorName: row.authorName,
    placeEnglish: row.placeEnglish,
    placeJapanese: row.placeJapanese,
    town: row.town,
  });
}

const button = "min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto";

function PictureLink({ row, size, label }: { row: ShareQueueRow; size: CardSize; label: string }) {
  return (
    <a
      className="inline-flex min-h-11 items-center text-ai underline"
      href={cardPath(row.storyId, size, { download: true })}
      download
    >
      {label}
    </a>
  );
}

type ShareMessages = (typeof shareMessages)["en"];

const dateOf = (locale: Locale, at: number) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(at);

function failureText(m: ShareMessages, reason: string | null) {
  switch (reason) {
    case "not_configured":
      return m.autoReasonNotConfigured;
    case "token_invalid":
      return m.autoReasonToken;
    case "rate_limited":
      return m.autoReasonRate;
    case "image_rejected":
      return m.autoReasonImage;
    case "container_error":
    case "container_expired":
      return m.autoReasonContainer;
    case "timeout":
      return m.autoReasonTimeout;
    default:
      return m.autoReasonOther;
  }
}

function cancelledText(m: ShareMessages, reason: string | null) {
  if (reason === "withdrawn") return m.autoCancelledWithdrawn;
  if (reason === "removed") return m.autoCancelledRemoved;
  return m.autoCancelledOther;
}

/** What a steward needs to know about automatic posting before using it: connection, pacing, token age. */
function AutoStatus({ locale, auto, now }: { locale: Locale; auto: AutoPostView; now: number }) {
  const m = messagesFor(shareMessages, locale);
  const left = auto.tokenFirstSeenAt === null ? null : tokenDaysLeft(auto.tokenFirstSeenAt, now);
  return (
    <div className="space-y-2" data-testid="auto-post-status">
      {auto.schedule && (
        <p className="max-w-prose">
          {format(m.autoPaced, { hour: auto.schedule.hourJst, perDay: auto.schedule.perDay })}
        </p>
      )}
      {!auto.configured && (
        <p role="alert" className="max-w-prose font-bold">
          {m.autoNotConnected}
        </p>
      )}
      {auto.configured && left !== null && left <= 0 && (
        <p role="alert" className="max-w-prose font-bold">
          {m.autoTokenExpired}
        </p>
      )}
      {auto.configured && left !== null && left > 0 && left <= TOKEN_WARN_DAYS && (
        <p role="alert" className="max-w-prose font-bold">
          {format(m.autoTokenWarn, { days: left })}
        </p>
      )}
    </div>
  );
}

/** Posts on Instagram whose story has gone: nothing can delete them but a person. */
function RemovalTasks(props: {
  locale: Locale;
  posts: readonly AutoPostRow[];
  pending: ShareQueueProps["pending"];
  onMarkRemoved?: (postId: string) => void;
}) {
  const m = messagesFor(shareMessages, props.locale);
  const tasks = props.posts.filter((post) => post.needsRemoval);
  if (!tasks.length) return null;
  return (
    <div className="space-y-3 rounded-[10px] border border-line p-4" data-testid="auto-remove">
      <h3 className="text-[18px] font-bold">{m.autoRemoveTitle}</h3>
      <p className="max-w-prose">{m.autoRemoveIntro}</p>
      {tasks.map((post) => (
        <div key={post.postId} className="flex flex-wrap items-center gap-3">
          <span className="font-bold">{post.placeEnglish}</span>
          {post.permalink && (
            <a
              className="inline-flex min-h-11 items-center text-ai underline"
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
            >
              {m.autoView}
            </a>
          )}
          <Button
            variant="outline"
            className={button}
            disabled={!!props.pending}
            onClick={() => props.onMarkRemoved?.(post.postId)}
          >
            {m.autoRemoveDone}
          </Button>
        </div>
      ))}
    </div>
  );
}

function AutoRowControls(props: {
  locale: Locale;
  row: ShareQueueRow;
  auto: AutoPostView;
  pending: ShareQueueProps["pending"];
  onApprove?: (storyId: string) => void;
  onRetry?: (postId: string) => void;
  onCancel?: (postId: string) => void;
}) {
  const { locale, row, auto, pending } = props;
  const m = messagesFor(shareMessages, locale);
  const post = row.post ?? null;
  const canApprove = auto.configured && row.postedAt === null;
  if (post === null || post.status === "cancelled") {
    return (
      <div className="space-y-1">
        {post && <p className="text-[15px]">{cancelledText(m, post.reason)}</p>}
        {canApprove && (
          <Button
            className={button}
            disabled={!!pending}
            onClick={() => props.onApprove?.(row.storyId)}
          >
            {m.autoApprove}
          </Button>
        )}
      </div>
    );
  }
  if (post.status === "queued" || post.status === "publishing") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span role="status">{post.status === "queued" ? m.autoQueued : m.autoPublishing}</span>
        {post.status === "queued" && (
          <Button
            variant="outline"
            className={button}
            disabled={!!pending}
            onClick={() => props.onCancel?.(post.postId)}
          >
            {m.autoCancel}
          </Button>
        )}
      </div>
    );
  }
  if (post.status === "posted") {
    const date = post.postedAt === null ? "" : dateOf(locale, post.postedAt);
    return (
      <div className="space-y-1">
        <p>{format(post.permalink ? m.autoPosted : m.autoNoLink, { date })}</p>
        {post.permalink && (
          <a
            className="inline-flex min-h-11 items-center text-ai underline"
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
          >
            {m.autoView}
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p>{format(m.autoFailed, { reason: failureText(m, post.reason) ?? "" })}</p>
      <Button className={button} disabled={!!pending} onClick={() => props.onRetry?.(post.postId)}>
        {m.autoRetry}
      </Button>
    </div>
  );
}

/** Stories whose writers said Noren may share them on its own accounts. A person posts them by hand. */
export function ShareQueueView(props: ShareQueueProps) {
  const { locale, rows, pending, onMarkPosted, auto } = props;
  const { now } = props;
  // Only while the region's switch is on does the screen offer anything beyond the by-hand queue;
  // a post already on Instagram still shows its take-down task after the switch goes off.
  const autoOn = auto?.autoPost === true;
  const m = messagesFor(shareMessages, locale);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <section className="space-y-4" data-testid="share-queue">
      <h2 className="min-w-0 text-[22px] font-bold break-words">{m.queueTitle}</h2>
      <p className="max-w-prose">{auto && autoOn ? m.autoIntro : m.queueIntro}</p>
      {auto && autoOn && <AutoStatus locale={locale} auto={auto} now={now} />}
      {auto && (
        <RemovalTasks
          locale={locale}
          posts={auto.posts}
          pending={pending}
          onMarkRemoved={props.onMarkRemoved}
        />
      )}
      <StewardFeedback {...props} />
      {!rows.length && <p>{m.queueEmpty}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => {
          const caption = queueCaption(row);
          return (
            <article
              key={row.storyId}
              data-steward-card="share"
              className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
            >
              <p className="font-bold">
                {row.placeEnglish}
                {row.placeJapanese && <span className="ml-2 font-normal">{row.placeJapanese}</span>}
              </p>
              <p className="text-[15px] text-muted-foreground">
                {format(m.queueBy, { name: row.authorName })}
              </p>
              <p className="line-clamp-4 whitespace-pre-wrap">{row.body}</p>
              <div className="flex flex-wrap gap-x-5">
                <PictureLink row={row} size="story" label={m.queueStory} />
                <PictureLink row={row} size="feed" label={m.queueFeed} />
              </div>
              <label className="block space-y-1">
                <span className="font-bold">{m.captionLabel}</span>
                <textarea
                  readOnly
                  value={caption}
                  rows={6}
                  className="block w-full rounded-[10px] border border-input p-3 text-[16px]"
                />
              </label>
              {auto && autoOn && (
                <AutoRowControls
                  locale={locale}
                  row={row}
                  auto={auto}
                  pending={pending}
                  onApprove={props.onApprove}
                  onRetry={props.onRetry}
                  onCancel={props.onCancel}
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className={button}
                  onClick={() =>
                    void copyCaption(caption).then((ok) => setCopied(ok ? row.storyId : null))
                  }
                >
                  {m.copyCaption}
                </Button>
                {copied === row.storyId && <span role="status">{m.captionCopied}</span>}
                {row.postedAt === null ? (
                  <Button
                    className={button}
                    disabled={!!pending}
                    onClick={() => onMarkPosted(row.storyId)}
                  >
                    {m.markPosted}
                  </Button>
                ) : (
                  <span className="text-[15px]">
                    {format(m.queuePosted, {
                      date: new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }).format(row.postedAt),
                    })}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ShareQueueContainer({ locale, regionId }: { locale: Locale; regionId: string }) {
  const queue = useQuery(api.storyShare.queue, { regionId });
  const [now] = useState(() => Date.now());
  const overview = useQuery(api.instagramPosts.overview, { regionId });
  const markPosted = useMutation(api.storyShare.markPosted);
  const approve = useMutation(api.instagramPosts.approve);
  const retry = useMutation(api.instagramPosts.retry);
  const cancel = useMutation(api.instagramPosts.cancel);
  const markRemoved = useMutation(api.instagramPosts.markRemoved);
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(shareMessages, locale);
  if (queue === undefined || overview === undefined) return <p role="status">{m.queueLoading}</p>;
  const auto: AutoPostView = {
    autoPost: overview.autoPost,
    configured: overview.configured,
    schedule: overview.schedule,
    tokenFirstSeenAt: overview.tokenFirstSeenAt,
    posts: overview.posts,
  };
  return (
    <ShareQueueView
      locale={locale}
      {...state}
      auto={auto}
      now={now}
      onApprove={(storyId) =>
        void run(`share:${storyId}`, async () => {
          await approve({ storyId: storyId as Id<"story"> });
          return m.autoApproved;
        })
      }
      onRetry={(postId) =>
        void run(`auto:${postId}`, async () => {
          await retry({ postId: postId as Id<"instagramPost"> });
          return m.autoRetried;
        })
      }
      onCancel={(postId) =>
        void run(`auto:${postId}`, async () => {
          await cancel({ postId: postId as Id<"instagramPost"> });
          return m.autoCancelled;
        })
      }
      onMarkRemoved={(postId) =>
        void run(`auto:${postId}`, async () => {
          await markRemoved({ postId: postId as Id<"instagramPost"> });
          return m.autoRemoved;
        })
      }
      rows={queue.map((entry) => ({
        storyId: entry.storyId,
        body: entry.body,
        lang: entry.lang,
        authorName: entry.authorName,
        placeEnglish: entry.placeEnglish,
        placeJapanese: entry.placeJapanese,
        town: entry.town,
        postedAt: entry.postedAt,
        post: overview.posts.find((post) => post.storyId === entry.storyId) ?? null,
      }))}
      onMarkPosted={(storyId) =>
        void run(`share:${storyId}`, async () => {
          await markPosted({ storyId: storyId as Id<"story"> });
          return m.markedPosted;
        })
      }
    />
  );
}
