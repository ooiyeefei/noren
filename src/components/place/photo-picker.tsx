"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { photoMessages } from "@/lib/i18n/messages/photos";
import {
  NO_PHOTOS,
  photoDraft,
  PhotoUploadError,
  takeFiles,
  type PhotoDraft,
  type PhotoProblem,
  type PickedPhoto,
  type UploadedPhoto,
} from "@/lib/photos/upload";

export type PhotoPickerActions = {
  maxPerStory: number;
  /** Until when this member's photos wait for a steward; null when they never do. */
  waitsUntil: number | null;
  upload(file: File): Promise<UploadedPhoto>;
  remove(photoId: string): Promise<unknown>;
};

const PROBLEM_TEXT = {
  unreadable: "unreadable",
  rejected: "rejected",
  limit: "dailyLimit",
  failed: "failed",
} as const satisfies Record<PhotoProblem, string>;

/**
 * Lets a member add photos to the story they are writing. Each photo uploads as soon as it is picked,
 * so Share only has to attach them. Whatever is picked and never shared is removed by a cron.
 */
export function PhotoPicker({
  locale,
  actions,
  onChange,
}: {
  locale: Locale;
  actions: PhotoPickerActions;
  onChange: (draft: PhotoDraft) => void;
}) {
  const m = messagesFor(photoMessages, locale);
  const id = useId();
  const [items, setItems] = useState<PickedPhoto[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const nextId = useRef(0);
  const dropped = useRef(new Set<number>());
  const previews = useRef(new Set<string>());

  useEffect(() => onChange(photoDraft(items)), [items, onChange]);
  // Leaving the form leaves no photos behind in it, and frees the previews.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
      onChange(NO_PHOTOS);
    };
  }, [onChange]);

  const change = (itemId: number, fields: Partial<PickedPhoto>) =>
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...fields } : item)),
    );

  async function send(itemId: number, file: File) {
    try {
      const { photoId } = await actions.upload(file);
      // Taken out while it was uploading, so it must not stay behind on the server either.
      if (dropped.current.has(itemId)) await actions.remove(photoId);
      else change(itemId, { state: "ready", photoId });
    } catch (error) {
      console.error(`photo upload failed: ${error instanceof Error ? error.message : "unknown"}`);
      change(itemId, {
        state: "failed",
        problem: error instanceof PhotoUploadError ? error.problem : "failed",
      });
    }
  }

  function pick(files: File[]) {
    const room = actions.maxPerStory - items.length;
    const { taken, overflow, wrong } = takeFiles(files, room);
    setNotice(
      wrong ? m.wrongKind : overflow ? format(m.tooMany, { count: actions.maxPerStory }) : null,
    );
    const added = taken.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      const item: PickedPhoto = { id: nextId.current++, preview, state: "working" };
      return { item, file };
    });
    setItems((current) => [...current, ...added.map(({ item }) => item)]);
    for (const { item, file } of added) void send(item.id, file);
  }

  function takeOut(item: PickedPhoto) {
    dropped.current.add(item.id);
    URL.revokeObjectURL(item.preview);
    previews.current.delete(item.preview);
    setItems((current) => current.filter(({ id: other }) => other !== item.id));
    // The cron removes it within a day if this fails, so the member need not hear about it.
    if (item.photoId !== undefined) void actions.remove(item.photoId).catch(() => undefined);
  }

  const waits = actions.waitsUntil !== null && startedAt < actions.waitsUntil;
  const full = items.length >= actions.maxPerStory;
  const busy = items.some((item) => item.state === "working");
  return (
    <div className="space-y-3" data-testid="photo-picker">
      <div className="space-y-1">
        <p className="font-bold">{m.photos}</p>
        <p id={`${id}-rules`} className="text-[15px] text-muted-foreground">
          {m.rules} {format(m.limit, { count: actions.maxPerStory })}
        </p>
        {waits && (
          <p data-testid="photo-wait-notice" className="text-[15px] text-muted-foreground">
            {m.waitNotice}
          </p>
        )}
      </div>
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {items.map((item, index) => (
            <li key={item.id} className="min-w-0 space-y-1">
              {/* A blob address of the member's own file, so no resizing service applies. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.preview}
                alt={format(m.yourPhoto, { number: index + 1 })}
                className={cn(
                  "aspect-[4/3] w-full rounded-[10px] bg-kamenozoki object-cover",
                  item.state === "working" && "opacity-60",
                )}
              />
              {item.state === "working" && (
                <p role="status" className="text-[15px]">
                  {m.preparing}
                </p>
              )}
              {item.state === "failed" && (
                <p role="alert" className="text-[15px] text-beni">
                  {m[PROBLEM_TEXT[item.problem ?? "failed"]]}
                </p>
              )}
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-[15px] text-ai underline"
                onClick={() => takeOut(item)}
              >
                {m.removeFromStory}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice !== null && (
        <p role="alert" className="text-[15px] text-beni">
          {notice}
        </p>
      )}
      {!full && (
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-kon px-5 py-2 font-bold text-kon focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-kon">
          {m.add}
          <input
            type="file"
            accept="image/*"
            multiple
            aria-describedby={`${id}-rules`}
            className="sr-only"
            onChange={(event) => {
              pick(Array.from(event.target.files ?? []));
              // The same file can then be picked again after taking it out.
              event.target.value = "";
            }}
          />
        </label>
      )}
      {busy && <p className="text-[15px]">{m.stillPreparing}</p>}
    </div>
  );
}
