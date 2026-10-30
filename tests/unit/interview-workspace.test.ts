import { describe, expect, it } from "vitest";
import {
  claimsForTranscript,
  consentTextFor,
  emptyTranscript,
  proposalArgs,
  validateProposal,
  workspacePanels,
  type InterviewViewLike,
  type ProposalDraft,
} from "@/components/interview-workspace/workspace";

export const interview: InterviewViewLike = {
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
};
export const consent = {
  textVersion: "v1",
  textLang: "ja",
  recordedAt: 0,
  assisted: false,
  withdrawn: false,
};
export const transcript = {
  _id: "transcript",
  version: 1,
  origin: "human_corrected" as const,
  lang: "ja",
  segments: [{ start: 0, end: 1, text: "秘密の文字起こし" }],
};
const draft: ProposalDraft = {
  spanStart: 0,
  spanEnd: 3,
  quote: " a ",
  kind: "story",
  cautionType: "old",
  textOriginal: " claim ",
};
describe("interview workspace", () => {
  it("a new interview needs consent and offers nothing else", () => {
    const p = workspacePanels(interview, "creator");
    expect(p.consent).toBe("needed");
    expect(
      [
        p.canRecord,
        p.canTranscribe,
        p.canTypeTranscript,
        p.canProposeSpan,
        p.canProposeWithAi,
        p.canWithdraw,
      ].some(Boolean),
    ).toBe(false);
    expect(p.editor).toBe("hidden");
  });
  it("after consent the creator may record or type a transcript", () => {
    const p = workspacePanels({ ...interview, consent }, "creator");
    expect(p.canRecord && p.canTypeTranscript).toBe(true);
    expect(emptyTranscript()).toEqual([{ start: 0, end: 0, text: "" }]);
  });
  it("with audio uploaded the creator may transcribe", () => {
    expect(
      workspacePanels({ ...interview, consent, status: "uploaded", hasAudio: true }, "creator")
        .canTranscribe,
    ).toBe(true);
  });
  it("while transcribing nothing can be started twice", () => {
    const p = workspacePanels(
      {
        ...interview,
        consent,
        status: "transcribing",
        hasAudio: true,
        latestTranscript: transcript,
      },
      "creator",
    );
    expect(p.processing).toBe(true);
    expect(
      [
        p.canRecord,
        p.canTranscribe,
        p.canTypeTranscript,
        p.canProposeSpan,
        p.canProposeWithAi,
      ].some(Boolean),
    ).toBe(false);
    expect(p.editor).toBe("readonly");
  });
  it("only a human-corrected latest version allows proposals", () => {
    for (const origin of ["machine", "human_corrected"] as const) {
      const p = workspacePanels(
        {
          ...interview,
          consent,
          status: "correcting",
          latestTranscript: { ...transcript, origin },
        },
        "creator",
      );
      expect(p.canProposeSpan).toBe(origin === "human_corrected");
      expect(p.canProposeWithAi).toBe(origin === "human_corrected");
    }
    expect(
      workspacePanels(
        { ...interview, consent, status: "done", latestTranscript: transcript },
        "creator",
      ).canProposeSpan,
    ).toBe(false);
  });
  it("a withdrawn interview shows only the withdrawn notice", () => {
    const p = workspacePanels(
      {
        ...interview,
        consent,
        status: "withdrawn",
        hasAudio: true,
        latestTranscript: transcript,
        canWithdraw: true,
      },
      "steward",
    );
    expect(p.withdrawn).toBe(true);
    expect(p.editor).toBe("hidden");
    expect(
      [
        p.canRecord,
        p.canTranscribe,
        p.canTypeTranscript,
        p.canProposeSpan,
        p.canWithdraw,
        p.processing,
      ].some(Boolean),
    ).toBe(false);
    expect(
      workspacePanels({ ...interview, consent: { ...consent, withdrawn: true } }, "creator")
        .withdrawn,
    ).toBe(true);
  });
  it("the owner sees the editor read-only", () => {
    const p = workspacePanels(
      { ...interview, consent, latestTranscript: transcript },
      "business_owner",
    );
    expect(p.editor).toBe("readonly");
    expect(p.canProposeSpan || p.canRecord).toBe(false);
  });
  it("only a steward may record assisted consent", () => {
    for (const role of ["creator", "steward", "business_owner", "user"] as const)
      expect(workspacePanels(interview, role).assistedConsentAllowed).toBe(role === "steward");
  });
  it("claimsForTranscript keeps this version's claims, proposed first", () => {
    const claims = [
      { sourceTranscriptId: "transcript", status: "published", spanStart: 0 },
      { sourceTranscriptId: "old", status: "proposed" },
      { sourceTranscriptId: "transcript", status: "proposed", spanStart: 9 },
      { sourceTranscriptId: "transcript", status: "proposed", spanStart: 1 },
    ];
    expect(claimsForTranscript(claims, "transcript")).toEqual([claims[3], claims[2], claims[0]]);
    expect(claims[0]?.status).toBe("published");
  });
  it("validateProposal mirrors the server (blank, 1001 characters, caution without key, story with key dropped)", () => {
    expect(validateProposal({ ...draft, textOriginal: "  " }, [])).toBe("blank");
    expect(validateProposal({ ...draft, textOriginal: "a".repeat(1001) }, [])).toBe("too_long");
    expect(validateProposal({ ...draft, kind: "caution" }, [])).toBe("caution_key");
    expect(validateProposal({ ...draft, kind: "caution" }, [{ key: "old" }])).toBe("ok");
    expect(validateProposal(draft, [])).toBe("ok");
    expect(proposalArgs(draft, "transcript")).toEqual({
      transcriptId: "transcript",
      spanStart: 0,
      spanEnd: 3,
      textOriginal: "claim",
      kind: "story",
    });
  });
  it("consentTextFor falls back to the default locale and returns the region's version", () => {
    const region = {
      defaultLocale: "ja",
      consent: { textVersion: "v3", requiredScopes: [], text: { ja: "同意", en: "Consent" } },
    };
    expect(consentTextFor(region, "unknown")).toEqual({
      text: "同意",
      textLang: "ja",
      textVersion: "v3",
    });
    expect(consentTextFor(region, "en").text).toBe("Consent");
  });
});
