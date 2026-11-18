import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ShareQueueView,
  type AutoPostRow,
  type AutoPostView,
  type ShareQueueRow,
} from "@/components/share/steward-share-queue";
import { shareMessages } from "@/lib/i18n/messages/share";
import {
  isRetryable,
  jstDayStart,
  jstHour,
  retryDelayMs,
  slotsAvailable,
  tokenDaysLeft,
} from "@/lib/share/auto-post";
import { classifyFailure, readCredentials } from "../../convex/lib/instagramApi";

const DAY = 24 * 60 * 60 * 1000;

describe("pacing", () => {
  it("counts the Japan-time day and hour", () => {
    const at = Date.parse("2026-11-20T01:30:00Z"); // 10:30 in Japan
    expect(jstHour(at)).toBe(10);
    expect(jstDayStart(at)).toBe(Date.parse("2026-11-19T15:00:00Z"));
    expect(jstHour(Date.parse("2026-11-20T14:59:00Z"))).toBe(23);
    expect(jstHour(Date.parse("2026-11-20T15:00:00Z"))).toBe(0);
  });
  it("opens at the set hour and closes at the daily number", () => {
    const schedule = { perDay: 2, hourJst: 10 };
    expect(slotsAvailable(schedule, Date.parse("2026-11-20T00:59:00Z"), 0)).toBe(0);
    expect(slotsAvailable(schedule, Date.parse("2026-11-20T01:00:00Z"), 0)).toBe(2);
    expect(slotsAvailable(schedule, Date.parse("2026-11-20T05:00:00Z"), 2)).toBe(0);
    expect(slotsAvailable(undefined, 0, 3)).toBe(2);
  });
  it("retries only passing troubles, with growing pauses", () => {
    expect(["network", "timeout", "api_error"].every((c) => isRetryable(c as never))).toBe(true);
    expect(isRetryable("token_invalid")).toBe(false);
    expect([1, 2, 3].map(retryDelayMs)).toEqual([300000, 1200000, 4800000]);
  });
  it("counts the token's 60 days", () => {
    expect(tokenDaysLeft(0, 0)).toBe(60);
    expect(tokenDaysLeft(0, 46 * DAY)).toBe(14);
    expect(tokenDaysLeft(0, 61 * DAY)).toBe(-1);
  });
});

describe("Instagram's answers", () => {
  it("reads credentials only when both are present and the id is numeric", () => {
    expect(readCredentials({})).toBeNull();
    expect(readCredentials({ INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_ACCOUNT_ID: "  " })).toBeNull();
    expect(
      readCredentials({ INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_ACCOUNT_ID: "abc" }),
    ).toBeNull();
    expect(
      readCredentials({ INSTAGRAM_ACCESS_TOKEN: " t\n", INSTAGRAM_ACCOUNT_ID: "123" }),
    ).toEqual({
      token: "t",
      accountId: "123",
    });
  });
  it("turns an error into one of our codes", () => {
    expect(classifyFailure(400, { error: { code: 190 } })).toBe("token_invalid");
    expect(classifyFailure(401, null)).toBe("token_invalid");
    expect(classifyFailure(400, { error: { code: 4 } })).toBe("rate_limited");
    expect(classifyFailure(400, { error: { code: 9004, error_subcode: 2207009 } })).toBe(
      "image_rejected",
    );
    expect(classifyFailure(500, { error: { code: 2 } })).toBe("api_error");
    expect(classifyFailure(502, "not json")).toBe("api_error");
  });
});

