/**
 * Turns a problem report into a GitHub issue for the team's private reports repository.
 * The contact detail is never part of it: it stays in Noren and is erased when the report closes.
 */
export type IssueSettings = { repo: string; token: string };

export type ReportForIssue = {
  details: string;
  pagePath: string;
  device: string;
  locale: "ja" | "en";
  hasContact: boolean;
  receivedAt: number;
};

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Both settings must be present; with either missing, no issue is filed. */
export function issueSettings(env: Record<string, string | undefined>): IssueSettings | null {
  const repo = env.REPORTS_GITHUB_REPO?.trim() ?? "";
  const token = env.REPORTS_GITHUB_TOKEN?.trim() ?? "";
  if (!REPO.test(repo) || token.length === 0) return null;
  return { repo, token };
}

/** One line, no markdown that could mention someone or open a link. */
function plainLine(text: string, max: number): string {
  const line = text
    .replace(/\s+/g, " ")
    .replace(/[@#`<>[\]]/g, "")
    .trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A visitor's words go inside a code block so GitHub shows them as written and runs nothing. */
function fenced(text: string): string {
  return `~~~text\n${text.replace(/~~~/g, "~ ~ ~")}\n~~~`;
}

export function issueContent(report: ReportForIssue): { title: string; body: string } {
  const where = report.pagePath === "" ? "unknown page" : plainLine(report.pagePath, 80);
  return {
    title: `[${report.locale}] ${where}: ${plainLine(report.details, 70)}`,
    body: [
      "A visitor sent this from Noren's Report a problem form.",
      "",
      fenced(report.details),
      "",
      `- Page: ${where}`,
      `- Browser and screen: ${plainLine(report.device, 300) || "not given"}`,
      `- Language: ${report.locale}`,
      `- Received: ${new Date(report.receivedAt).toISOString()}`,
      `- Reply contact left: ${report.hasContact ? "yes, see Noren's steward page" : "no"}`,
      "",
      "Mark it done on Noren's steward page as well; that erases the contact detail.",
    ].join("\n"),
  };
}
