"use client";

import { Component, use, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { uploadWithRetry } from "@/components/interview/upload";
import { ErrorMessage } from "@/components/layout/error-message";
import { ErrorPage } from "@/components/layout/error-page";
import { PageContainer } from "@/components/layout/page-container";
import { toSpeechWav } from "@/lib/audio/speech-wav";
import { messagesFor, type Locale } from "@/lib/i18n";
import { interviewPageMessages } from "@/lib/i18n/messages/interview-page";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";
import { claimsForTranscript } from "./workspace";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { proposalArgs, workspacePanels, type WorkspaceRegion } from "./workspace";
import { WorkspaceView, WorkspaceClaims, type WorkspaceClaim } from "./workspace-view";

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) return;
  const data = error.data;
  return typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
    ? data.code
    : undefined;
}
export class QueryBoundary extends Component<
  { locale: Locale; claims?: boolean; children: ReactNode },
  { failed: boolean; error?: unknown }
> {
  override state: { failed: boolean; error?: unknown } = { failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    const { locale } = this.props;
    const code = codeOf(this.state.error);
    const invalidId =
      this.state.error instanceof Error &&
      /(?:v\.id|invalid.*id|validator.*id)/i.test(this.state.error.message);
    const text =
      this.props.claims && code === "forbidden"
        ? messagesFor(interviewPageMessages, locale).managersOnly
        : !this.props.claims && (code === "not_found" || code === "forbidden" || invalidId)
          ? messagesFor(shellMessages, locale).not_found
          : undefined;
    if (this.props.claims)
      return text !== undefined ? (
        <p role="alert">{text}</p>
      ) : (
        <ErrorMessage error={this.state.error} locale={locale} />
      );
    return text !== undefined ? (
      <PageContainer locale={locale} title={messagesFor(shellMessages, locale).notFoundTitle}>
        <p role="alert">{text}</p>
      </PageContainer>
    ) : (
      <ErrorPage error={this.state.error} locale={locale} />
    );
  }
}
function ClaimsQuery(props: {
  placeId: Id<"place">;
  children(claims: WorkspaceClaim[] | undefined): ReactNode;
}) {
  const claims = useQuery(api.claims.listForPlace, { placeId: props.placeId });
  return props.children(claims);
}
function InterviewQuery(props: { id: Id<"interview">; locale: Locale; region: WorkspaceRegion }) {
  const interviewId = props.id;
  const person = useQuery(api.people.current, {});
  const view = useQuery(api.interviews.get, { interviewId });
  const consent = useMutation(api.interviews.recordConsent);
  const uploadUrl = useMutation(api.audio.generateUploadUrl);
  const attach = useMutation(api.audio.attach);
  const correction = useMutation(api.interviews.saveCorrection);
  const propose = useMutation(api.claims.proposeFromSpan);
  const withdraw = useMutation(api.interviews.withdraw);
  const transcribe = useMutation(api.aiRequests.transcribe);
  const proposeAi = useMutation(api.aiRequests.proposeClaims);
  const audioFormat = useQuery(api.aiRequests.audioFormat, {});
  if (!view || !person)
    return <p role="status">{messagesFor(shellMessages, props.locale).signingIn}</p>;
  const render = (claims?: WorkspaceClaim[], claimsNotice?: ReactNode) => (
    <WorkspaceView
      key={view._id}
      locale={props.locale}
      region={props.region}
      view={view}
      role={person.role}
      claims={claims}
      claimsNotice={claimsNotice}
      onConsent={async (submission) => {
        await consent({ interviewId, ...submission });
      }}
      onRecorded={async (recording, durationS) => {
        // If the browser cannot decode the recording, keep the original rather than lose it;
        // transcription then explains the format it needs and the typed transcript still works.
        const file =
          audioFormat === "wav" ? await toSpeechWav(recording).catch(() => recording) : recording;
        const { storageId } = await uploadWithRetry({
          getUploadUrl: () => uploadUrl({ interviewId }),
          file,
        });
        const result = await attach({
          interviewId,
          storageId: storageId as Id<"_storage">,
          ...(durationS === undefined ? {} : { durationS }),
        });
        if (!result.ok) throw { data: { code: result.code, message: result.message } };
      }}
      onSave={async (segments) => {
        await correction({ interviewId, segments });
      }}
      onTranscribe={async () => {
        await transcribe({ interviewId });
      }}
      onPropose={async (draft, transcriptId) => {
        await propose({
          ...proposalArgs(draft, transcriptId),
          transcriptId: transcriptId as Id<"transcript">,
        });
      }}
      onProposeAi={async () => {
        await proposeAi({ interviewId });
      }}
      onWithdraw={async () => {
        await withdraw({ interviewId });
      }}
    />
  );
  // Keep the interview mounted when only the managers-only claims query fails.
  return (
    <>
      {render(
        undefined,
        view.latestTranscript && !workspacePanels(view, person.role).withdrawn ? (
          <QueryBoundary key={view.latestTranscript._id} locale={props.locale} claims>
            <ClaimsQuery placeId={view.placeId}>
              {(claims) => (
                <ClaimsList
                  locale={props.locale}
                  claims={claims}
                  transcriptId={view.latestTranscript!._id}
                />
              )}
            </ClaimsQuery>
          </QueryBoundary>
        ) : undefined,
      )}
    </>
  );
}

function ClaimsList(props: {
  locale: Locale;
  claims: WorkspaceClaim[] | undefined;
  transcriptId: string;
}) {
  const m = messagesFor(interviewPageMessages, props.locale);
  const ui = messagesFor(interviewUiMessages, props.locale);
  if (!props.claims) return <p role="status">{ui.saving}</p>;
  const claims = claimsForTranscript(props.claims, props.transcriptId);
  if (!claims.length) return <p>{m.noClaims}</p>;
  return <WorkspaceClaims locale={props.locale} claims={claims} />;
}

export function WorkspaceContainer(props: {
  locale: Locale;
  region: WorkspaceRegion;
  params: Promise<{ lang: string; id: string }>;
}) {
  const { id } = use(props.params);
  return (
    <QueryBoundary key={id} locale={props.locale}>
      <InterviewGate id={id} locale={props.locale} region={props.region} />
    </QueryBoundary>
  );
}

export function InterviewGate(props: { id: string; locale: Locale; region: WorkspaceRegion }) {
  const normalizedId = useQuery(api.ids.normalize, { table: "interview", id: props.id });
  const m = messagesFor(shellMessages, props.locale);
  if (normalizedId === undefined) return <p role="status">{m.signingIn}</p>;
  if (normalizedId === null)
    return (
      <PageContainer locale={props.locale} title={m.notFoundTitle}>
        <p role="alert">{m.not_found}</p>
      </PageContainer>
    );
  return (
    <InterviewQuery
      id={normalizedId as Id<"interview">}
      locale={props.locale}
      region={props.region}
    />
  );
}
