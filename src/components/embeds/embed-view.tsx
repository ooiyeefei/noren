"use client";

import { useEffect, useState } from "react";
import { DemoBadge } from "@/components/badges/demo-badge";
import { MachineTranslationBadge } from "@/components/badges/machine-translation-badge";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import type { EmbedDescriptor } from "@/lib/ports";
import { embedPlan, isAllowedOrigin, loadEmbedScript } from "./embed-scripts";
import { platformName } from "./platform-name";
import { quoted } from "./quoted";

export type EmbedSourceView = {
  id: string;
  platform: string;
  canonicalUrl: string;
  embed: EmbedDescriptor;
  title?: string;
  authorHandle?: string;
  authorUrl?: string;
  postedAt?: number;
  creatorNote?: string;
  noteLang?: string;
  isMock: boolean;
  /** The story finder found it in a public post; the author is as the platform shows them. */
  found?: boolean;
  /** A found post's verbatim quote, shown for a platform with no official embed. */
  excerpt?: string;
  excerptLang?: string;
  /** Machine translations of the quote, labelled as such. */
  excerptTranslations?: readonly { lang: string; text: string }[];
};

export function EmbedView(props: {
  locale: Locale;
  source: EmbedSourceView;
  outboundHref?: string;
  scriptOrigins: readonly string[];
  frameOrigins: readonly string[];
  /** Shown at the foot of the post, such as who shared it. */
  children?: React.ReactNode;
}): React.JSX.Element {
  // A changed source gets a fresh consent boundary even when the caller reuses this component.
  return <Post key={JSON.stringify([props.source.id, props.source.embed])} {...props} />;
}

function Post({
  locale,
  source,
  outboundHref,
  scriptOrigins,
  frameOrigins,
  children,
}: Parameters<typeof EmbedView>[0]): React.JSX.Element {
  const messages = messagesFor(placeUiMessages, locale);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const plan = embedPlan(source.embed, loaded);
  const scriptUrl = plan.kind === "blockquote" ? plan.scriptUrl : null;
  useEffect(() => {
    if (!scriptUrl) return;
    let active = true;
    loadEmbedScript(scriptUrl, scriptOrigins).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [scriptUrl, scriptOrigins]);
  const href = outboundHref ?? source.canonicalUrl;
  const external = { target: "_blank", rel: "noopener noreferrer nofollow" };
  // Through /out the visit is counted and the original learns it came from Noren: the referral a
  // creator gets for sharing (FR-024). /out passes on only Noren's origin, never the page.
  const toOriginal = outboundHref ? { target: "_blank", rel: "noopener" } : external;
  const frameAllowed = plan.kind !== "iframe" || isAllowedOrigin(plan.src, frameOrigins);
  // A found post names the platform properly and credits its author as the platform shows them.
  const platform = source.found
    ? (platformName(source.platform) ?? messages.webPage)
    : source.platform;
  const author = source.authorHandle
    ? format(source.found ? messages.postedBy : messages.byAuthor, {
        author: source.authorHandle,
      })
    : undefined;
  const excerpt = source.found && plan.kind === "link" ? source.excerpt?.trim() : undefined;
  const translation =
    excerpt && source.excerptLang !== locale
      ? source.excerptTranslations?.find((item) => item.lang === locale)?.text
      : undefined;
  return (
    <article lang={locale} className="space-y-3 rounded-lg border p-4">
      {source.found && (
        <p className="text-[13px] font-bold text-muted-foreground" title={messages.foundHint}>
          {messages.foundInPublicPost}
        </p>
      )}
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{platform}</span>
        {author && (
          <span>
            {source.authorUrl ? (
              <a href={source.authorUrl} {...external} className="underline">
                {author}
              </a>
            ) : (
              author
            )}
          </span>
        )}
        {source.isMock && <DemoBadge locale={locale} />}
        {source.postedAt !== undefined && Number.isFinite(source.postedAt) && (
          <time dateTime={new Date(source.postedAt).toISOString()}>
            {format(messages.postedOn, {
              date: new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(source.postedAt),
            })}
          </time>
        )}
      </header>
      {excerpt && (
        <figure className="space-y-2">
          <blockquote
            lang={source.excerptLang}
            cite={source.canonicalUrl}
            className="border-l-4 border-line pl-3 text-[18px] leading-[1.8] whitespace-pre-wrap"
          >
            {quoted(excerpt, source.excerptLang)}
          </blockquote>
          {translation && (
            <p lang={locale} className="space-x-2 pl-4 text-[15px] text-muted-foreground">
              <span>{translation}</span>
              <MachineTranslationBadge locale={locale} />
            </p>
          )}
        </figure>
      )}
      {plan.kind === "link" && (
        <a href={href} {...toOriginal} className="block rounded border p-4 underline">
          {source.title || new URL(plan.url).hostname}
        </a>
      )}
      {plan.kind === "facade" && (
        <div className="space-y-2 rounded border bg-muted p-4">
          <button
            type="button"
            className="rounded border bg-background px-4 py-2 focus-visible:outline-2"
            onClick={() => setLoaded(true)}
          >
            {format(messages.loadPost, { platform })}
          </button>
          <p className="text-sm">
            {format(messages.cookieLine, { platform })}{" "}
            <a className="underline" href={localePath(locale, "/notice")}>
              {messages.noticeLink}
            </a>
          </p>
        </div>
      )}
      {failed || !frameAllowed ? (
        <p role="status">{messages.loadFailed}</p>
      ) : plan.kind === "iframe" ? (
        <iframe
          src={plan.src}
          title={source.title ?? source.platform}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          className="min-h-96 w-full border-0"
          onError={() => setFailed(true)}
        />
      ) : plan.kind === "blockquote" ? (
        <blockquote
          className={
            source.platform.toLowerCase() === "instagram" ? "instagram-media" : "twitter-tweet"
          }
          data-instgrm-permalink={
            source.platform.toLowerCase() === "instagram" ? plan.url : undefined
          }
          data-dnt="true"
        >
          <a href={plan.url} {...external}>
            {source.title ?? messages.viewOriginal}
          </a>
        </blockquote>
      ) : null}
      {source.creatorNote && (
        <p lang={source.noteLang} className="whitespace-pre-wrap">
          {source.creatorNote}
        </p>
      )}
      <a href={href} {...toOriginal} className="underline underline-offset-4">
        {messages.viewOriginal}
      </a>
      {children}
    </article>
  );
}