const row = (post: AutoPostRow | null = null, postedAt: number | null = null): ShareQueueRow => ({
  storyId: "s1",
  body: "A story.",
  lang: "en",
  authorName: "Aiko",
  placeEnglish: "Fictional Cafe",
  placeJapanese: null,
  town: { en: "Nagasaki", ja: "長崎" },
  postedAt,
  post,
});
const post = (over: Partial<AutoPostRow>): AutoPostRow => ({
  postId: "p1",
  storyId: "s1",
  status: "queued",
  reason: null,
  permalink: null,
  postedAt: null,
  placeEnglish: "Fictional Cafe",
  placeJapanese: null,
  needsRemoval: false,
  ...over,
});
const on: AutoPostView = {
  autoPost: true,
  configured: true,
  schedule: null,
  tokenFirstSeenAt: null,
  posts: [],
};
const NOW = 100 * DAY;
const view = (auto: AutoPostView | undefined, rows: ShareQueueRow[], locale: "en" | "ja" = "en") =>
  render(
    <ShareQueueView
      locale={locale}
      rows={rows}
      auto={auto}
      now={NOW}
      pending={undefined}
      onMarkPosted={() => {}}
    />,
  );
const m = shareMessages.en;

describe("the steward screen", () => {
  it("is exactly the by-hand queue with the switch off or no automatic data: no dead buttons", () => {
    for (const auto of [undefined, { ...on, autoPost: false }]) {
      const html = view(auto, [row()]);
      expect(html).toContain(m.markPosted);
      expect(html).toContain(m.queueIntro);
      for (const word of [m.autoApprove, m.autoIntro, m.autoNotConnected, m.autoRetry])
        expect(html).not.toContain(word);
    }
  });
  it("offers Approve when on and connected, with the by-hand kit still there", () => {
    const html = view(on, [row()]);
    expect(html).toContain(m.autoApprove);
    expect(html).toContain(m.autoIntro);
    expect(html).toContain(m.markPosted);
  });
  it("says Instagram is not connected, with no Approve button", () => {
    const html = view({ ...on, configured: false }, [row()]);
    expect(html).toContain(m.autoNotConnected);
    expect(html).not.toContain(m.autoApprove);
  });
  it("shows the pacing and warns before the token runs out", () => {
    const html = view(
      { ...on, schedule: { perDay: 2, hourJst: 10 }, tokenFirstSeenAt: NOW - 50 * DAY },
      [row()],
    );
    expect(html).toContain("10:00 Japan time, at most 2 a day");
    expect(html).toContain("about 10 days");
    expect(view({ ...on, tokenFirstSeenAt: NOW - 70 * DAY }, [row()])).toContain(
      m.autoTokenExpired,
    );
    expect(view({ ...on, tokenFirstSeenAt: NOW - 5 * DAY }, [row()])).not.toContain("runs out in");
  });
  it("shows each state: waiting, posted with the link, failed with a reason and Try again", () => {
    expect(view(on, [row(post({ status: "queued" }))])).toContain(m.autoQueued);
    expect(view(on, [row(post({ status: "publishing" }))])).toContain(m.autoPublishing);
    const posted = view(on, [
      row(post({ status: "posted", postedAt: NOW, permalink: "https://www.instagram.com/p/abc/" })),
    ]);
    expect(posted).toContain('href="https://www.instagram.com/p/abc/"');
    expect(posted).not.toContain(m.autoApprove);
    const failed = view(on, [row(post({ status: "failed", reason: "token_invalid" }))]);
    expect(failed).toContain(m.autoReasonToken);
    expect(failed).toContain(m.autoRetry);
    expect(view(on, [row(post({ status: "cancelled", reason: "withdrawn" }))])).toContain(
      m.autoCancelledWithdrawn,
    );
  });
  it("lists posts to take down by hand, even with the switch off, with the link", () => {
    const html = view(
      {
        ...on,
        autoPost: false,
        posts: [
          post({
            status: "posted",
            needsRemoval: true,
            permalink: "https://www.instagram.com/p/gone/",
          }),
        ],
      },
      [],
    );
    expect(html).toContain(m.autoRemoveTitle);
    expect(html).toContain("https://www.instagram.com/p/gone/");
    expect(html).toContain(m.autoRemoveDone);
  });
  it("speaks Japanese too", () => {
    const ja = shareMessages.ja;
    const html = view({ ...on, configured: false }, [row()], "ja");
    expect(html).toContain(ja.autoNotConnected);
    expect(Object.keys(ja).sort()).toEqual(Object.keys(shareMessages.en).sort());
  });
});
