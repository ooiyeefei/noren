"use client";

import { useId, useState } from "react";
import { AiAssistedBadge, DemoBadge } from "@/components/badges";
import { AudioCapture } from "@/components/interview/audio-capture";
import { ConsentForm, type ConsentSubmission } from "@/components/interview/consent-form";
import { TranscriptEditor, type EditableSegment } from "@/components/interview/transcript-editor";
import { errorText } from "@/components/layout/error-text";
import { PageContainer } from "@/components/layout/page-container";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { isSupportedLocale, messagesFor, type Locale } from "@/lib/i18n";
import { interviewPageMessages } from "@/lib/i18n/messages/interview-page";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";
import type { ClaimStatus } from "@/lib/domain/constants";
import { ClaimProposal } from "./claim-proposal";
import {
  claimsForTranscript,
  consentTextFor,
  emptyTranscript,
  workspacePanels,
  type InterviewViewLike,
  type ProposalDraft,
  type WorkspaceRegion,
  type WorkspaceRole,
} from "./workspace";

export type WorkspaceClaim = {
  _id: string;
  sourceTranscriptId?: string;
  spanStart?: number;
  status: ClaimStatus;
  textOriginal: string;
  langOriginal: string;
  quote?: string;
  aiAssisted: boolean;
  isMock: boolean;
};
export type WorkspaceViewProps = {
  locale: Locale;
  region: WorkspaceRegion;
  view: InterviewViewLike;
  role: WorkspaceRole;
  claims?: readonly WorkspaceClaim[];
  claimsNotice?: React.ReactNode;
  busy?: boolean;
  error?: unknown;
  onConsent(submission: ConsentSubmission): Promise<void>;
  onRecorded(file: Blob, durationS: number | undefined): Promise<void>;
  onTranscribe(): Promise<void>;
  onSave(segments: EditableSegment[]): Promise<void>;
  onPropose(draft: ProposalDraft, transcriptId: string): Promise<void>;
  onProposeAi(): Promise<void>;
  onWithdraw(): Promise<void>;
};
export function WorkspaceView(props: WorkspaceViewProps) {
  const { view, locale, region } = props;
  const m = messagesFor(interviewPageMessages, locale);
  const ui = messagesFor(interviewUiMessages, locale);
  const panels = workspacePanels(view, props.role);
  const id = useId();
  const [consentLang, setConsentLang] = useState(view.language);
  const [typing, setTyping] = useState(false);
  const [proposal, setProposal] = useState<{ transcriptId: string; draft: ProposalDraft } | null>(
    null,
  );
  const [withdrawing, setWithdrawing] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const busy = props.busy || pending;
  async function act(action: () => Promise<void>, done?: () => void) {
    if (busy) return;
    setPending(true);
    setFailure(undefined);
    try {
      await action();
      done?.();
    } catch (error) {
      setFailure(error);
      throw error;
    } finally {
      setPending(false);
    }
  }
  const launch = (action: () => Promise<void>, done?: () => void) => {
    void act(action, done).catch(() => {});
  };
  if (panels.withdrawn)
    return (
      <PageContainer locale={locale}>
        <p role="status">{m.withdrawn}</p>
      </PageContainer>
    );
  const consent = consentTextFor(region, consentLang);
  const transcript = view.latestTranscript;
  const speakers = messagesFor(
    interviewPageMessages,
    isSupportedLocale(view.language) ? view.language : "ja",
  );
  const claims = transcript ? claimsForTranscript(props.claims ?? [], transcript._id) : [];
  const visibleProposal =
    panels.canProposeSpan && proposal?.transcriptId === transcript?._id ? proposal : null;
  const error = props.error ?? failure;
  return (
    <PageContainer locale={locale} title={m.title}>
      <div lang={locale} className="space-y-6">
        <p role="status">{view.status === "withdrawn" ? m.withdrawn : m[view.status]}</p>
        {view.isMock && <DemoBadge locale={locale} />}
        {view.processingError !== undefined && (
          <Alert variant="destructive">{errorText(view.processingError, locale)}</Alert>
        )}
        {error != null && <Alert variant="destructive">{errorText(error, locale)}</Alert>}
        {panels.consent === "needed" ? (
          <section className="space-y-3">
            <Label htmlFor={`${id}-language`}>{m.consentLanguage}</Label>
            <select
              id={`${id}-language`}
              value={consent.textLang}
              disabled={busy}
              onChange={(event) => setConsentLang(event.target.value)}
            >
              {region.locales.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === "ja" ? "日本語" : lang === "en" ? "English" : lang}
                </option>
              ))}
            </select>
            <ConsentForm
              key={consent.textLang}
              locale={locale}
              consentText={consent.text}
              textLang={consent.textLang}
              textVersion={consent.textVersion}
              minimumAge={region.minimumAge}
              assistedAllowed={panels.assistedConsentAllowed}
              onSubmit={(submission) => act(() => props.onConsent(submission))}
            />
          </section>
        ) : (
          <p>{m.consentRecorded}</p>
        )}
        {panels.canRecord && (
          <AudioCapture
            locale={locale}
            maxSeconds={30 * 60}
            disabled={busy}
            onRecorded={(file, duration) => launch(() => props.onRecorded(file, duration))}
          />
        )}
        {panels.consent === "recorded" && view.audioUrl && (
          <audio controls src={view.audioUrl} aria-label={ui.record} />
        )}
        <div className="flex flex-wrap gap-3">
          {panels.canTranscribe && (
            <Button disabled={busy} onClick={() => launch(props.onTranscribe)}>
              {m.transcribe}
            </Button>
          )}
          {panels.canTypeTranscript && !typing && (
            <Button disabled={busy} variant="outline" onClick={() => setTyping(true)}>
              {m.typeInstead}
            </Button>
          )}
        </div>
        {(panels.editor !== "hidden" || (typing && panels.canTypeTranscript)) && (
          <section className="space-y-3">
            {transcript?.origin === "machine" && <AiAssistedBadge locale={locale} />}
            <TranscriptEditor
              key={transcript?._id ?? "typed"}
              locale={locale}
              segments={transcript?.segments ?? emptyTranscript()}
              lang={transcript?.lang ?? view.language}
              speakers={[speakers.ownerSpeaker, speakers.interviewerSpeaker]}
              readOnly={panels.editor === "readonly"}
              saving={busy}
              onSave={(segments) =>
                act(
                  () => props.onSave(segments),
                  () => setProposal(null),
                )
              }
              onProposeSpan={
                panels.canProposeSpan && transcript
                  ? (span) =>
                      setProposal({
                        transcriptId: transcript._id,
                        draft: {
                          ...span,
                          kind: "story",
                          cautionType: "",
                          textOriginal: span.quote,
                        },
                      })
                  : undefined
              }
            />
          </section>
        )}
        {visibleProposal && (
          <ClaimProposal
            key={`${visibleProposal.transcriptId}:${visibleProposal.draft.spanStart}:${visibleProposal.draft.spanEnd}`}
            locale={locale}
            lang={transcript!.lang}
            vocabulary={region.cautionVocabulary}
            initial={visibleProposal.draft}
            busy={busy}
            onSubmit={(draft) =>
              act(
                () => props.onPropose(draft, visibleProposal.transcriptId),
                () => setProposal(null),
              )
            }
            onCancel={() => setProposal(null)}
          />
        )}
        {panels.canProposeWithAi && (
          <Button disabled={busy} onClick={() => launch(props.onProposeAi)}>
            {m.proposeAi}
          </Button>
        )}
        {transcript && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{m.claims}</h2>
            {props.claimsNotice ??
              (props.claims === undefined ? (
                <p>{ui.saving}</p>
              ) : claims.length === 0 ? (
                <p>{m.noClaims}</p>
              ) : (
                <WorkspaceClaims locale={locale} claims={claims} />
              ))}
          </section>
        )}
        {panels.canWithdraw && (
          <>
            <Button variant="destructive" disabled={busy} onClick={() => setWithdrawing(true)}>
              {m.withdraw}
            </Button>
            <Dialog
              open={withdrawing}
              onOpenChange={(open) => {
                if (!busy) setWithdrawing(open);
              }}
            >
              <DialogContent lang={locale} showCloseButton={false}>
                <DialogTitle>{m.withdraw}</DialogTitle>
                <DialogDescription>{m.withdrawDescription}</DialogDescription>
                {error != null && <Alert variant="destructive">{errorText(error, locale)}</Alert>}
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => launch(props.onWithdraw, () => setWithdrawing(false))}
                >
                  {m.withdraw}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setWithdrawing(false)}>
                  {ui.cancel}
                </Button>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </PageContainer>
  );
}

export function WorkspaceClaims({
  locale,
  claims,
}: {
  locale: Locale;
  claims: readonly WorkspaceClaim[];
}) {
  const ui = messagesFor(interviewUiMessages, locale);
  return (
    <ul className="space-y-3">
      {claims.map((claim) => (
        <li key={claim._id} className="space-y-2 rounded-lg border p-4">
          <p lang={claim.langOriginal}>{claim.textOriginal}</p>
          <p>{ui[claim.status]}</p>
          <blockquote lang={claim.langOriginal} className="whitespace-pre-wrap border-l-2 pl-3">
            {claim.quote}
          </blockquote>
          {claim.aiAssisted && <AiAssistedBadge locale={locale} />}
          {claim.isMock && <DemoBadge locale={locale} />}
        </li>
      ))}
    </ul>
  );
}
