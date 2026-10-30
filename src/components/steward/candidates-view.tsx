"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PlaceMap } from "@/components/map/place-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { candidateMessages } from "@/lib/i18n/messages/candidates";
import type { RegionConfig } from "@/lib/region/schema";
import {
  categoryOptions,
  showChainBadge,
  validatePin,
  type Candidate,
  type CandidateDraft,
} from "./candidates-logic";
import { StewardFeedback, StewardNav, type ActionState } from "./steward-home-view";

export type SavedCandidate = {
  placeId: string;
  slug: string;
  visibility: "draft" | "public";
  publishError?: string;
};
export type CandidatesProps = ActionState & {
  locale: Locale;
  region: RegionConfig;
  candidates: readonly Candidate[];
  category: string;
  focusOnly: boolean;
  localOnly: boolean;
  loading: boolean;
  hasMore: boolean;
  activeId: string | null;
  dismissId: string | null;
  drafts: Readonly<Record<string, CandidateDraft>>;
  saved: readonly SavedCandidate[];
  onFilter: (category: string, focusOnly: boolean, localOnly: boolean) => void;
  onLoadMore: () => void;
  onReview: (candidate: Candidate | null) => void;
  onDraft: (id: string, draft: CandidateDraft) => void;
  onConfirm: (id: string, publish: boolean) => void | Promise<void>;
  onDismissAsk: (id: string | null) => void;
  onDismiss: (id: string) => void | Promise<void>;
};

