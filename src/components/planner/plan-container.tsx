"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useMemo } from "react";
import { VoiceInput } from "@/components/voice/voice-input";
import { displayName } from "@/lib/connector/present";
import { readLocation } from "@/lib/collection/location";
import { messagesFor, type Locale } from "@/lib/i18n";
import { plannerMessages } from "@/lib/i18n/messages/planner";
import { shellMessages } from "@/lib/i18n/messages/shell";
import type { PlaceOption } from "@/lib/planner/start";
import type { Neighbourhood, RegionConfig } from "@/lib/region/schema";
import { api } from "../../../convex/_generated/api";
import { PlanScreen } from "./plan-screen";

type NameRegion = Pick<RegionConfig, "nameFallback" | "defaultLocale">;

export function SignInPrompt({ locale }: { locale: Locale }): React.JSX.Element {
  const m = messagesFor(plannerMessages, locale);
  return (
    <section
      aria-labelledby="plan-sign-in"
      className="max-w-prose space-y-3 rounded-[10px] border border-line bg-white p-5"
    >
      <h2 id="plan-sign-in" className="font-sans text-[22px] font-bold">
        {m.signInTitle}
      </h2>
      <p>{m.signInBody}</p>
      <Link
        className="inline-flex min-h-11 items-center rounded-[10px] bg-kon px-6 font-bold text-white"
        href={`/${locale}/sign-in?redirect_url=${encodeURIComponent(`/${locale}/plan`)}`}
      >
        {m.signInLink}
      </Link>
    </section>
  );
}

/** "Plan my day": for signed-in members, because each question costs AI money. */
export function PlanContainer({
  locale,
  regionId,
  neighbourhoods,
  nameRegion,
}: {
  locale: Locale;
  regionId: string;
  neighbourhoods: readonly Neighbourhood[];
  nameRegion: NameRegion;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return <p role="status">{messagesFor(shellMessages, locale).signingIn}</p>;
  }
  if (!isAuthenticated) return <SignInPrompt locale={locale} />;
  return (
    <SignedInPlan
      locale={locale}
      regionId={regionId}
      neighbourhoods={neighbourhoods}
      nameRegion={nameRegion}
    />
  );
}

function SignedInPlan({
  locale,
  regionId,
  neighbourhoods,
  nameRegion,
}: {
  locale: Locale;
  regionId: string;
  neighbourhoods: readonly Neighbourhood[];
  nameRegion: NameRegion;
}) {
  const ask = useAction(api.plannerActions.ask);
  const listed = useQuery(api.places.listForMap, { regionId });
  const places = useMemo<PlaceOption[]>(
    () =>
      (listed ?? [])
        .filter((place) => !place.isMock)
        .map((place) => ({
          slug: place.slug,
          name: displayName(place, nameRegion),
          searchable: place.names.map((name) => name.value),
        })),
    [listed, nameRegion],
  );
  return (
    <PlanScreen
      locale={locale}
      neighbourhoods={neighbourhoods}
      places={places}
      ask={ask}
      locate={() => readLocation(navigator.geolocation)}
      voice={(onText) => <VoiceInput locale={locale} onText={onText} />}
    />
  );
}
