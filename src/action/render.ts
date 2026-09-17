/**
 * Pure rendering helpers for the GitHub Action's sticky comment and job summary.
 *
 * Kept free of `@actions/core`/`@actions/github` and any I/O so it can be unit-tested with plain
 * fixtures (see `render.test.ts`). `main.ts` is the only place that touches the GitHub API or
 * Action inputs/outputs.
 */
import type { CodeFacts } from "@/lib/judge/code-facts";
import {
  DIMENSION_IDS,
  DIMENSION_LABELS,
  NOUL_LABELS,
  PROFILE_LABELS,
  type PolicyResult,
  type ReviewEffortLabel,
} from "@/lib/judge/policy";
import type { Decision } from "@/lib/judge/types";

/** First line of every rendered comment; used to find the sticky comment to update on later runs. */
export const STICKY_COMMENT_MARKER = "<!-- pr-judge -->";

const DECISION_EMOJI: Record<Decision, string> = {
  approve: "✅",
  human_review: "👀",
  send_back: "⛔",
};

const DECISION_TITLE: Record<Decision, string> = {
  approve: "Approve",
  human_review: "Human review",
  send_back: "Send back",
};

const REVIEW_EFFORT_TITLES: Record<ReviewEffortLabel, string> = {
  skim: "Skim",
  focused: "Focused read",
  deep: "Deep review",
  "hands-on": "Hands-on",
};

export interface RenderCommentInput {
  policy: PolicyResult;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
  /** URL of this action's repository, linked from the footer. */
  repoUrl: string;
  codeFacts: CodeFacts;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function dimensionsTable(policy: PolicyResult): string {
  const rows = DIMENSION_IDS.map((id) => {
    const dimension = policy.dimensions[id];
    return `| ${DIMENSION_LABELS[id]} | ${dimension.raw.toFixed(1)} / ${dimension.levels - 1} | ${dimension.dominantLegend} |`;
  });
  return ["| Dimension | Score | Legend |", "| --- | --- | --- |", ...rows].join("\n");
}

function flagsTable(policy: PolicyResult): string {
  const rows = policy.flags.map((flag) => {
    const label = NOUL_LABELS[flag.id as keyof typeof NOUL_LABELS] ?? flag.id;
    const hardRule = policy.hardRuleHits.includes(flag.id as (typeof policy.hardRuleHits)[number])
      ? "hard rule"
      : "";
    return `| ${label} | ${percent(flag.probability)} | ${flag.level} | ${hardRule} |`;
  });
  return ["| Flag | Probability | Level | |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

/** One line summarizing non-zero deterministic code facts; omitted entirely when everything is zero. */
function codeFactsLine(codeFacts: CodeFacts): string | undefined {
  const parts: string[] = [];
  if (codeFacts.test_files_removed.length > 0) {
    parts.push(`${codeFacts.test_files_removed.length} test file(s) removed`);
  }
  if (codeFacts.test_cases_removed > 0) parts.push(`${codeFacts.test_cases_removed} test case(s) removed`);
  if (codeFacts.test_cases_disabled > 0) parts.push(`${codeFacts.test_cases_disabled} test case(s) disabled`);
  if (codeFacts.migration_files_touched.length > 0) {
    parts.push(`${codeFacts.migration_files_touched.length} migration file(s) touched`);
  }
  if (codeFacts.auth_paths_touched.length > 0) {
    parts.push(`${codeFacts.auth_paths_touched.length} auth-related path(s) touched`);
  }
  return parts.length > 0 ? `Code facts: ${parts.join(", ")}.` : undefined;
}

/** Render the Markdown body posted as the sticky PR comment and written to the job summary. */
export function renderComment(input: RenderCommentInput): string {
  const { policy, model, usage, repoUrl, codeFacts } = input;
  const emoji = DECISION_EMOJI[policy.decision];
  const decisionTitle = DECISION_TITLE[policy.decision];
  const profileLabel = PROFILE_LABELS[policy.profile];
  const effortLine = `Estimated review effort: ${REVIEW_EFFORT_TITLES[policy.reviewEffort.label]} — ${policy.reviewEffort.dominantLegend}`;
  const factsLine = codeFactsLine(codeFacts);

  const lines: string[] = [
    STICKY_COMMENT_MARKER,
    "## PR Judge",
    "",
    `**${emoji} ${decisionTitle}** — model verdict: **${policy.modelVerdict.choice}** (${percent(policy.modelVerdict.confidence)} confidence)`,
    "",
    `Composite (${profileLabel}): ${percent(policy.composite)}`,
    "",
    effortLine,
    "",
    ...(factsLine ? [factsLine, ""] : []),
    dimensionsTable(policy),
    "",
    flagsTable(policy),
    "",
    "<details>",
    "<summary>How to read this</summary>",
    "",
    "The model answers a fixed set of typed questions about this pull request; the policy in " +
      "code — not the model — turns those answers into the decision above. Switching the " +
      "`profile` input changes how the four dimensions are weighted, not what the model inferred, " +
      "so the same run can be re-scored under a different profile with no new inference. The " +
      "thresholds behind each flag and decision are defaults meant to be calibrated against your " +
      "own pull requests, not ground truth.",
      "",
    "</details>",
    "",
    `Model: \`${model}\`${usage ? ` · ${usage.input_tokens} tokens in / ${usage.output_tokens} tokens out` : ""}`,
    `[PR Judge](${repoUrl})`,
  ];

  return lines.join("\n");
}
