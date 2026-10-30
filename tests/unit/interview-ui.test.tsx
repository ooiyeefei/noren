import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConsentForm, consentReady, type ConsentScope } from "@/components/interview/consent-form";
import { AudioCapture } from "@/components/interview/audio-capture";
import { formatTime, TranscriptEditor } from "@/components/interview/transcript-editor";
import { uploadWithRetry } from "@/components/interview/upload";
import { selectionToSpan, textSelectionToSpan } from "@/components/interview/span";
import { ClaimCard, type ClaimCardData } from "@/components/claims/claim-card";
import { quoteAt, quoteMatches, transcriptText } from "@/lib/claims/transcript-text";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";

const noop = async () => {};
const consentProps = {
  locale: "en",
  consentText: "同意文です",
  textLang: "ja",
  textVersion: "draft-0",
  minimumAge: 16,
  assistedAllowed: false,
  onSubmit: noop,
} as const;
const scope: ConsentScope = {
  publish: true,
  aiProcessing: true,
  transferAbroad: true,
  voiceRetention: true,
};
const file = new Blob(["mock audio"], { type: "audio/webm" });
const success = () => Response.json({ storageId: "mock-storage" });
const segments = [
  { start: 0, end: 2, speaker: "Owner", text: "最初の話" },
  { start: 2, end: 5, text: "長崎😀のお話" },
];
const claim: ClaimCardData = {
  id: "mock-claim",
  kind: "story",
  textOriginal: "架空の店主の話",
  langOriginal: "ja",
  quote: "架空のお話です",
  status: "proposed",
  aiAssisted: true,
  isMock: true,
};
function card(overrides: Partial<ClaimCardData> = {}) {
  return renderToStaticMarkup(
    <ClaimCard
      locale="en"
      claim={{ ...claim, ...overrides }}
      onConfirm={noop}
      onEdit={noop}
      onRemove={noop}
      cautionLabel="Cash only"
    />,
  );
}

describe("consent", () => {
  it("the consent form shows the text in its language and four unchecked scope boxes, and the submit button is disabled", () => {
    const html = renderToStaticMarkup(<ConsentForm {...consentProps} />);
    expect(html).toContain('lang="ja"');
    expect(html).toContain(consentProps.consentText);
    expect(html.match(/role="checkbox"/g)).toHaveLength(4);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(4);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain("16 years old");
  });
  it("the assisted box appears only when allowed", () => {
    expect(renderToStaticMarkup(<ConsentForm {...consentProps} />)).not.toContain(
      interviewUiMessages.en.assisted,
    );
    const html = renderToStaticMarkup(<ConsentForm {...consentProps} assistedAllowed />);
    expect(html.match(/role="checkbox"/g)).toHaveLength(5);
    expect(html).toContain(interviewUiMessages.en.assisted);
  });
  it("consentReady is true only with all four", () => {
    expect(consentReady(scope)).toBe(true);
    for (const key of Object.keys(scope))
      expect(consentReady({ ...scope, [key]: false })).toBe(false);
  });
  it("shows errors in an alert", () => {
    expect(renderToStaticMarkup(<ConsentForm {...consentProps} error="Please retry" />)).toMatch(
      /role="alert"[^>]*>Please retry/,
    );
  });
});

