/**
 * Entry point for the `pr-judge` GitHub Action.
 *
 * Judges the current pull request with the same `judgePullRequest` + `decide` pipeline the web
 * app and the CLI use (see `src/lib/judge/judge.ts` and `src/lib/judge/policy.ts`), then renders
 * one Markdown report (`render.ts`) that is always written to the job summary and, optionally,
 * posted or updated as a single sticky PR comment.
 */
import * as core from "@actions/core";
import * as github from "@actions/github";

import { GitHubUpstreamError, PrNotFoundError, PrUrlError } from "@/lib/github/fetch-pr";
import { MissingApiKeyError } from "@/lib/judge/errors";
import { judgePullRequest } from "@/lib/judge/judge";
import { decide, type JudgeAnswers } from "@/lib/judge/policy";
import { PROFILES, type Decision, type Profile } from "@/lib/judge/types";
import { renderComment, STICKY_COMMENT_MARKER } from "./render";

const FAIL_ON_LEVELS = ["none", "human_review", "send_back"] as const;
type FailOn = (typeof FAIL_ON_LEVELS)[number];

/** Higher rank = worse decision. `fail-on: none` is handled separately and never fails. */
const DECISION_RANK: Record<Decision, number> = {
  approve: 0,
  human_review: 1,
  send_back: 2,
};

function parseProfile(raw: string): Profile {
  if (!(PROFILES as readonly string[]).includes(raw)) {
    throw new Error(`Input "profile" must be one of ${PROFILES.join(", ")}; got "${raw}".`);
  }
  return raw as Profile;
}

function parseFailOn(raw: string): FailOn {
  if (!(FAIL_ON_LEVELS as readonly string[]).includes(raw)) {
    throw new Error(`Input "fail-on" must be one of ${FAIL_ON_LEVELS.join(", ")}; got "${raw}".`);
  }
  return raw as FailOn;
}

function resolvePrNumber(input: string): number {
  if (input.trim().length > 0) {
    const parsed = Number.parseInt(input, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`Input "pr-number" must be a number; got "${input}".`);
    }
    return parsed;
  }

  const eventPrNumber = github.context.payload.pull_request?.number;
  if (typeof eventPrNumber === "number") {
    return eventPrNumber;
  }

  throw new Error(
    'No pull request number found. Set the "pr-number" input, or run this action on a ' +
      `"pull_request" (or "pull_request_target") event; the current event is "${github.context.eventName}".`,
  );
}

async function findStickyComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<{ id: number; html_url: string } | undefined> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.find((comment) => comment.body?.startsWith(STICKY_COMMENT_MARKER));
  return existing ? { id: existing.id, html_url: existing.html_url } : undefined;
}

async function postComment(
  githubToken: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<string> {
  const octokit = github.getOctokit(githubToken);
  const existing = await findStickyComment(octokit, owner, repo, issueNumber);

  if (existing) {
    const { data } = await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return data.html_url;
  }

  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return data.html_url;
}

async function run(): Promise<void> {
  const apiKey = core.getInput("typesafe-api-key", { required: true });
  core.setSecret(apiKey);
  const githubToken = core.getInput("github-token", { required: true });
  core.setSecret(githubToken);
  const profile = parseProfile(core.getInput("profile") || "balanced");
  const shouldComment = core.getBooleanInput("comment");
  const failOn = parseFailOn(core.getInput("fail-on") || "none");
  const prNumber = resolvePrNumber(core.getInput("pr-number"));

  const { owner, repo } = github.context.repo;
  const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`;

  const { result } = await judgePullRequest(prUrl, { githubToken, apiKey });
  // See src/lib/judge/policy.ts: the SDK's per-question generic type doesn't flow into our
  // looser, unit-testable `JudgeAnswers` shape without a cast at this one boundary.
  const policy = decide(result.answers as unknown as JudgeAnswers, profile);

  core.setOutput("decision", policy.decision);
  core.setOutput("composite", policy.composite.toFixed(2));
  core.setOutput("model-verdict", policy.modelVerdict.choice);
  core.setOutput("model-verdict-confidence", policy.modelVerdict.confidence.toFixed(2));
  core.setOutput("hard-rule-hits", policy.hardRuleHits.join(","));

  const body = renderComment({
    policy,
    model: result.model,
    usage: result.usage,
    repoUrl: "https://github.com/juanegido/pr-judge",
  });

  await core.summary.addRaw(body).write();

  let commentUrl = "";
  if (shouldComment) {
    commentUrl = await postComment(githubToken, owner, repo, prNumber, body);
  }
  core.setOutput("comment-url", commentUrl);

  if (failOn !== "none" && DECISION_RANK[policy.decision] >= DECISION_RANK[failOn as Decision]) {
    core.setFailed(`PR Judge decision is "${policy.decision}", which meets the "fail-on: ${failOn}" threshold.`);
  }
}

run().catch((error: unknown) => {
  if (
    error instanceof MissingApiKeyError ||
    error instanceof PrUrlError ||
    error instanceof PrNotFoundError ||
    error instanceof GitHubUpstreamError
  ) {
    core.setFailed(error.message);
    return;
  }
  core.setFailed(error instanceof Error ? error.message : String(error));
});
