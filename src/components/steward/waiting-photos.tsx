"use client";

import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { photoMessages } from "@/lib/i18n/messages/photos";
import { photoUrl } from "@/lib/photos/settings";
import { pickPlaceName } from "@/lib/region/names";
import type { RegionConfig } from "@/lib/region/schema";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { StewardFeedback, type ActionState } from "./steward-home-view";
import { useStewardAction } from "./steward-home-container";

export type WaitingPhotoRow = {
  id: string;
  url: string;
  width: number;
  height: number;
  authorName: string;
  storyBody: string;
  placeName: string;
  placeHref: string;
};
export type WaitingPhotosProps = ActionState & {
  locale: Locale;
  rows: readonly WaitingPhotoRow[];
  removalsFailing: number;
  onApprove: (id: string) => void;
  onRemove: (id: string) => void;
};

/** FR-207: new members' photos, which only they and stewards can see until one is approved here. */
export function WaitingPhotosView(props: WaitingPhotosProps) {
  const { locale, rows, removalsFailing, pending, onApprove, onRemove } = props;
  const m = messagesFor(photoMessages, locale);
  const button = "min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto";
  return (
    <section className="space-y-4" data-testid="waiting-photos">
      <h2 className="min-w-0 text-[22px] font-bold break-words">{m.waitingTitle}</h2>
      <p className="max-w-prose">{m.waitingIntro}</p>
      {removalsFailing > 0 && (
        <p role="alert" className="max-w-prose font-bold text-beni">
          {format(m.removalsFailing, { count: removalsFailing })}
        </p>
      )}
      <StewardFeedback {...props} />
      {!rows.length && <p>{m.waitingEmpty}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <article
            key={row.id}
            data-steward-card="photo"
            className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
          >
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="block">
              {/* The CDN serves one fixed JPEG, so no resizing service applies. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.url}
                alt={format(m.waitingAlt, { name: row.authorName, place: row.placeName })}
                width={row.width}
                height={row.height}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] h-auto w-full rounded-[10px] bg-kamenozoki object-contain"
              />
            </a>
            <p className="font-bold">
              <a className="text-ai underline" href={row.placeHref}>
                {row.placeName}
              </a>
            </p>
            <p className="text-[15px] text-muted-foreground">
              {format(m.waitingBy, { name: row.authorName })}
            </p>
            <p className="whitespace-pre-wrap">{row.storyBody}</p>
            <div className="flex flex-wrap gap-3">
              <Button className={button} disabled={!!pending} onClick={() => onApprove(row.id)}>
                {m.approve}
              </Button>
              <Button
                className={button}
                disabled={!!pending}
                variant="outline"
                onClick={() => onRemove(row.id)}
              >
                {m.reject}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function WaitingPhotosContainer({
  locale,
  region,
  baseUrl,
}: {
  locale: Locale;
  region: RegionConfig;
  baseUrl: string;
}) {
  const waiting = useQuery(api.storyPhotos.listWaiting, {});
  const approve = useMutation(api.storyPhotos.approve);
  const remove = useMutation(api.storyPhotos.remove);
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(photoMessages, locale);
  if (!waiting) return null;
  return (
    <WaitingPhotosView
      locale={locale}
      removalsFailing={waiting.removalsFailing}
      rows={waiting.photos.map((photo) => ({
        id: photo._id,
        url: photoUrl(baseUrl, photo.key),
        width: photo.width,
        height: photo.height,
        authorName: photo.authorName,
        storyBody: photo.storyBody,
        placeName:
          pickPlaceName(photo.placeNames, locale, region).primary?.value ?? photo.placeSlug,
        placeHref: localePath(locale, `/places/${encodeURIComponent(photo.placeSlug)}`),
      }))}
      {...state}
      onApprove={(id) =>
        void run(`approve:${id}`, async () => {
          await approve({ photoId: id as Id<"storyPhoto"> });
          return m.approved;
        })
      }
      onRemove={(id) =>
        void run(`remove:${id}`, async () => {
          await remove({ photoId: id as Id<"storyPhoto"> });
          return m.rejectedDone;
        })
      }
    />
  );
}
