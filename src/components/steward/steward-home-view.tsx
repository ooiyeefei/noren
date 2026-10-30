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
      <Link
        href={`/${locale}/steward`}
        className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
      >
        {m.back}
      </Link>
      <Link
        href={`/${locale}/steward/open-text`}
        className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
      >
        {m.openText}
      </Link>
      <Link
        href={`/${locale}/steward/people`}
        className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
      >
        {m.people}
      </Link>
      <Link
        href={`/${locale}/steward/candidates`}
        className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
      >
        {messagesFor(candidateMessages, locale).title}
      </Link>
      <Link
        href={`/${locale}/steward/takedowns`}
        className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
      >
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
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} />
        <Link
          className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
          href={`/${locale}/creator`}
        >
          {m.createPlace}
        </Link>
        <StewardFeedback {...props} />
        <section className="space-y-4">
          <h2 className="min-w-0 text-[22px] font-bold break-words">{m.places}</h2>
          <div className="max-w-prose space-y-2 rounded-[10px] bg-kamenozoki p-4">
            <p>{m.kindRule}</p>
            <p>{m.visibilityRule}</p>
          </div>
          {!rows.length && <p>{m.empty}</p>}
          <div className="min-w-0">
            <table
              role="table"
              className="block w-full border-collapse text-left xl:table xl:table-fixed"
            >
              <thead className="sr-only xl:not-sr-only xl:table-header-group">
                <tr>
                  {[m.name, m.kind, m.visibility, m.owners, m.demo, m.actions].map((label) => (
                    <th key={label} scope="col" className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup" className="block space-y-4 xl:table-row-group xl:space-y-0">
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
                    <tr
                      key={row.id}
                      role="row"
                      data-steward-card="place"
                      className="block min-w-0 space-y-3 rounded-[10px] border border-line p-4 align-top xl:table-row xl:space-y-0 xl:rounded-none xl:border-x-0 xl:p-0"
                    >
                      <th
                        scope="row"
                        role="rowheader"
                        className="block min-w-0 font-medium xl:table-cell xl:p-3"
                      >
                        <span aria-hidden="true" className="mr-2 text-sm font-bold xl:hidden">
                          {m.name}
                        </span>
                        {row.name}
                      </th>
                      <td role="cell" className="block min-w-0 space-y-2 xl:table-cell xl:p-3">
                        <span aria-hidden="true" className="mr-2 text-sm font-bold xl:hidden">
                          {m.kind}
                        </span>
                        <p className="inline">{m[row.kind]}</p>
                        <Button
                          className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                          disabled={!!pending}
                          variant="outline"
                          onClick={() =>
                            onKind(row.id, row.kind === "landmark" ? "business" : "landmark")
                          }
                        >
                          {row.kind === "landmark" ? m.markBusiness : m.markLandmark}
                        </Button>
                      </td>
                      <td role="cell" className="block min-w-0 space-y-2 xl:table-cell xl:p-3">
                        <span aria-hidden="true" className="mr-2 text-sm font-bold xl:hidden">
                          {m.visibility}
                        </span>
                        <p className="inline">{m[row.visibility]}</p>
                        <label className="block">
                          {m.visibility}
                          <select
                            className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
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
                          <label className="flex min-h-11 w-full min-w-0 items-center gap-2">
                            <input
                              className="size-5 shrink-0 accent-kon"
                              type="checkbox"
                              checked={draft.confirmFictional}
                              disabled={!!pending}
                              onChange={(event) =>
                                onDraft(row.id, {
                                  ...draft,
                                  confirmFictional: event.target.checked,
                                })
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
                          className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
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
                      <td role="cell" className="block min-w-0 xl:table-cell xl:p-3">
                        <span aria-hidden="true" className="mr-2 text-sm font-bold xl:hidden">
                          {m.owners}
                        </span>
                        {row.ownerCount}
                      </td>
                      <td role="cell" className="block min-w-0 xl:table-cell xl:p-3">
                        <span aria-hidden="true" className="mr-2 text-sm font-bold xl:hidden">
                          {m.demo}
                        </span>
                        {row.isMock ? <DemoBadge locale={locale} /> : "—"}
                      </td>
                      <td role="cell" className="block min-w-0 space-y-2 xl:table-cell xl:p-3">
                        <span aria-hidden="true" className="mr-2 text-sm font-bold xl:hidden">
                          {m.actions}
                        </span>
                        <Link
                          className="flex min-h-11 w-full min-w-0 items-center text-ai underline"
                          href={`/${locale}/steward/places/${row.id}`}
                        >
                          {m.admin}
                        </Link>
                        <Link
                          className="flex min-h-11 w-full min-w-0 items-center text-ai underline"
                          href={`/${locale}/places/${row.slug}`}
                        >
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
      </div>
    </PageContainer>
  );
}
