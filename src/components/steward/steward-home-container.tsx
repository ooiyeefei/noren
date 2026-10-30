"use client";

import { Component, use, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { errorText } from "@/components/layout/error-text";
import { ErrorPage } from "@/components/layout/error-page";
import { PageContainer } from "@/components/layout/page-container";
import { messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import type { RegionConfig } from "@/lib/region/schema";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { placeRows, visibilityArgs, visibilityChoices } from "./steward-logic";
import { StewardHomeView, type ActionState, type VisibilityDraft } from "./steward-home-view";

export class StewardErrorBoundary extends Component<
  { locale: Locale; malformedAsNotFound?: boolean; children: ReactNode },
  { error: unknown }
> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      const malformed =
        this.props.malformedAsNotFound &&
        this.state.error instanceof Error &&
        /(?:ArgumentValidationError|invalid.*id|not a valid.*id)/i.test(this.state.error.message);
      return malformed ? (
        <PageContainer
          locale={this.props.locale}
          title={messagesFor(stewardMessages, this.props.locale).notFoundTitle}
        >
          <p role="alert">{messagesFor(stewardMessages, this.props.locale).notFound}</p>
        </PageContainer>
      ) : (
        <ErrorPage error={this.state.error} locale={this.props.locale} />
      );
    }
    return this.props.children;
  }
}
export function useStewardAction(locale: Locale) {
  const [state, setState] = useState<ActionState>({});
  const locked = useRef(false);
  async function run(action: string, work: () => Promise<string | void>) {
    if (locked.current) return;
    locked.current = true;
    setState({ pending: action });
    try {
      const success = await work();
      setState({ success: success ?? messagesFor(stewardMessages, locale).saved });
    } catch (error) {
      setState({ error: errorText(error, locale) });
    } finally {
      locked.current = false;
    }
  }
  return { state, run };
}
export function StewardHomeContainer({
  params,
  locale,
  region,
}: {
  params: Promise<{ lang: string }>;
  locale: Locale;
  region: RegionConfig;
}) {
  use(params);
  const places = useQuery(api.places.listAll, { regionId: region.id });
  const setKind = useMutation(api.places.setKind);
  const setVisibility = useMutation(api.places.setVisibility);
  const [drafts, setDrafts] = useState<Record<string, VisibilityDraft>>({});
  const { state, run } = useStewardAction(locale);
  if (places === undefined)
    return <p role="status">{messagesFor(stewardMessages, locale).loading}</p>;
  return (
    <StewardHomeView
      locale={locale}
      region={region}
      rows={placeRows(places, locale, region)}
      drafts={drafts}
      {...state}
      onDraft={(id, draft) => setDrafts((old) => ({ ...old, [id]: draft }))}
      onKind={(id, kind) =>
        void run(`kind:${id}`, async () => {
          await setKind({ placeId: id as Id<"place">, kind });
          setDrafts((old) => {
            const next = { ...old };
            delete next[id];
            return next;
          });
        })
      }
      onVisibility={(id, draft) =>
        void run(`visibility:${id}`, async () => {
          const place = places.find((place) => place._id === id);
          const choice =
            place &&
            visibilityChoices(place, region).find((item) => item.visibility === draft.visibility);
          const args = choice && visibilityArgs(id, draft.visibility, draft, choice);
          if (!args)
            throw {
              data: {
                code: "conflict",
                message: messagesFor(stewardMessages, locale).visibilityRule,
              },
            };
          await setVisibility({ ...args, placeId: id as Id<"place"> });
          setDrafts((old) => {
            const next = { ...old };
            delete next[id];
            return next;
          });
        })
      }
    />
  );
}
