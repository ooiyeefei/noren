import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  WorkspaceView,
  type WorkspaceViewProps,
} from "@/components/interview-workspace/workspace-view";
import { interviewPageMessages } from "@/lib/i18n/messages/interview-page";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";
import { ClaimProposal } from "@/components/interview-workspace/claim-proposal";

vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "ja" }),
  usePathname: () => "/ja/creator",
}));
const consent = {
  textVersion: "v1",
  textLang: "ja",
  recordedAt: 0,
  assisted: false,
  withdrawn: false,
};
const transcript = {
  _id: "transcript",
  version: 1,
  origin: "human_corrected" as const,
  lang: "ja",
  segments: [{ start: 0, end: 1, text: "秘密の文字起こし" }],
};
const base: WorkspaceViewProps = {
  locale: "en",
  role: "creator",
  region: {
    defaultLocale: "ja",
    locales: ["ja", "en"],
    minimumAge: 18,
    consent: {
      textVersion: "v1",
      requiredScopes: ["publish", "aiProcessing", "transferAbroad", "voiceRetention"],
      text: { ja: "日本語の同意文", en: "English consent text" },
    },
    cautionVocabulary: [
      { key: "access", labels: { ja: "入店", en: "Access" }, labelsReviewedBy: null },
    ],
  },
  view: {
    _id: "interview",
    placeId: "place",
    placeSlug: "demo",
    language: "ja",
    status: "consent_pending",
    hasAudio: false,
    audioUrl: null,
    isMock: true,
    consent: null,
    latestTranscript: null,
    canWithdraw: false,
  },
  claims: [],
  onConsent: async () => {},
  onRecorded: async () => {},
  onSave: async () => {},
  onTranscribe: async () => {},
  onPropose: async () => {},
  onProposeAi: async () => {},
  onWithdraw: async () => {},
};
const render = (props: Partial<WorkspaceViewProps> = {}) =>
  renderToStaticMarkup(<WorkspaceView {...base} {...props} />);
describe("interview workspace view", () => {
  it("the consent step renders the owner's-language consent text and no recorder", () => {
    const html = render();
    expect(html).toContain("日本語の同意文");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Record audio");
    expect(html).not.toContain("Transcribe with AI");
  });
  it("an invalid upload message from attach renders as an alert", () => {
    const html = render({
      view: { ...base.view, consent },
      error: {
        data: {
          code: "invalid_input",
          message: "the uploaded file must have an audio content type",
        },
      },
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("the uploaded file must have an audio content type");
    expect(html).toContain('type="file"');
  });
  it("processingError renders, never empty", () => {
    const html = render({
      view: {
        ...base.view,
        consent,
        status: "transcribing",
        processingError: "Provider unavailable",
      },
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Provider unavailable");
    expect(html).toContain("Transcribing…");
    expect(render({ view: { ...base.view, processingError: "" } })).toContain('role="alert"');
  });
  it("the claims list has no confirm button and shows each claim's quote", () => {
    const claims = [
      {
        _id: "one",
        sourceTranscriptId: "transcript",
        status: "proposed" as const,
        textOriginal: "Mock claim",
        langOriginal: "en",
        quote: " Exact quote ",
        aiAssisted: true,
        isMock: true,
      },
      {
        _id: "two",
        sourceTranscriptId: "transcript",
        status: "published" as const,
        textOriginal: "掲載候補",
        langOriginal: "ja",
        quote: "別の引用",
        aiAssisted: false,
        isMock: true,
      },
    ];
    const html = render({ view: { ...base.view, consent, latestTranscript: transcript }, claims });
    expect(html).toContain(" Exact quote ");
    expect(html).toContain("別の引用");
    expect(html).toContain('data-badge="ai-assisted"');
    expect(html).toContain('data-badge="demo"');
    expect(html).not.toMatch(/<button[^>]*>Confirm/);
    expect(html).toContain('lang="en"');
  });
  it("a withdrawn interview renders no transcript text and no audio element", () => {
    const html = render({
      view: {
        ...base.view,
        consent,
        status: "withdrawn",
        latestTranscript: transcript,
        audioUrl: "https://example.test/audio",
        hasAudio: true,
      },
      error: new Error("hidden failure"),
    });
    expect(html).toContain("was withdrawn");
    expect(html).not.toContain("秘密の文字起こし");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("hidden failure");
    expect(html).not.toContain("<button");
  });
  it("ja and en render with no missing message", () => {
    for (const locale of ["ja", "en"] as const) {
      const html = render({
        locale,
        view: {
          ...base.view,
          consent,
          status: "transcript_ready",
          hasAudio: true,
          latestTranscript: { ...transcript, origin: "machine" },
        },
      });
      expect(html).toContain(interviewPageMessages[locale].title);
      expect(html).toContain(interviewPageMessages[locale].ownerSpeaker);
      expect(html).toContain(interviewUiMessages[locale].saveCorrected);
      expect(html).not.toMatch(/undefined|\{[a-zA-Z]+\}/);
      const proposal = renderToStaticMarkup(
        <ClaimProposal
          locale={locale}
          lang="ja"
          initial={{
            spanStart: 0,
            spanEnd: 3,
            quote: " a ",
            textOriginal: " a ",
            kind: "caution",
            cautionType: "access",
          }}
          vocabulary={base.region.cautionVocabulary}
          onSubmit={async () => {}}
          onCancel={() => {}}
        />,
      );
      expect(proposal).toContain(" a ");
      expect(proposal).toContain(base.region.cautionVocabulary[0]!.labels[locale]);
      expect(proposal).not.toContain("undefined");
    }
  });
});

it("interview messages use statements in English and matching plain Japanese", () => {
  expect(Object.values(interviewPageMessages.en).join(" ")).not.toMatch(/\bclaims?\b/i);
  expect(Object.values(interviewUiMessages.en).join(" ")).not.toMatch(/\bclaims?\b/i);
  expect(interviewPageMessages.en.claims).toBe("Statements from this corrected version");
  expect(interviewPageMessages.ja.claims).toBe("この修正版からの文");
});
it("finished interview and recorded consent are labelled status chips in both languages", () => {
  for (const locale of ["en", "ja"] as const) {
    const html = render({ locale, view: { ...base.view, consent, status: "done" } });
    const m = interviewPageMessages[locale];
    for (const text of [
      `${m.interviewStatus}: ${m.done}`,
      `${m.consentStatus}: ${m.consentRecorded}`,
    ]) {
      const chip = html.match(new RegExp(`<p[^>]*>${text}</p>`))?.[0];
      expect(chip).toContain("rounded-full");
      expect(chip).toContain("text-[13px]");
    }
  }
});
