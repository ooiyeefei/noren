import type { StoryChecker } from "./check";
import {
  describeProblem,
  verifyStory,
  type CitationProblem,
  type CitedSentence,
  type ReportedStory,
  type StoryPlace,
  type StoryPost,
  type StoryWriter,
} from "./story";

export const STORY_STEP_KINDS = [
  "read",
  "drafted",
  "citation_rejected",
  "rewrote",
  "checked",
  "dropped",
] as const;
export const STORY_RUN_STATUSES = [
  "queued",
  "waiting",
  "running",
  "published",
  "nothing",
  "failed",
] as const;
export type StoryRunStatus = (typeof STORY_RUN_STATUSES)[number];

/** One thing the agent did, kept for the steward's view of the run. */
export type StoryStep =
  | { kind: "read"; count: number; detail: string }
  | { kind: "drafted"; count: number }
  | { kind: "citation_rejected"; sentence: string; words: string; detail: string }
  | { kind: "rewrote"; count: number; detail: "citations" | "check" }
  | { kind: "checked"; sentence: string; added: string[] }
  | { kind: "dropped"; sentence: string; detail: string };

function asReported(
  posts: readonly StoryPost[],
  sentences: readonly CitedSentence[],
): ReportedStory {
  return {
    sentences: sentences.map(({ en, ja, citations }) => ({
      en,
      ja,
      citations: citations.map(({ postId, words }) => ({
        post: posts.findIndex(({ id }) => id === postId) + 1,
        words,
      })),
    })),
  };
}

/**
 * One place's story, as a loop between three readers: the writer drafts, code rejects every citation
 * it can't find in the post and hands the problems back once, then a different model reads each
 * sentence against the words it cites and its findings go back to the writer once. What still fails
 * after that is dropped: nothing reaches a page on the writer's word alone.
 */
export async function runStoryAgent(
  input: { place: StoryPlace; posts: readonly StoryPost[] },
  deps: {
    writer: StoryWriter;
    checker: StoryChecker;
    step(step: StoryStep): Promise<unknown>;
  },
): Promise<CitedSentence[]> {
  const { place, posts } = input;
  const platforms = [...new Set(posts.map(({ platform }) => platform))].join(", ");
  await deps.step({ kind: "read", count: posts.length, detail: platforms });

  const reject = async (problems: readonly CitationProblem[]) => {
    for (const { sentence, words, problem } of problems)
      await deps.step({ kind: "citation_rejected", sentence, words, detail: problem });
  };
  const draft = await deps.writer.write({ place, posts });
  let { sentences, problems } = verifyStory(posts, draft);
  await deps.step({ kind: "drafted", count: draft.sentences.length });
  await reject(problems);
  if (problems.length > 0) {
    const again = await deps.writer.write({
      place,
      posts,
      feedback: { previous: draft, problems: problems.map(describeProblem) },
    });
    ({ sentences, problems } = verifyStory(posts, again));
    await deps.step({ kind: "rewrote", count: sentences.length, detail: "citations" });
    for (const { sentence, problem } of problems)
      await deps.step({ kind: "dropped", sentence, detail: problem });
  }

  const check = async (sentence: CitedSentence) => {
    const report = await deps.checker.check({
      en: sentence.en,
      ja: sentence.ja,
      words: sentence.citations.map(({ words }) => words),
    });
    await deps.step({ kind: "checked", sentence: sentence.en, added: report.added });
    return report;
  };
  const passed = new Set<string>();
  const findings: string[] = [];
  for (const sentence of sentences) {
    const report = await check(sentence);
    if (report.supported) passed.add(sentence.en);
    else
      findings.push(
        `"${sentence.en}": the words it cites do not support ${report.added.join("; ") || "it"}.`,
      );
  }
  if (findings.length === 0) return sentences;

  const revised = await deps.writer.write({
    place,
    posts,
    feedback: { previous: asReported(posts, sentences), problems: findings },
  });
  const verified = verifyStory(posts, revised);
  await deps.step({ kind: "rewrote", count: verified.sentences.length, detail: "check" });
  for (const { sentence, problem } of verified.problems)
    await deps.step({ kind: "dropped", sentence, detail: problem });
  const final: CitedSentence[] = [];
  for (const sentence of verified.sentences) {
    if (passed.has(sentence.en)) {
      final.push(sentence);
      continue;
    }
    const report = await check(sentence);
    if (report.supported) final.push(sentence);
    else
      await deps.step({ kind: "dropped", sentence: sentence.en, detail: report.added.join("; ") });
  }
  return final;
}
