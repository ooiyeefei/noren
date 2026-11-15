import { describe, expect, it } from "vitest";
import { issueContent, issueSettings } from "@/lib/reports/github-issue";

const report = {
  details: "The map does not load.\n@someone see https://x.test ~~~ `code`",
  pagePath: "/en/map",
  device: "360×640 · Mozilla/5.0",
  locale: "en" as const,
  hasContact: true,
  receivedAt: Date.UTC(2026, 10, 15, 4, 0, 0),
};

describe("issueSettings", () => {
  it("needs both a repository and a token", () => {
    expect(issueSettings({})).toBeNull();
    expect(issueSettings({ REPORTS_GITHUB_REPO: "team/reports" })).toBeNull();
    expect(issueSettings({ REPORTS_GITHUB_TOKEN: "t" })).toBeNull();
    expect(
      issueSettings({ REPORTS_GITHUB_REPO: " team/reports ", REPORTS_GITHUB_TOKEN: " t " }),
    ).toEqual({ repo: "team/reports", token: "t" });
  });

  it("refuses a repository that is not owner/name", () => {
    for (const repo of ["reports", "a/b/c", "a/b?x=1", "https://github.com/a/b", "../a/b"])
      expect(issueSettings({ REPORTS_GITHUB_REPO: repo, REPORTS_GITHUB_TOKEN: "t" })).toBeNull();
  });
});

describe("issueContent", () => {
  it("writes a one-line title that can mention no one", () => {
    const { title } = issueContent(report);
    expect(title).toBe("[en] /en/map: The map does not load. someone see https://x.test ~~~ code");
    expect(title).not.toMatch(/[@#`\n]/);
  });

  it("keeps the visitor's words inside one code block", () => {
    const { body } = issueContent(report);
    expect(body.match(/~~~/g)).toHaveLength(2);
    expect(body).toContain("The map does not load.\n@someone see https://x.test ~ ~ ~ `code`");
  });

  it("says a contact was left without giving it, and names the page and time", () => {
    const { body } = issueContent(report);
    expect(body).toContain("- Reply contact left: yes, see Noren's steward page");
    expect(body).toContain("- Page: /en/map");
    expect(body).toContain("- Received: 2026-11-15T04:00:00.000Z");
    expect(issueContent({ ...report, hasContact: false, pagePath: "" }).body).toContain(
      "- Reply contact left: no",
    );
    expect(issueContent({ ...report, pagePath: "" }).title).toContain("unknown page");
  });
});
