"use client";

import Link from "next/link";
import { DemoBadge } from "@/components/badges/demo-badge";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import type { PlaceKind, Visibility } from "@/lib/domain/constants";
import { messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { takedownsMessages } from "@/lib/i18n/messages/takedowns";
import { candidateMessages } from "@/lib/i18n/messages/candidates";
import type { RegionConfig } from "@/lib/region/schema";
import { visibilityArgs, visibilityChoices, type PlaceRow } from "./steward-logic";

export type VisibilityDraft = {
  visibility: Visibility;
  agreementRecorded: boolean;
  confirmFictional: boolean;
};
export type ActionState = { pending?: string; error?: string; success?: string };
export function StewardFeedback({
  locale,
  pending,
  error,
  success,
}: ActionState & { locale: Locale }) {
  const m = messagesFor(stewardMessages, locale);
  return (
    <div aria-live="polite">
      {pending && <p role="status">{m.pending}</p>}
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </div>
  );
}
export function StewardNav({ locale }: { locale: Locale }) {
  const m = messagesFor(stewardMessages, locale);
  return (
    <nav className="flex flex-wrap gap-4">
      <Link href={`/${locale}/steward`} className="underline">
        {m.back}
      </Link>
      <Link href={`/${locale}/steward/open-text`} className="underline">
        {m.openText}
      </Link>
      <Link href={`/${locale}/steward/people`} className="underline">
        {m.people}
      </Link>
      <Link href={`/${locale}/steward/candidates`} className="underline">
        {messagesFor(candidateMessages, locale).title}
      </Link>
      <Link href={`/${locale}/steward/takedowns`} className="underline">
        {messagesFor(takedownsMessages, locale).title}
      </Link>
    </nav>
  );
}
export type StewardHomeProps = ActionState & {
  locale: Locale;
  region: Pick<RegionConfig, "legal">;
  rows: readonly PlaceRow[];
  drafts: Readonly<Record<string, VisibilityDraft>>;
  onDraft: (id: string, draft: VisibilityDraft) => void;
  onKind: (id: string, kind: PlaceKind) => void;
  onVisibility: (id: string, draft: VisibilityDraft) => void;
};
export function StewardHomeView(props: StewardHomeProps) {
  const { locale, region, rows, drafts, onDraft, onKind, onVisibility, pending } = props;
  const m = messagesFor(stewardMessages, locale);
  return (
    <PageContainer locale={locale} title={m.home}>
      <StewardNav locale={locale} />
      <Link className="underline" href={`/${locale}/creator`}>
        {m.createPlace}
      </Link>
      <StewardFeedback {...props} />
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{m.places}</h2>
        <p>{m.kindRule}</p>
        <p>{m.visibilityRule}</p>
        {!rows.length && <p>{m.empty}</p>}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {[m.name, m.kind, m.visibility, m.owners, m.demo, m.actions].map((label) => (
                  <th key={label} scope="col" className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.id] ?? {
                  visibility: row.visibility,
                  agreementRecorded: false,
                  confirmFictional: false,
                };
                const choices = visibilityChoices(row, region);
                const choice = choices.find((item) => item.visibility === draft.visibility)!;
                const reasons = [
                  ...new Set(choices.filter((item) => !item.allowed).map((item) => item.needs)),
                ];
                return (
                  <tr key={row.id} className="border-t align-top">
                    <th scope="row" className="p-3 font-medium">
                      {row.name}
                    </th>
                    <td className="space-y-2 p-3">
                      <p>{m[row.kind]}</p>
                      <Button
                        disabled={!!pending}
                        variant="outline"
                        onClick={() =>
                          onKind(row.id, row.kind === "landmark" ? "business" : "landmark")
                        }
                      >
                        {row.kind === "landmark" ? m.markBusiness : m.markLandmark}
                      </Button>
                    </td>
                    <td className="min-w-64 space-y-2 p-3">
                      <p>{m[row.visibility]}</p>
                      <label className="block">
                        {m.visibility}
                        <select
                          className="block w-full rounded border p-2"
                          value={draft.visibility}
                          disabled={!!pending}
                          onChange={(event) =>
                            onDraft(row.id, {
                              ...draft,
                              visibility: event.target.value as Visibility,
                              agreementRecorded: false,
                              confirmFictional: false,
                            })
                          }
                        >
                          {choices.map((item) => (
                            <option
                              key={item.visibility}
                              value={item.visibility}
                              disabled={!item.allowed || item.visibility === "pilot"}
                            >
                              {m[item.visibility]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.isMock && (
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={draft.confirmFictional}
                            disabled={!!pending}
                            onChange={(event) =>
                              onDraft(row.id, { ...draft, confirmFictional: event.target.checked })
                            }
                          />
                          {m.confirmFictional}
                        </label>
                      )}
                      {reasons.map((reason) => (
                        <p key={reason} className="text-sm">
                          {reason === "launch_pack" ||
                          reason === "landmark_kind" ||
                          reason === "real_only"
                            ? m[reason]
                            : null}
                        </p>
                      ))}
                      <Button
                        disabled={
                          !!pending ||
                          draft.visibility === "pilot" ||
                          visibilityArgs(row.id, draft.visibility, draft, choice) === null
                        }
                        onClick={() => onVisibility(row.id, draft)}
                      >
                        {draft.visibility === "public"
                          ? m.publishPlace
                          : draft.visibility === "draft"
                            ? m.backToDraft
                            : draft.visibility === "demo_public"
                              ? m.confirmDemo
                              : m.saveVisibility}
                      </Button>
                    </td>
                    <td className="p-3">{row.ownerCount}</td>
                    <td className="p-3">{row.isMock && <DemoBadge locale={locale} />}</td>
                    <td className="space-y-2 p-3">
                      <Link
                        className="block underline"
                        href={`/${locale}/steward/places/${row.id}`}
                      >
                        {m.admin}
                      </Link>
                      <Link className="block underline" href={`/${locale}/places/${row.slug}`}>
                        {m.publicPage}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageContainer>
  );
}
