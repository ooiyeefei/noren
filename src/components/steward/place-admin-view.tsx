"use client";

import Link from "next/link";
import { AiAssistedBadge } from "@/components/badges/ai-assisted-badge";
import { DemoBadge } from "@/components/badges/demo-badge";
import { MachineTranslationBadge } from "@/components/badges/machine-translation-badge";
import { UnreviewedBadge } from "@/components/badges/unreviewed-badge";
import { EmbedView } from "@/components/embeds/embed-view";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { frameHostsFor, scriptHostsFor } from "@/lib/adapters";
import { messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import type { RegionConfig } from "@/lib/region/schema";
import type { ClaimView } from "../../../convex/claims";
import type { SourceView } from "../../../convex/sources";
import type { PersonRow } from "./people-view";
import { disputeArgs, missingTranslations } from "./steward-logic";
import { StewardFeedback, StewardNav, type ActionState } from "./steward-home-view";

export type ComposeResult = {
  pageVersionId: string;
  version: number;
  sentenceCount: number;
  heldCount: number;
  publishedClaims: number;
};
export type PlaceAdminProps = ActionState & {
  locale: Locale;
  region: Pick<RegionConfig, "locales" | "enabledSourceAdapters">;
  place: { name: string; slug: string; ownerCount: number; isMock: boolean };
  owners: readonly PersonRow[];
  ownerId: string;
  onOwnerId: (id: string) => void;
  onAttachOwner: () => void;
  sources: readonly SourceView[];
  onSource: (
    id: string,
    action: "recordDemoConsent" | "revokeDemoConsent" | "markGone" | "remove",
  ) => void;
  claims: readonly ClaimView[];
  selected: readonly string[];
  onSelect: (id: string, selected: boolean) => void;
  translations: Readonly<Record<string, string>>;
  onTranslation: (id: string, lang: string, text: string) => void;
  onSaveTranslation: (id: string, lang: string) => void;
  onDispute: () => void;
  onTranslate: () => void;
  onCompose: () => void;
  composeResult?: ComposeResult;
};
export function ComposeResultView({ locale, result }: { locale: Locale; result: ComposeResult }) {
  const m = messagesFor(stewardMessages, locale);
  return (
    <div role="status" className="min-w-0 space-y-2 rounded-[10px] border border-line p-4">
      <dl className="grid grid-cols-2 gap-2">
        <dt>{m.version}</dt>
        <dd>{result.version}</dd>
        <dt>{m.sentences}</dt>
        <dd>{result.sentenceCount}</dd>
        <dt>{m.held}</dt>
        <dd>{result.heldCount}</dd>
        <dt>{m.publishedClaims}</dt>
        <dd>{result.publishedClaims}</dd>
      </dl>
      <p>{m.heldReason}</p>
    </div>
  );
}
export function PlaceAdminView(props: PlaceAdminProps) {
  const { locale, region, place, owners, ownerId, sources, claims, pending } = props;
  const m = messagesFor(stewardMessages, locale);
  const selectedClaims = claims.filter((claim) => props.selected.includes(claim._id));
  const dispute = disputeArgs(selectedClaims);
  const scripts = scriptHostsFor(region.enabledSourceAdapters);
  const frames = frameHostsFor(region.enabledSourceAdapters);
  return (
    <PageContainer locale={locale} title={place.name}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} />
        {place.isMock && <DemoBadge locale={locale} />}
        <Link
          className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
          href={`/${locale}/places/${place.slug}`}
        >
          {m.publicPage}
        </Link>
        <StewardFeedback {...props} />
        <section className="min-w-0 space-y-3 rounded-[10px] border border-line p-4">
          <h2 className="min-w-0 text-[22px] font-bold break-words">{m.owner}</h2>
          <p>
            {m.owners}: {place.ownerCount}
          </p>
          <p>{m.ownerWarning}</p>
          <label className="block">
            {m.selectOwner}
            <select
              className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
              value={ownerId}
              onChange={(event) => props.onOwnerId(event.target.value)}
              disabled={!!pending}
            >
              <option value="">{m.selectOwner}</option>
              {owners.map((owner) => (
                <option key={owner._id} value={owner._id}>
                  {owner.displayName}
                  {owner.isMock ? ` (${m.demo})` : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
            onClick={props.onAttachOwner}
            disabled={!!pending || !ownerId}
          >
            {m.linkOwner}
          </Button>
        </section>
        <section className="space-y-4">
          <h2 className="min-w-0 text-[22px] font-bold break-words">{m.sources}</h2>
          <p>{m.consentReminder}</p>
          <p>{m.sourceRule}</p>
          {!sources.length && <p>{m.empty}</p>}
          {sources.map((source) => (
            <article
              key={source._id}
              data-steward-card="source"
              className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
            >
              <p>
                {m.platform}: {source.platform}, {m.status}: {m[source.status]}
              </p>
              <p>
                {m.credit}: {source.authorHandle ?? "—"}
              </p>
              <p>{source.hasDemoConsent ? m.consentYes : m.consentNo}</p>
              <EmbedView
                locale={locale}
                source={{ ...source, id: source._id }}
                scriptOrigins={scripts}
                frameOrigins={frames}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                  variant="outline"
                  disabled={!!pending}
                  onClick={() =>
                    props.onSource(
                      source._id,
                      source.hasDemoConsent ? "revokeDemoConsent" : "recordDemoConsent",
                    )
                  }
                >
                  {source.hasDemoConsent ? m.revokeConsent : m.recordConsent}
                </Button>
                <Button
                  className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                  variant="outline"
                  disabled={!!pending || source.status !== "live"}
                  onClick={() => props.onSource(source._id, "markGone")}
                >
                  {m.markGone}
                </Button>
                <Button
                  className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                  variant="destructive"
                  disabled={!!pending || source.status === "hidden"}
                  onClick={() => props.onSource(source._id, "remove")}
                >
                  {m.remove}
                </Button>
              </div>
            </article>
          ))}
        </section>
        <section className="space-y-4">
          <h2 className="min-w-0 text-[22px] font-bold break-words">{m.claims}</h2>
          <p>{m.translationRule}</p>
          <Button
            className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
            disabled={!!pending}
            onClick={props.onTranslate}
          >
            {m.machineRequest}
          </Button>
          <p>{m.disputeRule}</p>
          {!claims.length && <p>{m.empty}</p>}
          {claims.map((claim) => (
            <article
              key={claim._id}
              data-steward-card="statement"
              className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
            >
              <p lang={claim.langOriginal} className="whitespace-pre-wrap">
                {claim.textOriginal}
              </p>
              <p>
                {m.status}: {m[claim.status]}, {m.origin}: {m[claim.origin]}
              </p>
              {claim.isMock && <DemoBadge locale={locale} />}
              {claim.aiAssisted && <AiAssistedBadge locale={locale} />}
              {claim.status === "published" && (
                <label className="flex min-h-11 w-full min-w-0 items-center gap-2 sm:w-auto">
                  <input
                    className="size-5 shrink-0 accent-kon"
                    type="checkbox"
                    disabled={!!pending}
                    checked={props.selected.includes(claim._id)}
                    onChange={(event) => props.onSelect(claim._id, event.target.checked)}
                  />
                  {m.selectClaim}
                </label>
              )}
              <ul className="space-y-2">
                {claim.translations.map((translation) => (
                  <li key={translation.lang}>
                    <p lang={translation.lang}>{translation.text}</p>
                    <span>{translation.lang}, </span>
                    {translation.origin === "machine" ? (
                      <MachineTranslationBadge locale={locale} />
                    ) : (
                      <span>{m.human}</span>
                    )}
                    {translation.reviewedBy ? (
                      <span>, {translation.reviewedBy}</span>
                    ) : translation.origin === "machine" ? (
                      <UnreviewedBadge locale={locale} />
                    ) : null}
                  </li>
                ))}
              </ul>
              {missingTranslations(claim, region.locales).map((lang) => {
                const key = `${claim._id}:${lang}`;
                return (
                  <div key={lang} className="space-y-2">
                    <label className="block">
                      {m.human} ({lang})
                      <Textarea
                        className="min-h-11 min-w-0 rounded-[10px]"
                        lang={lang}
                        maxLength={1000}
                        disabled={!!pending}
                        value={props.translations[key] ?? ""}
                        onChange={(event) =>
                          props.onTranslation(claim._id, lang, event.target.value)
                        }
                      />
                    </label>
                    <Button
                      className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                      disabled={!!pending || !props.translations[key]?.trim()}
                      onClick={() => props.onSaveTranslation(claim._id, lang)}
                    >
                      {m.saveTranslation}
                    </Button>
                  </div>
                );
              })}
            </article>
          ))}
          <Button
            className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
            disabled={!!pending || "error" in dispute}
            onClick={props.onDispute}
          >
            {m.dispute}
          </Button>
        </section>
        <section className="min-w-0 space-y-3 rounded-[10px] border border-line p-4">
          <h2 className="min-w-0 text-[22px] font-bold break-words">{m.compose}</h2>
          <p>{m.composeRule}</p>
          <p>{m.heldReason}</p>
          <Button
            className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
            disabled={!!pending}
            onClick={props.onCompose}
          >
            {m.compose}
          </Button>
          {props.composeResult && (
            <ComposeResultView locale={locale} result={props.composeResult} />
          )}
        </section>
      </div>
    </PageContainer>
  );
}
