"use client";

import { Component, use, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { errorText } from "@/components/layout/error-text";
import { ErrorMessage } from "@/components/layout/error-message";
import { PageContainer } from "@/components/layout/page-container";
import { messagesFor, type Locale } from "@/lib/i18n";
import { creatorMessages } from "@/lib/i18n/messages/creator";
import type { RegionConfig } from "@/lib/region";
import { api } from "../../../convex/_generated/api";
import { searchPlaces } from "./geo-search";
import { CreatorHomeView } from "./creator-home-view";
import { wizardHref, wizardStep, type WizardStep } from "./place-wizard";
import { NewPlaceView, type SearchState, type SearchActions } from "./new-place-view";
import { toCreateArgs, validatePlaceDraft, type PlaceDraft, type PlaceErrors } from "./place-form";

export class CreatorErrorBoundary extends Component<
  { locale: Locale; malformedAsNotFound?: boolean; children: ReactNode },
  { error: unknown }
> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      const error = this.state.error;
      const malformed =
        this.props.malformedAsNotFound &&
        error instanceof Error &&
        /(?:ArgumentValidationError|invalid.*id|not a valid.*id)/i.test(error.message);
      return (
        <PageContainer
          locale={this.props.locale}
          title={
            messagesFor(creatorMessages, this.props.locale)[
              this.props.malformedAsNotFound ? "editor" : "home"
            ]
          }
        >
          {malformed ? (
            <p role="alert">{messagesFor(creatorMessages, this.props.locale).notFound}</p>
          ) : (
            <ErrorMessage error={error} locale={this.props.locale} />
          )}
        </PageContainer>
      );
    }
    return this.props.children;
  }
}

export function useCreatorSearch(
  locale: Locale,
  confirm: (pin: NonNullable<PlaceDraft["pin"]>) => void,
  initialCenter?: { lat: number; lng: number },
): { state: SearchState; actions: SearchActions } {
  const [state, setState] = useState<SearchState>({
    query: "",
    pending: false,
    coolingDown: false,
    center: initialCenter,
  });
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    state,
    actions: {
      onQuery: (query) => setState((old) => ({ ...old, query })),
      onSelect: (selected) =>
        setState((old) => ({ ...old, selected, center: { lat: selected.lat, lng: selected.lng } })),
      onConfirm: () => {
        if (state.selected) {
          confirm({ lat: state.selected.lat, lng: state.selected.lng });
          setState((old) => ({ ...old, selected: undefined }));
        }
      },
      onSearch: async () => {
        if (locked.current) return;
        locked.current = true;
        setState((old) => ({ ...old, pending: true }));
        const outcome = await searchPlaces(state.query, locale);
        const busy = !outcome.ok && outcome.kind === "busy";
        setState((old) => ({ ...old, pending: false, coolingDown: busy, outcome }));
        if (busy)
          timer.current = setTimeout(() => {
            locked.current = false;
            setState((old) => ({ ...old, coolingDown: false }));
          }, 1000);
        else locked.current = false;
      },
    },
  };
}

export function CreatorHomeContainer({
  params,
  locale,
  region,
}: {
  params: Promise<{ lang: string }>;
  locale: Locale;
  region: RegionConfig;
}) {
  use(params);
  const person = useQuery(api.people.current, {});
  const places = useQuery(api.places.listMine, { regionId: region.id });
  const create = useMutation(api.places.create);
  const router = useRouter();
  const query = useSearchParams();
  const adding = query.get("add") === "1";
  const step = wizardStep(query.get("step"));
  function changeStep(next: WizardStep | 0) {
    router.push(next === 0 ? `/${locale}/creator` : wizardHref(locale, next), { scroll: false });
  }
  const m = messagesFor(creatorMessages, locale);
  const [draft, setDraft] = useState<PlaceDraft>({
    kind: "business",
    names: [],
    pin: null,
  });
  const [errors, setErrors] = useState<PlaceErrors>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const search = useCreatorSearch(locale, (pin) => setDraft((old) => ({ ...old, pin })));
  async function submit() {
    const errors = validatePlaceDraft(draft, region);
    setErrors(errors);
    if (pending) return;
    if (Object.keys(errors).length) {
      changeStep(errors.pin ? 1 : 2);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await create(toCreateArgs(draft, region.id));
      router.push(`/${locale}/creator/places/${result.placeId}`);
    } catch (error) {
      setError(errorText(error, locale));
    } finally {
      setPending(false);
    }
  }
  if (!person || !places)
    return (
      <PageContainer title={m.home} locale={locale}>
        <p role="status">{m.loading}</p>
      </PageContainer>
    );
  return (
    <CreatorHomeView locale={locale} region={region} places={places} adding={adding}>
      <NewPlaceView
        locale={locale}
        region={region}
        role={person.role}
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setErrors({});
        }}
        errors={errors}
        pending={pending}
        error={error}
        search={search.state}
        searchActions={search.actions}
        step={step}
        active={adding}
        onStep={changeStep}
        onCreate={() => void submit()}
      />
    </CreatorHomeView>
  );
}
