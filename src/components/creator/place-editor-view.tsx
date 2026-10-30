"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { PlaceMap } from "@/components/map/place-map";
import { labelForCategory } from "@/components/public/category";
import { DemoBadge } from "@/components/badges";
import { EmbedView, type EmbedSourceView } from "@/components/embeds/embed-view";
import { PageContainer } from "@/components/layout/page-container";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { frameHostsFor, scriptHostsFor } from "@/lib/adapters";
import type { InterviewStatus } from "@/lib/domain/constants";
import { createOpenFreeMapStyle } from "@/lib/geo";
import { messagesFor, type Locale } from "@/lib/i18n";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import type { RegionConfig } from "@/lib/region";
import {
  CategorySelect,
  PlaceNamesEditor,
  PlacePinSearch,
  type SearchActions,
  type SearchState,
} from "./new-place-view";
import { previewSource, type PlaceDraft, type PlaceErrors, type SourceDraft } from "./place-form";

export type EditorPlace = { id: string; slug: string; canEdit: boolean; isMock: boolean };
export type EditorInterview = {
  id: string;
  language: string;
  status: InterviewStatus;
  isMock: boolean;
};
export type PlaceEditorViewProps = {
  locale: Locale;
  region: RegionConfig;
  place: EditorPlace;
  draft: PlaceDraft;
  errors?: PlaceErrors;
  sourceDraft: SourceDraft;
  sourceError?: keyof SourceDraft;
  posts: EmbedSourceView[];
  interviews: EditorInterview[];
  interviewLanguage: string;
  pending?: string;
  error?: string;
  saved?: boolean;
  search: SearchState;
  searchActions: SearchActions;
  onChange(draft: PlaceDraft): void;
  onSaveDetails(): void;
  onSavePin(): void;
  onSourceChange(draft: SourceDraft): void;
  onAddPost(): void;
  onRemovePost(id: string): void;
  onInterviewLanguage(language: string): void;
  onStartInterview(): void;
};
export function PlaceEditorView(props: PlaceEditorViewProps) {
  const {
    locale,
    region,
    place,
    draft,
    errors,
    sourceDraft,
    sourceError,
    posts,
    interviews,
    interviewLanguage,
    pending,
    error,
    saved,
    search,
    searchActions,
  } = props;
  const m = messagesFor(creatorMessages, locale);
  const id = useId();
  const [movingPin, setMovingPin] = useState(false);
  const [addingPost, setAddingPost] = useState(false);
  const style = createOpenFreeMapStyle(region);
  const pinPreview = draft.pin && (
    <div className="space-y-3 [&_.h-96]:h-44">
      <p>{m.pinPlaced}</p>
      <PlaceMap
        locale={locale}
        label={m.pin}
        styleUrl={style.styleUrl(region, "liberty", locale)}
        attribution={style.attribution}
        center={{ ...draft.pin, zoom: 17 }}
        markers={[{ id: place.id, ...draft.pin, label: m.pinPlaced, isMock: place.isMock }]}
      />
    </div>
  );
  const preview = sourceDraft.url.trim()
    ? previewSource(sourceDraft.url, region.enabledSourceAdapters)
    : null;
  const languageOptions = region.locales.map((l) => (
    <option key={l} value={l}>
      {l === "ja" || l === "en" ? m[l] : l}
    </option>
  ));
  const sourceField = (field: Exclude<keyof SourceDraft, "noteLang">, limit?: number) => (
    <div>
      <Label htmlFor={`${id}-${field}`}>{m[field]}</Label>
      <Input
        className="min-h-11 rounded-[10px]"
        id={`${id}-${field}`}
        value={sourceDraft[field]}
        maxLength={limit}
        aria-invalid={sourceError === field}
        aria-describedby={sourceError === field ? `${id}-${field}-error` : undefined}
        onChange={(event) => {
          const value = event.target.value;
          const next = { ...sourceDraft, [field]: value };
          if (field === "url") {
            const suggestion = previewSource(value, region.enabledSourceAdapters);
            next.authorHandle = suggestion.ok ? (suggestion.suggestedAuthor?.handle ?? "") : "";
            next.authorUrl = suggestion.ok ? (suggestion.suggestedAuthor?.url ?? "") : "";
          }
          props.onSourceChange(next);
        }}
      />
      {sourceError === field && (
        <p id={`${id}-${field}-error`} role="alert">
          {m.invalidField}
        </p>
      )}
    </div>
  );
  return (
    <PageContainer
      locale={locale}
      title={m.editor}
      actions={
        <Link
          className="inline-flex min-h-11 items-center text-ai underline"
          href={`/${locale}/places/${place.slug}`}
        >
          {m.publicPage}
        </Link>
      }
    >
      {place.isMock && <DemoBadge locale={locale} />}
      {error && <Alert>{error}</Alert>}
      {saved && <p role="status">{m.saved}</p>}
      {!place.canEdit && <p>{m.readOnly}</p>}
      <section className="space-y-4 border-b border-line pb-6" aria-labelledby={`${id}-interviews`}>
        <h2 id={`${id}-interviews`} className="text-[22px] font-bold">
          {m.ownerInterview}
        </h2>
        {!interviews.length && <p>{m.noInterviews}</p>}
        <ul className="space-y-2">
          {interviews.map((interview) => (
            <li
              key={interview.id}
              className="flex min-h-16 flex-wrap items-center gap-3 border-b border-line py-3"
            >
              <Link
                className="inline-flex min-h-11 min-w-0 items-center break-words text-ai underline"
                href={`/${locale}/creator/interviews/${interview.id}`}
              >
                {m.interviewLabel
                  .replace(
                    "{language}",
                    interview.language === "ja"
                      ? m.interviewJapanese
                      : interview.language === "en"
                        ? m.interviewEnglish
                        : interview.language,
                  )
                  .replace(
                    "{status}",
                    interview.status === "done"
                      ? m.interviewFinished
                      : m[interview.status].toLocaleLowerCase(locale),
                  )}
              </Link>
              {interview.isMock && <DemoBadge locale={locale} />}
            </li>
          ))}
        </ul>
        {place.canEdit && (
          <fieldset disabled={!!pending} className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor={`${id}-interview`}>{m.interviewLanguage}</Label>
              <select
                id={`${id}-interview`}
                className="min-h-11 max-w-full rounded-[10px] border border-input p-2"
                value={interviewLanguage}
                onChange={(event) => props.onInterviewLanguage(event.target.value)}
              >
                {languageOptions}
              </select>
            </div>
            <Button
              className="min-h-11 rounded-[10px] px-4 whitespace-normal"
              type="button"
              onClick={props.onStartInterview}
            >
              {pending === "interview" ? m.pending : m.startInterview}
            </Button>
          </fieldset>
        )}
      </section>
      {place.canEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) props.onSaveDetails();
          }}
        >
          <fieldset disabled={!!pending} className="min-w-0 space-y-6 border-b border-line pb-6">
            <h2 className="text-[22px] font-bold">{m.details}</h2>
            <CategorySelect
              locale={locale}
              region={region}
              value={draft.category}
              onChange={(category) => props.onChange({ ...draft, category })}
            />
            <PlaceNamesEditor
              locale={locale}
              locales={region.locales}
              names={draft.names}
              errors={errors}
              onChange={(names) => props.onChange({ ...draft, names })}
            />
            <Button className="min-h-11 rounded-[10px] px-4 whitespace-normal" type="submit">
              {pending === "details" ? m.pending : m.saveDetails}
            </Button>
          </fieldset>
        </form>
      ) : (
        <section>
          {draft.category && <p>{labelForCategory(region, draft.category, locale)}</p>}
          <h2 className="text-[22px] font-bold">{m.names}</h2>
          <ul>
            {draft.names.map((name, i) => (
              <li key={i} lang={name.lang}>
                {name.value}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-4 border-b border-line pb-6">
        <h2 className="text-[22px] font-bold">{m.pin}</h2>
        {movingPin && place.canEdit ? (
          <fieldset disabled={!!pending} className="min-w-0 space-y-4">
            <PlacePinSearch
              locale={locale}
              region={region}
              draft={draft}
              search={search}
              searchActions={searchActions}
              errors={errors}
              onChange={props.onChange}
            />
            <Button
              className="min-h-11 rounded-[10px] px-4 whitespace-normal"
              type="button"
              onClick={props.onSavePin}
            >
              {pending === "pin" ? m.pending : m.savePin}
            </Button>
          </fieldset>
        ) : (
          <>
            {pinPreview ?? <p>{m.no_pin}</p>}
            {place.canEdit && (
              <Button
                className="min-h-11 rounded-[10px] px-4 whitespace-normal"
                type="button"
                variant="outline"
                disabled={!!pending}
                onClick={() => setMovingPin(true)}
              >
                {m.movePin}
              </Button>
            )}
          </>
        )}
      </section>
      <section id="posts" className="space-y-4 border-b border-line pb-6">
        <h2 className="text-[22px] font-bold">{m.posts}</h2>
        {!posts.length && <p>{m.noPosts}</p>}
        {posts.map((post) => (
          <div key={post.id} className="space-y-2 border-b border-line py-4">
            <EmbedView
              locale={locale}
              source={post}
              scriptOrigins={scriptHostsFor(region.enabledSourceAdapters)}
              frameOrigins={frameHostsFor(region.enabledSourceAdapters)}
            />
            {place.canEdit && (
              <Button
                className="min-h-11 rounded-[10px] px-4 whitespace-normal"
                type="button"
                variant="outline"
                disabled={!!pending}
                onClick={() => props.onRemovePost(post.id)}
              >
                {pending === `remove:${post.id}` ? m.pending : m.remove}
              </Button>
            )}
          </div>
        ))}
      </section>
      {place.canEdit && (
        <Button
          className="min-h-11 rounded-[10px] px-4 whitespace-normal"
          type="button"
          variant="outline"
          aria-expanded={addingPost}
          aria-controls={`${id}-post-form`}
          disabled={!!pending}
          onClick={() => setAddingPost(!addingPost)}
        >
          {m.openPostForm}
        </Button>
      )}
      {place.canEdit && addingPost && (
        <form
          id={`${id}-post-form`}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) props.onAddPost();
          }}
        >
          <fieldset disabled={!!pending} className="space-y-4">
            <legend className="text-[22px] font-bold">{m.addPost}</legend>
            {sourceField("url")}
            {preview && (
              <p role="status">
                {preview.ok
                  ? `${preview.platform}, ${preview.linkCard ? m.linkCard : m.embed}`
                  : preview.reason === "too_long" ||
                      preview.reason === "unsupported_scheme" ||
                      preview.reason === "no_adapter"
                    ? m[preview.reason]
                    : m.invalid_url}
              </p>
            )}
            {sourceField("title", 200)}
            {sourceField("note", 1000)}
            <div>
              <Label htmlFor={`${id}-noteLang`}>{m.noteLang}</Label>
              <select
                id={`${id}-noteLang`}
                className="min-h-11 max-w-full rounded-[10px] border border-input p-2"
                value={sourceDraft.noteLang}
                onChange={(event) =>
                  props.onSourceChange({ ...sourceDraft, noteLang: event.target.value })
                }
              >
                {languageOptions}
              </select>
              {sourceError === "noteLang" && <p role="alert">{m.invalidField}</p>}
            </div>
            <p className="text-sm">{m.authorHint}</p>
            {sourceField("authorHandle")}
            {sourceField("authorUrl")}
            <Button
              className="min-h-11 rounded-[10px] px-4 whitespace-normal"
              type="submit"
              disabled={!preview?.ok}
            >
              {pending === "post" ? m.pending : m.addPost}
            </Button>
          </fieldset>
        </form>
      )}
    </PageContainer>
  );
}
