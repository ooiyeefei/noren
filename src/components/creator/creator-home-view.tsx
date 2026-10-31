import type { ReactNode } from "react";
import Link from "next/link";
import { DemoBadge } from "@/components/badges";
import { PageContainer } from "@/components/layout/page-container";
import { StepsPanel } from "@/components/layout/steps-panel";
import { Button } from "@/components/ui/button";
import { platformName } from "@/components/embeds/platform-name";
import { SHARED_POSTS_LISTED, type Visibility } from "@/lib/domain/constants";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import type { RegionConfig } from "@/lib/region";
import { pickPlaceName } from "@/lib/region/names";
import type { NameDraft } from "./place-form";
import { wizardHref } from "./place-wizard";

export type CreatorPlace = {
  _id: string;
  slug: string;
  names: NameDraft[];
  visibility: Visibility;
  isMock: boolean;
};
/** A post the member linked, with the visits Noren sent to its original (FR-024). */
export type SharedPostLike = {
  sourceId: string;
  placeSlug: string;
  placeNames: NameDraft[];
  platform: string;
  note?: string;
  noteLang?: string;
  status: string;
  shownToEveryone: boolean;
  /** Whether its link goes through Noren's counter; a web page is linked to directly. */
  countsVisits: boolean;
  visits: number;
  recentVisits: number;
};

export function CreatorHomeView({
  locale,
  region,
  places,
  shared = [],
  children,
  adding = !!children,
  canInterview = true,
}: {
  locale: Locale;
  region: RegionConfig;
  places: CreatorPlace[];
  /** The posts the member linked; only they see these totals (Principle I). */
  shared?: readonly SharedPostLike[];
  children?: ReactNode;
  adding?: boolean;
  canInterview?: boolean;
}) {
  const m = messagesFor(creatorMessages, locale);
  const add = (
    <Button asChild className="min-h-11 rounded-[10px] px-5 whitespace-normal">
      <Link href={wizardHref(locale, 1)} scroll={false}>
        {m.newPlace}
      </Link>
    </Button>
  );
  return (
    <PageContainer
      title={adding ? m.newPlace : m.home}
      locale={locale}
      actions={
        adding ? (
          <Link
            className="inline-flex min-h-11 items-center text-ai underline"
            href={`/${locale}/creator`}
            scroll={false}
          >
            {m.cancel}
          </Link>
        ) : undefined
      }
    >
      {!adding && (
        <StepsPanel
          title={m.whatToDo}
          steps={
            canInterview ? [m.guideAdd, m.guidePosts, m.guideInterview] : [m.guideAdd, m.guidePosts]
          }
          action={add}
          done={places.length > 0}
          lang={locale}
        />
      )}
      {children && <div hidden={!adding}>{children}</div>}
      {!adding && (
        <section className="space-y-4" aria-label={m.myPlaces}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="min-w-0 text-[22px] font-bold break-words">{m.myPlaces}</h2>
            {places.length > 0 && add}
          </div>
          {!places.length ? (
            <div className="max-w-prose space-y-4">
              <p>{m.noPlaces}</p>
              {add}
            </div>
          ) : (
            <ul>
              {places.map((place) => {
                const { primary } = pickPlaceName(place.names, locale, region);
                const secondary = place.names.find(
                  (name) => name.lang !== primary?.lang && name.value !== primary?.value,
                );
                const isPublic =
                  place.visibility === "public" || place.visibility === "demo_public";
                return (
                  <li
                    key={place._id}
                    className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-2"
                  >
                    <div className="min-w-0 flex-1 basis-36">
                      <Link
                        href={`/${locale}/creator/places/${place._id}`}
                        className="flex min-h-11 min-w-0 max-w-full flex-col justify-center leading-snug text-kon"
                      >
                        <span className="break-words font-bold" lang={primary?.lang}>
                          {primary?.value ?? place.slug}
                        </span>
                        {secondary && (
                          <span
                            className="break-words text-[15px] text-muted-foreground"
                            lang={secondary.lang}
                          >
                            {secondary.value}
                          </span>
                        )}
                      </Link>
                    </div>
                    <span className="rounded-full bg-kamenozoki px-3 py-1 text-[13px] text-kon">
                      {isPublic ? m.publicStatus : m.draftStatus}
                    </span>
                    {place.isMock && <DemoBadge locale={locale} />}
                    <Link
                      className="inline-flex min-h-11 items-center text-ai underline"
                      href={
                        isPublic
                          ? `/${locale}/places/${place.slug}`
                          : `/${locale}/creator/places/${place._id}#posts`
                      }
                    >
                      {isPublic ? m.open : m.addPosts}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {!adding && shared.length > 0 && (
        <section className="space-y-4" aria-labelledby="shared-posts">
          <h2 id="shared-posts" className="text-[22px] font-bold">
            {m.sharedPosts}
          </h2>
          <p className="max-w-prose text-[15px] text-muted-foreground">{m.visitsNote}</p>
          {shared.length >= SHARED_POSTS_LISTED && (
            <p className="text-[15px]">{format(m.newestPosts, { n: SHARED_POSTS_LISTED })}</p>
          )}
          <ul>
            {shared.map((post) => {
              const { primary } = pickPlaceName(post.placeNames, locale, region);
              const state =
                post.status === "gone"
                  ? m.originalGone
                  : post.status === "hidden"
                    ? m.removedPost
                    : !post.shownToEveryone
                      ? m.notShown
                      : post.countsVisits
                        ? undefined
                        : m.notCounted;
              return (
                <li
                  key={post.sourceId}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line py-3"
                >
                  <div className="min-w-0 flex-1 basis-48 space-y-1">
                    <Link
                      href={`/${locale}/places/${post.placeSlug}`}
                      className="inline-flex min-h-11 items-center font-bold break-words text-kon underline-offset-4 hover:underline"
                      lang={primary?.lang}
                    >
                      {primary?.value ?? post.placeSlug}
                    </Link>
                    <p className="text-[15px]">{platformName(post.platform) ?? m.linkedPage}</p>
                    {post.note && (
                      <p
                        lang={post.noteLang}
                        className="line-clamp-2 text-[15px] text-muted-foreground"
                      >
                        {post.note}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 text-right">
                    {(post.countsVisits || post.visits > 0) && (
                      <>
                        <p className="font-bold">
                          {post.visits === 1 ? m.visitsOne : format(m.visits, { n: post.visits })}
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          {format(m.recentVisits, { n: post.recentVisits })}
                        </p>
                      </>
                    )}
                    {state && (
                      <p className="rounded-full bg-kamenozoki px-3 py-1 text-[13px] text-kon">
                        {state}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
