"use client";

import { Component, useMemo, type ReactNode } from "react";
import { useQueries, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ErrorMessage } from "@/components/layout/error-message";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { ownerMessages } from "@/lib/i18n/messages/owner";
import { publicMessages } from "@/lib/i18n/messages/public";
import { api } from "../../../convex/_generated/api";
import { OwnerHomeView, OwnerLoading } from "./owner-home-view";
import { OwnerNotFound } from "./owner-place-view";
import { placeLabel, reviewCounts, type OwnerRegionProps } from "./review";

type BoundaryProps = {
  locale: Locale;
  children: ReactNode;
  /** An error that means "this is not a place of yours" rather than a failure. */
  notFound?: (error: unknown) => boolean;
  /** Render nothing on failure, for an extra a page can do without. */
  silent?: boolean;
  /** The owner place route supplies main but leaves its heading to the query tree. */
  errorTitle?: string;
};

export class OwnerBoundary extends Component<BoundaryProps, { failed: boolean; error?: unknown }> {
  override state: { failed: boolean; error?: unknown } = { failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;
    if (this.props.notFound?.(this.state.error))
      return <OwnerNotFound locale={this.props.locale} />;
    return (
      <>
        {this.props.errorTitle && (
          <h1 className="text-2xl font-semibold">{this.props.errorTitle}</h1>
        )}
        <ErrorMessage error={this.state.error} locale={this.props.locale} />
      </>
    );
  }
}

function OwnerHomeQuery({ locale, region }: { locale: Locale; region: OwnerRegionProps }) {
  const places = useQuery(api.places.listOwned, {});
  // useQueries resubscribes whenever this object's identity changes, so a fresh object on every render
  // loops forever (React error #301). `places` keeps its identity until the result changes.
  const claimQueries = useMemo(
    () =>
      Object.fromEntries(
        (places ?? []).map((place) => [
          place._id,
          { query: api.claims.listForPlace, args: { placeId: place._id } },
        ]),
      ),
    [places],
  );
  const claimsByPlace: Record<
    string,
    FunctionReturnType<typeof api.claims.listForPlace> | undefined | Error
  > = useQueries(claimQueries);
  if (places === undefined) return <OwnerLoading locale={locale} />;
  const m = messagesFor(ownerMessages, locale);
  const unnamed = messagesFor(publicMessages, locale).unnamed;
  return (
    <OwnerHomeView
      locale={locale}
      items={places.map((place) => {
        const label = placeLabel(place.names, locale, region, unnamed);
        const claims = claimsByPlace[place._id];
        const toReview =
          claims && !(claims instanceof Error) ? reviewCounts(claims, region.locales).toReview : 0;
        return {
          needsReview: toReview > 0,
          id: place._id,
          href: localePath(locale, `/owner/${place._id}`),
          name: label.text,
          lang: label.lang,
          isMock: place.isMock,
          status:
            claims !== undefined && !(claims instanceof Error) ? (
              <span lang={locale} className="text-sm text-muted-foreground">
                {toReview > 0 ? format(m.reviewCount, { count: toReview }) : m.nothingToReview}
              </span>
            ) : null,
        };
      })}
    />
  );
}

export function OwnerHomeContainer(props: { locale: Locale; region: OwnerRegionProps }) {
  return (
    <OwnerBoundary key={props.locale} locale={props.locale}>
      <OwnerHomeQuery {...props} />
    </OwnerBoundary>
  );
}
