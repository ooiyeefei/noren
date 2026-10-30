"use client";

import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { OwnerBoundary } from "./owner-home-container";
import { OwnerLoading } from "./owner-home-view";
import { OwnerNotFound, OwnerPlaceView } from "./owner-place-view";
import {
  isInvalidIdError,
  type OpenTextSource,
  type OwnerClaim,
  type OwnerRegionProps,
} from "./review";

type Props = {
  params: Promise<{ lang: string; placeId: string }>;
  locale: Locale;
  region: OwnerRegionProps;
};

export function OwnerPlaceGate({
  placeId,
  locale,
  region,
}: Omit<Props, "params"> & { placeId: string }) {
  const normalizedId = useQuery(api.ids.normalize, { table: "place", id: placeId });
  if (normalizedId === undefined) return <OwnerLoading locale={locale} />;
  if (normalizedId === null) return <OwnerNotFound locale={locale} />;
  return <OwnerPlaceQuery placeId={normalizedId as Id<"place">} locale={locale} region={region} />;
}

function OwnerPlaceQuery({
  placeId,
  locale,
  region,
}: Omit<Props, "params"> & { placeId: Id<"place"> }) {
  const place = useQuery(api.places.get, { placeId });
  const owned = place?.isOwner === true;
  // Only an owner may list claims and interviews; asking as anyone else would throw.
  const claims = useQuery(api.claims.listForPlace, owned ? { placeId } : "skip");
  const interviews = useQuery(api.interviews.listForPlace, owned ? { placeId } : "skip");
  // An open-text claim's licence and source come from the page it appears on.
  const needsOpenText = claims?.some((claim) => claim.origin === "open_text") === true;
  const page = useQuery(api.pages.getPublished, needsOpenText ? { placeId } : "skip");
  const review = useMutation(api.claims.review);
  const withdraw = useMutation(api.interviews.withdraw);
  const translate = useMutation(api.aiRequests.translatePlace);

  if (place === undefined) return <OwnerLoading locale={locale} />;
  if (place === null || !place.isOwner) return <OwnerNotFound locale={locale} />;
  if (claims === undefined || interviews === undefined) return <OwnerLoading locale={locale} />;

  const openText = new Map<string, OpenTextSource>();
  for (const claim of page?.claims ?? []) {
    if (claim.openText) openText.set(claim._id, claim.openText);
  }
  const claimId = (id: string) => {
    const claim = claims.find((candidate) => candidate._id === id);
    if (claim === undefined) throw new Error(`Unknown claim ${id}`);
    return claim._id;
  };
  const interviewId = (id: string) => {
    const interview = interviews.find((candidate) => candidate._id === id);
    if (interview === undefined) throw new Error(`Unknown interview ${id}`);
    return interview._id;
  };
  const ownerClaims: OwnerClaim[] = claims.map((claim) => ({
    ...claim,
    openText: openText.get(claim._id),
  }));
  return (
    <OwnerPlaceView
      locale={locale}
      region={region}
      place={place}
      claims={ownerClaims}
      interviews={interviews}
      onConfirm={async (id) => {
        await review({ claimId: claimId(id), action: "confirm" });
      }}
      onEdit={async (id, text) => {
        await review({ claimId: claimId(id), action: "edit", text });
      }}
      onRemove={async (id) => {
        await review({ claimId: claimId(id), action: "remove" });
      }}
      onTranslate={() => translate({ placeId })}
      onWithdraw={async (id) => {
        await withdraw({ interviewId: interviewId(id) });
      }}
    />
  );
}

export function OwnerPlaceContainer(props: Props) {
  const { placeId } = use(props.params);
  return (
    <OwnerBoundary
      key={`${props.locale}/${placeId}`}
      locale={props.locale}
      notFound={isInvalidIdError}
      errorTitle={messagesFor(shellMessages, props.locale).errorTitle}
    >
      <OwnerPlaceGate placeId={placeId} locale={props.locale} region={props.region} />
    </OwnerBoundary>
  );
}
