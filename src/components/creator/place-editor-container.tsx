"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { errorText } from "@/components/layout/error-text";
import { messagesFor, type Locale } from "@/lib/i18n";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import type { RegionConfig } from "@/lib/region";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CreatorErrorBoundary, useCreatorSearch } from "./creator-home-container";
import { PlaceEditorView } from "./place-editor-view";
import {
  previewSource,
  toAddSourceArgs,
  toCreateArgs,
  validatePlaceDraft,
  type PlaceDraft,
  type PlaceErrors,
  type SourceDraft,
} from "./place-form";

export function PlaceEditorContainer({
  params,
  locale,
  region,
}: {
  params: Promise<{ lang: string; placeId: string }>;
  locale: Locale;
  region: RegionConfig;
}) {
  const { placeId } = use(params);
  return (
    <CreatorErrorBoundary key={placeId} locale={locale} malformedAsNotFound>
      <PlaceEditorGate placeId={placeId} locale={locale} region={region} />
    </CreatorErrorBoundary>
  );
}

export function PlaceEditorGate({
  placeId,
  locale,
  region,
}: {
  placeId: string;
  locale: Locale;
  region: RegionConfig;
}) {
  const normalizedId = useQuery(api.ids.normalize, { table: "place", id: placeId });
  const m = messagesFor(creatorMessages, locale);
  if (normalizedId === undefined)
    return (
      <PageContainer locale={locale} title={m.editor}>
        <p role="status">{m.loading}</p>
      </PageContainer>
    );
  if (normalizedId === null)
    return (
      <PageContainer locale={locale} title={m.notFoundTitle}>
        <p>{m.notFound}</p>
      </PageContainer>
    );
  return <LoadPlace placeId={normalizedId as Id<"place">} locale={locale} region={region} />;
}

function LoadPlace({
  placeId,
  locale,
  region,
}: {
  placeId: Id<"place">;
  locale: Locale;
  region: RegionConfig;
}) {
  const place = useQuery(api.places.get, { placeId });
  const m = messagesFor(creatorMessages, locale);
  if (place === undefined)
    return (
      <PageContainer locale={locale} title={m.editor}>
        <p role="status">{m.loading}</p>
      </PageContainer>
    );
  if (place === null || place.regionId !== region.id)
    return (
      <PageContainer locale={locale} title={m.notFoundTitle}>
        <p>{m.notFound}</p>
      </PageContainer>
    );
  return <Editor key={place._id} locale={locale} region={region} place={place} />;
}

type PlaceDetail = NonNullable<ReturnType<typeof useQuery<typeof api.places.get>>>;
function Editor({
  place,
  locale,
  region,
}: {
  place: PlaceDetail;
  locale: Locale;
  region: RegionConfig;
}) {
  const posts = useQuery(api.sources.listForPlace, { placeId: place._id });
  const interviews = useQuery(
    api.interviews.listForPlace,
    place.canManage ? { placeId: place._id } : "skip",
  );
  const updateNames = useMutation(api.places.updateNames);
  const setCategory = useMutation(api.places.setCategory);
  const movePin = useMutation(api.places.movePin);
  const add = useMutation(api.sources.add);
  const remove = useMutation(api.sources.remove);
  const createInterview = useMutation(api.interviews.create);
  const router = useRouter();
  const [draft, setDraft] = useState<PlaceDraft>({
    kind: place.kind,
    category: place.category,
    names: place.names,
    pin: place.pin,
  });
  const [errors, setErrors] = useState<PlaceErrors>({});
  const emptySource: SourceDraft = {
    url: "",
    title: "",
    note: "",
    noteLang: region.defaultLocale,
    authorHandle: "",
    authorUrl: "",
  };
  const [sourceDraft, setSourceDraft] = useState(emptySource);
  const [sourceError, setSourceError] = useState<keyof SourceDraft>();
  const [language, setLanguage] = useState(region.defaultLocale);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const search = useCreatorSearch(
    locale,
    (pin) => setDraft((old) => ({ ...old, pin })),
    place.pin ?? undefined,
  );
  async function run(action: string, perform: () => Promise<unknown>) {
    if (pending) return;
    setPending(action);
    setError(undefined);
    setSaved(false);
    try {
      await perform();
      setSaved(true);
    } catch (error) {
      setError(errorText(error, locale));
    } finally {
      setPending(undefined);
    }
  }
  function saveNames() {
    const errors = validatePlaceDraft(draft, region);
    delete errors.pin;
    setErrors(errors);
    if (Object.keys(errors).length) return;
    const names = toCreateArgs(
      { ...draft, pin: draft.pin ?? region.defaultCenter },
      region.id,
    ).names;
    void run("names", () => updateNames({ placeId: place._id, names }));
  }
  function savePin() {
    const error = validatePlaceDraft(draft, region).pin;
    setErrors(error ? { pin: error } : {});
    if (error || !draft.pin) return;
    const pin = draft.pin;
    void run("pin", () => movePin({ placeId: place._id, ...pin }));
  }
  function addPost() {
    const preview = previewSource(sourceDraft.url, region.enabledSourceAdapters);
    if (!preview.ok) {
      setSourceError("url");
      return;
    }
    if (preview.linkCard && !sourceDraft.title.trim()) {
      setSourceError("title");
      return;
    }
    if (sourceDraft.note.trim() && !region.locales.includes(sourceDraft.noteLang)) {
      setSourceError("noteLang");
      return;
    }
    const result = toAddSourceArgs(sourceDraft, place._id);
    if (!result.ok) {
      setSourceError(result.field);
      return;
    }
    setSourceError(undefined);
    void run("post", async () => {
      await add({ ...result.args, placeId: place._id });
      setSourceDraft(emptySource);
    });
  }
  if (posts === undefined || (place.canManage && interviews === undefined)) {
    return (
      <PageContainer locale={locale} title={messagesFor(creatorMessages, locale).editor}>
        <p role="status">{messagesFor(creatorMessages, locale).loading}</p>
      </PageContainer>
    );
  }
  return (
    <PlaceEditorView
      locale={locale}
      region={region}
      place={{ id: place._id, slug: place.slug, canEdit: place.canEdit, isMock: place.isMock }}
      draft={draft}
      onChange={setDraft}
      errors={errors}
      sourceDraft={sourceDraft}
      onSourceChange={setSourceDraft}
      sourceError={sourceError}
      posts={(posts ?? []).map((post) => ({ ...post, id: post._id }))}
      interviews={(interviews ?? []).map((interview) => ({ ...interview, id: interview._id }))}
      interviewLanguage={language}
      onInterviewLanguage={setLanguage}
      pending={pending}
      error={error}
      saved={saved}
      search={search.state}
      searchActions={search.actions}
      onSaveCategory={() =>
        void run("category", () =>
          setCategory({
            placeId: place._id,
            ...(draft.category ? { category: draft.category } : { clear: true }),
          }),
        )
      }
      onSaveNames={saveNames}
      onSavePin={savePin}
      onAddPost={addPost}
      onRemovePost={(sourceId) =>
        void run(`remove:${sourceId}`, () => remove({ sourceId: sourceId as Id<"source"> }))
      }
      onStartInterview={() =>
        void run("interview", async () => {
          const id = await createInterview({ placeId: place._id, language });
          router.push(`/${locale}/creator/interviews/${id}`);
        })
      }
    />
  );
}
