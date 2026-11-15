import { v } from "convex/values";
import { issueContent, issueSettings } from "../src/lib/reports/github-issue";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

function failureName(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : `NonError: ${typeof error}`;
}

/**
 * Files a new problem report as an issue in the team's private GitHub repository, which is how the
 * team hears about it (GitHub emails the repository's watchers). Without REPORTS_GITHUB_REPO and
 * REPORTS_GITHUB_TOKEN nothing is sent; the report is on the steward page either way. The contact
 * detail is never sent, and a failure logs no words of the report.
 */
export const fileIssue = internalAction({
  args: { reportId: v.id("problemReport") },
  returns: v.null(),
  handler: async (ctx, { reportId }) => {
    const settings = issueSettings(process.env);
    if (settings === null) return null;
    const report = await ctx.runQuery(internal.problemReport.forIssue, { reportId });
    if (report === null) return null;
    try {
      const response = await fetch(`https://api.github.com/repos/${settings.repo}/issues`, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${settings.token}`,
          "content-type": "application/json",
          "user-agent": "noren-problem-reports",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify(issueContent(report)),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        console.error(`problem report issue was not filed: HTTP ${response.status}`);
        return null;
      }
      const created: unknown = await response.json();
      const number =
        typeof created === "object" && created !== null && "number" in created
          ? created.number
          : undefined;
      if (typeof number === "number") {
        await ctx.runMutation(internal.problemReport.recordIssue, { reportId, number });
      }
    } catch (error) {
      console.error(`problem report issue was not filed: ${failureName(error)}`);
    }
    return null;
  },
});
