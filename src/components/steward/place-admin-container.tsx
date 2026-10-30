"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import type { RegionConfig } from "@/lib/region/schema";
import { pickPlaceName } from "@/lib/region/names";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PlaceAdminView, type ComposeResult } from "./place-admin-view";
import { disputeArgs } from "./steward-logic";
import { StewardErrorBoundary, useStewardAction } from "./steward-home-container";

export function PlaceAdminContainer({
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
    <StewardErrorBoundary key={placeId} locale={locale} malformedAsNotFound>
      <LoadPlace locale={locale} region={region} placeId={placeId as Id<"place">} />
    </StewardErrorBoundary>
  );
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
  // Convex validates URL IDs; the keyed boundary handles malformed ones as not found.
  const place = useQuery(api.places.get, { placeId });
  const m = messagesFor(stewardMessages, locale);
  if (place === undefined) return <p role="status">{m.loading}</p>;
  if (place === null || place.regionId !== region.id) return <p>{m.notFound}</p>;
  return (
    <Admin
      key={place._id}
      locale={locale}
      region={region}
      placeId={place._id}
      name={pickPlaceName(place.names, locale, region).primary?.value ?? place.slug}
      slug={place.slug}
      isMock={place.isMock}
    />
  );
}
function Admin({
  placeId,
  locale,
  region,
  name,
  slug,
  isMock,
}: {
  placeId: Id<"place">;
  locale: Locale;
  region: RegionConfig;
  name: string;
  slug: string;
  isMock: boolean;
}) {
  const summaries = useQuery(api.places.listAll, { regionId: region.id });
  const owners = useQuery(api.stewardPeople.list, { role: "business_owner" });
  const sources = useQuery(api.sources.listForSteward, { placeId });
  const claims = useQuery(api.claims.listForPlace, { placeId });
  const attachOwner = useMutation(api.places.attachOwner);
  const recordDemoConsent = useMutation(api.sources.recordDemoConsent);
  const revokeDemoConsent = useMutation(api.sources.revokeDemoConsent);
  const markGone = useMutation(api.sources.markGone);
  const remove = useMutation(api.sources.remove);
  const saveTranslation = useMutation(api.claims.setHumanTranslation);
  const markDisputed = useMutation(api.claims.markDisputed);
  const translate = useMutation(api.aiRequests.translatePlace);
  const compose = useMutation(api.pages.compose);
  const [ownerId, setOwnerId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [composeResult, setComposeResult] = useState<ComposeResult>();
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(stewardMessages, locale);
  if (!summaries || !owners || !sources || !claims) return <p role="status">{m.loading}</p>;
  return (
    <PlaceAdminView
      locale={locale}
      region={region}
      place={{
        name,
        slug,
        isMock,
        ownerCount: summaries.find((place) => place._id === placeId)?.ownerCount ?? 0,
      }}
      owners={owners}
      ownerId={ownerId}
      onOwnerId={setOwnerId}
      sources={sources}
      claims={claims}
      selected={selected}
      translations={translations}
      composeResult={composeResult}
      {...state}
      onAttachOwner={() =>
        void run("owner", async () => {
          await attachOwner({ placeId, personId: ownerId as Id<"person"> });
          setOwnerId("");
          setComposeResult(undefined);
        })
      }
      onSource={(id, action) =>
        void run(`${action}:${id}`, async () => {
          await { recordDemoConsent, revokeDemoConsent, markGone, remove }[action]({
            sourceId: id as Id<"source">,
          });
        })
      }
      onSelect={(id, checked) =>
        setSelected((old) =>
          checked ? [...new Set([...old, id])] : old.filter((item) => item !== id),
        )
      }
      onTranslation={(id, lang, text) =>
        setTranslations((old) => ({ ...old, [`${id}:${lang}`]: text }))
      }
      onSaveTranslation={(id, lang) =>
        void run(`translation:${id}:${lang}`, async () => {
          await saveTranslation({
            claimId: id as Id<"claim">,
            lang,
            text: translations[`${id}:${lang}`] ?? "",
          });
          setTranslations((old) => {
            const next = { ...old };
            delete next[`${id}:${lang}`];
            return next;
          });
        })
      }
      onDispute={() =>
        void run("dispute", async () => {
          const args = disputeArgs(claims.filter((claim) => selected.includes(claim._id)));
          if ("error" in args) throw { data: { code: "invalid_input", message: m[args.error] } };
          await markDisputed({
            claimIdA: args.claimIdA as Id<"claim">,
            claimIdB: args.claimIdB as Id<"claim">,
          });
          setSelected([]);
          setComposeResult(undefined);
        })
      }
      onTranslate={() =>
        void run("translate", async () => {
          const result = await translate({ placeId });
          return format(m.queued, { count: result.pending });
        })
      }
      onCompose={() =>
        void run("compose", async () => {
          setComposeResult(undefined);
          setComposeResult(await compose({ placeId }));
        })
      }
    />
  );
}