export function CandidatesView(props: CandidatesProps) {
  const { locale, region, pending } = props;
  const m = messagesFor(candidateMessages, locale);
  const steward = messagesFor(stewardMessages, locale);
  const categories = categoryOptions(region, locale);
  return (
    <PageContainer locale={locale} title={m.title}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} />
        <p>{m.intro}</p>
        {locale === "ja" && <p className="text-sm text-muted-foreground">{m.unreviewed}</p>}
        <StewardFeedback {...props} />
        <div className="grid min-w-0 gap-4 sm:flex sm:flex-wrap sm:items-center">
          <label>
            {m.category}
            <select
              className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
              disabled={!!pending}
              value={props.category}
              onChange={(event) =>
                props.onFilter(event.target.value, props.focusOnly, props.localOnly)
              }
            >
              <option value="">{m.allCategories}</option>
              {categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 w-full min-w-0 items-center gap-2 sm:w-auto">
            <input
              className="size-5 shrink-0 accent-kon"
              type="checkbox"
              role="switch"
              checked={props.focusOnly}
              disabled={!!pending}
              onChange={(event) =>
                props.onFilter(props.category, event.target.checked, props.localOnly)
              }
            />
            {m.focusOnly}
          </label>
          <label className="flex min-h-11 w-full min-w-0 items-center gap-2 sm:w-auto">
            <input
              className="size-5 shrink-0 accent-kon"
              type="checkbox"
              role="switch"
              checked={props.localOnly}
              disabled={!!pending}
              onChange={(event) =>
                props.onFilter(props.category, props.focusOnly, event.target.checked)
              }
            />
            {m.localOnly}
          </label>
        </div>
        <div className="space-y-3" aria-live="polite">
          {props.saved.map((place) => (
            <article
              key={place.placeId}
              className="min-w-0 space-y-2 rounded-[10px] border border-line p-4"
            >
              <p role="status">{place.visibility === "draft" ? m.savedDraft : m.published}</p>
              {place.publishError && <p role="alert">{place.publishError}</p>}
              <Link
                className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
                href={`/${locale}/steward/places/${place.placeId}`}
              >
                {m.draftLink}: {place.slug}
              </Link>
            </article>
          ))}
        </div>
        <section className="space-y-4" aria-label={m.title}>
          {!props.candidates.length && !props.loading && <p>{m.empty}</p>}
          {props.candidates.map((candidate) => {
            const draft = props.drafts[candidate._id];
            const editing = props.activeId === candidate._id && draft;
            const pin = draft ? validatePin(region.id, draft, locale) : null;
            return (
              <article
                data-steward-card="candidate"
                key={candidate._id}
                className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
              >
                <span className="block text-sm font-bold">{m.name}</span>
                <h2 className="min-w-0 text-[22px] font-bold break-words">
                  {candidate.names.ja && <span lang="ja">{candidate.names.ja}</span>}
                  {candidate.names.ja && candidate.names.en && " / "}
                  {candidate.names.en && <span lang="en">{candidate.names.en}</span>}
                  {!candidate.names.ja &&
                    !candidate.names.en &&
                    (candidate.names.primary ?? m.unnamed)}
                </h2>
                {showChainBadge(candidate, props.localOnly) && (
                  <span className="inline-block rounded border px-2 py-0.5 text-xs">{m.chain}</span>
                )}
                <p>
                  <span className="mr-2 font-bold">{m.category}</span>
                  {categories.find((item) => item.key === candidate.category)?.label ??
                    candidate.category}
                </p>
                <p>
                  {m.latitude}: {candidate.lat}, {m.longitude}: {candidate.lng}
                </p>
                <a
                  className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
                  href={`https://www.openstreetmap.org/${candidate.osmType}/${candidate.osmId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {m.osmLink}
                </a>
                <p>© OpenStreetMap contributors</p>
                {editing ? (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void props.onConfirm(candidate._id, false);
                    }}
                  >
                    <fieldset className="min-w-0 space-y-3" disabled={!!pending}>
                      <legend className="font-semibold">{m.names}</legend>
                      <p>{steward.candidateNameHint}</p>
                      {draft.names.map((name, index) => {
                        const change = (patch: Partial<typeof name>) =>
                          props.onDraft(candidate._id, {
                            ...draft,
                            names: draft.names.map((entry, i) =>
                              i === index ? { ...entry, ...patch } : entry,
                            ),
                          });
                        return (
                          <div
                            key={index}
                            className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:items-center"
                          >
                            <label>
                              {m.language}
                              <select
                                className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
                                value={name.lang}
                                onChange={(event) => change({ lang: event.target.value as Locale })}
                              >
                                <option value="ja">{m.ja}</option>
                                <option value="en">{m.en}</option>
                              </select>
                            </label>
                            <label>
                              {m.name}
                              <Input
                                className="min-h-11 min-w-0 rounded-[10px]"
                                value={name.value}
                                lang={name.lang}
                                maxLength={120}
                                onChange={(event) => change({ value: event.target.value })}
                              />
                            </label>
                            <label className="flex min-h-11 w-full min-w-0 items-center gap-2 sm:w-auto">
                              <input
                                className="size-5 shrink-0 accent-kon"
                                type="checkbox"
                                checked={name.isPrimary}
                                onChange={(event) => change({ isPrimary: event.target.checked })}
                              />
                              {m.primary}
                            </label>
                            <Button
                              className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                props.onDraft(candidate._id, {
                                  ...draft,
                                  names: draft.names.filter((_, i) => i !== index),
                                })
                              }
                            >
                              {m.removeName}
                            </Button>
                          </div>
                        );
                      })}
                      <Button
                        className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                        type="button"
                        variant="outline"
                        disabled={draft.names.length >= 12}
                        onClick={() =>
                          props.onDraft(candidate._id, {
                            ...draft,
                            names: [...draft.names, { lang: "en", value: "", isPrimary: false }],
                          })
                        }
                      >
                        {m.addName}
                      </Button>
                      <p>{m.pinHint}</p>
                      <PlaceMap
                        locale={locale}
                        label={m.pin}
                        styleUrl={region.geo.mapStyle.url}
                        attribution={region.geo.attribution}
                        center={{
                          lat: candidate.lat,
                          lng: candidate.lng,
                          zoom: region.defaultCenter.zoom,
                        }}
                        bounds={region.bbox}
                        markers={[]}
                        picker={{
                          value: pin?.ok ? pin.value : null,
                          onChange: (pin) => {
                            if (!pending)
                              props.onDraft(candidate._id, {
                                ...draft,
                                lat: String(pin.lat),
                                lng: String(pin.lng),
                              });
                          },
                        }}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(["lat", "lng"] as const).map((axis) => (
                          <label key={axis}>
                            {axis === "lat" ? m.latitude : m.longitude}
                            <Input
                              className="min-h-11 min-w-0 rounded-[10px]"
                              type="number"
                              step="any"
                              value={draft[axis]}
                              onChange={(event) =>
                                props.onDraft(candidate._id, {
                                  ...draft,
                                  [axis]: event.target.value,
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <label className="block">
                        {m.category}
                        <select
                          className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
                          value={draft.category}
                          onChange={(event) =>
                            props.onDraft(candidate._id, { ...draft, category: event.target.value })
                          }
                        >
                          {categories.map((category) => (
                            <option key={category.key} value={category.key}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                          type="submit"
                        >
                          {m.confirmDraft}
                        </Button>
                        <Button
                          className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                          type="button"
                          onClick={() => void props.onConfirm(candidate._id, true)}
                        >
                          {m.confirmPublish}
                        </Button>
                        <Button
                          className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                          type="button"
                          variant="outline"
                          onClick={() => props.onReview(null)}
                        >
                          {m.cancel}
                        </Button>
                      </div>
                    </fieldset>
                  </form>
                ) : (
                  <Button
                    className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                    disabled={!!pending}
                    onClick={() => props.onReview(candidate)}
                  >
                    {m.review}
                  </Button>
                )}
                {props.dismissId === candidate._id ? (
                  <div className="space-y-2">
                    <p>{m.dismissQuestion}</p>
                    <Button
                      className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                      disabled={!!pending}
                      variant="destructive"
                      onClick={() => void props.onDismiss(candidate._id)}
                    >
                      {m.dismissYes}
                    </Button>
                    <Button
                      className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                      disabled={!!pending}
                      variant="outline"
                      onClick={() => props.onDismissAsk(null)}
                    >
                      {m.cancel}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                    disabled={!!pending}
                    variant="outline"
                    onClick={() => props.onDismissAsk(candidate._id)}
                  >
                    {m.dismiss}
                  </Button>
                )}
              </article>
            );
          })}
        </section>
        {props.loading ? (
          <p role="status">{m.loading}</p>
        ) : props.hasMore ? (
          <Button
            className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
            disabled={!!pending}
            onClick={props.onLoadMore}
          >
            {m.loadMore}
          </Button>
        ) : (
          <p>{m.end}</p>
        )}
      </div>
    </PageContainer>
  );
}