describe("uploadWithRetry", () => {
  it("uploadWithRetry posts the file with its content type and returns the storage id", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(success());
    expect(
      await uploadWithRetry({ getUploadUrl: async () => "https://upload.invalid/1", file, fetch }),
    ).toEqual({ storageId: "mock-storage" });
    expect(fetch).toHaveBeenCalledWith("https://upload.invalid/1", {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: file,
    });
  });
  it("retries a network error and a 503 with a fresh URL each time", async () => {
    let sequence = 0;
    const getUploadUrl = vi.fn(async () => `https://upload.invalid/${++sequence}`);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(success());
    const sleep = vi.fn(async () => {});
    await uploadWithRetry({ getUploadUrl, file, fetch, sleep });
    expect(getUploadUrl).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://upload.invalid/1",
      "https://upload.invalid/2",
      "https://upload.invalid/3",
    ]);
    expect(sleep.mock.calls).toEqual([[500], [1500]]);
  });
  it("does not retry a 400", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(uploadWithRetry({ getUploadUrl: async () => "url", file, fetch })).rejects.toThrow(
      "400",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("gives up after the attempts with a message naming the status", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response("", { status: 503 }));
    await expect(
      uploadWithRetry({ getUploadUrl: async () => "url", file, fetch, sleep: noop, attempts: 2 }),
    ).rejects.toThrow("503");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("a thrown non-Error still gives a non-empty message", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(undefined);
    await expect(
      uploadWithRetry({ getUploadUrl: async () => "url", file, fetch, sleep: noop }),
    ).rejects.toThrow(/Error: .+/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("refreshes an expired URL but does not retry an ordinary forbidden response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("URL expired", { status: 403 }))
      .mockResolvedValueOnce(success());
    const getUploadUrl = vi.fn(async () => "url");
    await uploadWithRetry({ getUploadUrl, file, fetch, sleep: noop });
    expect(getUploadUrl).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockResolvedValue(new Response("Forbidden", { status: 403 }));
    await expect(uploadWithRetry({ getUploadUrl, file, fetch })).rejects.toThrow("403");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed success responses and invalid attempts", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({}));
    await expect(uploadWithRetry({ getUploadUrl: async () => "url", file, fetch })).rejects.toThrow(
      "200",
    );
    await expect(
      uploadWithRetry({ getUploadUrl: async () => "url", file, fetch, attempts: 0 }),
    ).rejects.toThrow("RangeError");
  });
});

describe("spans", () => {
  it("selectionToSpan maps a selection in the second segment to offsets in transcriptText and quoteAt returns the same quote", () => {
    const span = selectionToSpan(segments, 1, 0, 2);
    expect(span).toEqual({
      spanStart: segments[0]!.text.length + 1,
      spanEnd: segments[0]!.text.length + 3,
      quote: "長崎",
    });
    expect(quoteAt(transcriptText(segments), span!.spanStart, span!.spanEnd)).toBe(span!.quote);
  });
  it("a selection across Japanese text with a surrogate pair keeps offsets", () => {
    const text = "長崎😀\nのお話";
    expect(textSelectionToSpan(text, 2, 7)).toEqual({
      spanStart: 2,
      spanEnd: 7,
      quote: "😀\nのお",
    });
  });
  it("an empty or blank selection is null", () => {
    expect(textSelectionToSpan("  \n", 0, 3)).toBeNull();
    expect(selectionToSpan(segments, 0, 1, 1)).toBeNull();
    expect(selectionToSpan(segments, 3, 0, 1)).toBeNull();
    expect(selectionToSpan(segments, 0, -1, 1)).toBeNull();
    expect(selectionToSpan(segments, 0, 0, 99)).toBeNull();
  });
  it("textSelectionToSpan trims nothing and matches quoteMatches", () => {
    const text = "前\n 話😀 \n後";
    const span = textSelectionToSpan(text, 2, 7)!;
    expect(span.quote).toBe(" 話😀 ");
    expect(quoteMatches(text, span.spanStart, span.spanEnd, span.quote)).toBe(true);
  });
});

describe("components", () => {
  it("the transcript editor renders one row per segment with the language set", () => {
    const html = renderToStaticMarkup(
      <TranscriptEditor
        locale="en"
        segments={segments}
        lang="ja"
        onSave={noop}
        speakers={["Owner", "Interviewer"]}
      />,
    );
    expect(html.match(/data-segment=/g)).toHaveLength(2);
    expect(html.match(/<textarea[^>]*lang="ja"/g)).toHaveLength(2);
    expect(html).toContain("Interviewer");
  });
  it("shows segment times as m:ss, and h:mm:ss past an hour", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(4.7)).toBe("0:04");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3725)).toBe("1:02:05");
    const html = renderToStaticMarkup(
      <TranscriptEditor
        locale="en"
        segments={[{ start: 64, end: 3725, text: "x" }]}
        lang="ja"
        onSave={noop}
      />,
    );
    expect(html).toContain("1:04–1:02:05");
  });
  it("offers propose-from-selection only when onProposeSpan is given", () => {
    const props = { locale: "en", segments, lang: "ja", onSave: noop } as const;
    expect(renderToStaticMarkup(<TranscriptEditor {...props} />)).not.toContain(
      interviewUiMessages.en.proposeSelection,
    );
    expect(
      renderToStaticMarkup(<TranscriptEditor {...props} onProposeSpan={() => {}} />),
    ).toContain(interviewUiMessages.en.proposeSelection);
  });
  it("allows saving an unchanged transcript as corrected", () => {
    const html = renderToStaticMarkup(
      <TranscriptEditor locale="en" segments={segments} lang="ja" onSave={noop} />,
    );
    const button = html.match(/<button[^>]*>Save as a corrected version<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
  });
  it("the claim card shows the text with its lang, the quote, and the AI-assisted badge", () => {
    const html = card();
    expect(html).toContain(`lang="ja"`);
    expect(html).toContain(claim.textOriginal);
    expect(html).toMatch(/<blockquote[^>]*>架空のお話です<\/blockquote>/);
    expect(html).toContain('data-badge="ai-assisted"');
  });
  it("a mock claim shows the Demo badge", () => {
    expect(card()).toContain('data-badge="demo"');
    expect(card({ isMock: false })).not.toContain('data-badge="demo"');
  });
  it("a published claim shows no action buttons", () => {
    expect(card({ status: "published" })).not.toContain("<button");
  });
  it("a caution shows its label", () => {
    expect(card({ kind: "caution", cautionType: "cash_only" })).toContain("Cash only");
  });
  it("audio capture always offers a labelled audio file alternative", () => {
    const html = renderToStaticMarkup(
      <AudioCapture locale="ja" maxSeconds={1800} disabled onRecorded={() => {}} />,
    );
    expect(html).toContain('accept="audio/*"');
    expect(html).toContain('type="file"');
    expect(html).toContain(interviewUiMessages.ja.chooseFile);
  });
});

it("interview-ui messages have the same keys in both locales", () => {
  expect(Object.keys(interviewUiMessages.en).sort()).toEqual(
    Object.keys(interviewUiMessages.ja).sort(),
  );
  for (const table of Object.values(interviewUiMessages))
    for (const message of Object.values(table)) expect(message.trim()).not.toBe("");
});
