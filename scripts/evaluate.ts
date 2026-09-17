#!/usr/bin/env npx tsx
/**
 * Run PR Judge against real, historical pull requests from a public repository and record how
 * it behaved, honestly: merge outcome (a noisy proxy for quality) alongside deterministic,
 * regex-based proxies computed independently of the model (see `src/lib/eval/proxies.ts`).
 *
 * Usage:
 *   npx tsx scripts/evaluate.ts --repo owner/name [--limit 50] [--out evaluation]
 *                                [--dry-run] [--concurrency 2]
 *
 * `--dry-run` fetches pull requests and computes proxies, but never calls the TypeSafe API
 * (zero model spend) — use it to sanity-check the pipeline before running for real.
 *
 * Results already judged in a previous run are read from `evaluation/cache/*.json` instead of
 * re-calling the (paid) TypeSafe API; only a real, non-dry-run judgment is cached.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { APIConnectionError, APIError } from "@typesafe-ai/sdk";

import { fetchPullRequest, GitHubUpstreamError } from "../src/lib/github/fetch-pr";
import { judgePullRequest } from "../src/lib/judge/judge";
import { buildJudgeState } from "../src/lib/judge/state";
import { computeCodeFacts, type CodeFacts } from "../src/lib/judge/code-facts";
import { decide, NOUL_LABELS, DIMENSION_IDS, type JudgeAnswers, type NoulId } from "../src/lib/judge/policy";
import type { JudgeState, PullRequest } from "../src/lib/judge/types";
import { computeProxies, type ProxyResults } from "../src/lib/eval/proxies";
import { loadEnvFiles } from "./lib/env";

const BOT_AUTHOR_PATTERN = /bot|dependabot|renovate/i;
const MIN_CHANGED_FILES = 1;
const MAX_CHANGED_FILES = 300;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];
const LIST_PAGE_SIZE = 100;
const MAX_LIST_PAGES = 30; // safety cap: 30 * 100 = 3,000 closed PRs scanned at most

interface CliOptions {
  repo: string;
  limit: number;
  out: string;
  dryRun: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): CliOptions {
  let repo: string | undefined;
  let limit = 50;
  let out = "evaluation";
  let dryRun = false;
  let concurrency = 2;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") repo = argv[++i];
    else if (arg === "--limit") limit = Number.parseInt(argv[++i], 10);
    else if (arg === "--out") out = argv[++i];
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--concurrency") concurrency = Number.parseInt(argv[++i], 10);
  }

  if (!repo || !repo.includes("/")) {
    console.error("Usage: npx tsx scripts/evaluate.ts --repo owner/name [--limit 50] [--out evaluation] [--dry-run] [--concurrency 2]");
    process.exit(1);
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    console.error(`--limit must be a positive integer, got "${limit}"`);
    process.exit(1);
  }
  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    console.error(`--concurrency must be a positive integer, got "${concurrency}"`);
    process.exit(1);
  }

  return { repo, limit, out, dryRun, concurrency };
}

type Outcome = "merged" | "unmerged";

/** One item from GitHub's "list pull requests" endpoint (state=closed). */
interface GitHubPullListItem {
  number: number;
  title: string;
  html_url: string;
  user?: { login?: string } | null;
  author_association?: string;
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
}

async function fetchClosedPulls(
  owner: string,
  repo: string,
  githubToken: string | undefined,
  fetchImpl: typeof fetch,
): Promise<GitHubPullListItem[]> {
  const items: GitHubPullListItem[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page++) {
    const url =
      `https://api.github.com/repos/${owner}/${repo}/pulls` +
      `?state=closed&per_page=${LIST_PAGE_SIZE}&sort=updated&direction=desc&page=${page}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new GitHubUpstreamError(
        `GitHub API returned ${response.status} while listing closed pull requests.`,
        response.status,
      );
    }
    const pageItems = (await response.json()) as GitHubPullListItem[];
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;

    items.push(...pageItems);
    if (pageItems.length < LIST_PAGE_SIZE) break;
  }
  return items;
}

export interface EvalRow {
  number: number;
  url: string;
  title: string;
  author: string;
  author_association: string;
  outcome: Outcome;
  created_at: string;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  state_summary: { files_with_patch: number; files_truncated: number; files_omitted: number };
  decision_balanced?: string;
  decision_hotfix?: string;
  /** `decide(answers, "balanced").composite`, kept for ranking (e.g. "lowest composite" in the report). */
  composite_balanced?: number;
  model_verdict?: string;
  model_verdict_confidence?: number;
  model_verdict_probabilities?: Record<string, number>;
  scores?: Record<string, { score: number; confidence: number }>;
  /** `reviewer_effort`, kept separate from `scores` since it is excluded from the composite. */
  review_effort?: { score: number; confidence: number };
  nouls?: Record<string, number>;
  proxies: ProxyResults;
  /** Deterministic code facts (see `src/lib/judge/code-facts.ts`), as counts; computed from the
   * full pull request independent of whether the model was ever called (works in `--dry-run`). */
  code_facts: CodeFactsCounts;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  latency_ms?: number;
  answers?: null;
  error?: string;
}

export interface CodeFactsCounts {
  test_files_removed: number;
  test_cases_removed: number;
  test_cases_disabled: number;
  migration_files_touched: number;
  auth_paths_touched: number;
  files_removed: number;
}

function zeroCodeFactsCounts(): CodeFactsCounts {
  return {
    test_files_removed: 0,
    test_cases_removed: 0,
    test_cases_disabled: 0,
    migration_files_touched: 0,
    auth_paths_touched: 0,
    files_removed: 0,
  };
}

function codeFactsCounts(codeFacts: CodeFacts): CodeFactsCounts {
  return {
    test_files_removed: codeFacts.test_files_removed.length,
    test_cases_removed: codeFacts.test_cases_removed,
    test_cases_disabled: codeFacts.test_cases_disabled,
    migration_files_touched: codeFacts.migration_files_touched.length,
    auth_paths_touched: codeFacts.auth_paths_touched.length,
    files_removed: codeFacts.files_removed,
  };
}

interface CacheEntry {
  pr: PullRequest;
  state_summary: EvalRow["state_summary"];
  answers: JudgeAnswers;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  latency_ms: number;
}

/** Always under `evaluation/cache/`, independent of `--out` (which only controls results.jsonl). */
const CACHE_DIR = "evaluation/cache";

function cachePath(owner: string, repo: string, number: number): string {
  return join(CACHE_DIR, `${owner}__${repo}__${number}.json`);
}

function loadCache(owner: string, repo: string, number: number): CacheEntry | undefined {
  const path = cachePath(owner, repo, number);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
  } catch {
    return undefined;
  }
}

function saveCache(owner: string, repo: string, number: number, entry: CacheEntry): void {
  const path = cachePath(owner, repo, number);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2));
}

function isEligible(pr: Pick<PullRequest, "changedFiles">): boolean {
  return pr.changedFiles >= MIN_CHANGED_FILES && pr.changedFiles <= MAX_CHANGED_FILES;
}

function summarizeState(state: JudgeState): EvalRow["state_summary"] {
  return {
    files_with_patch: state.files.filter((f) => f.patch !== undefined).length,
    files_truncated: state.files.filter((f) => f.patch_truncated === true).length,
    files_omitted: state.files.filter((f) => f.patch_omitted_reason !== undefined).length,
  };
}

function buildScores(answers: JudgeAnswers): Record<string, { score: number; confidence: number }> {
  const scores: Record<string, { score: number; confidence: number }> = {};
  for (const id of DIMENSION_IDS) {
    scores[id] = { score: answers[id].score, confidence: answers[id].confidence };
  }
  return scores;
}

function buildNouls(answers: JudgeAnswers): Record<string, number> {
  const nouls: Record<string, number> = {};
  for (const id of Object.keys(NOUL_LABELS) as NoulId[]) {
    nouls[id] = answers[id].noul;
  }
  return nouls;
}

function buildReviewEffort(answers: JudgeAnswers): { score: number; confidence: number } {
  return { score: answers.reviewer_effort.score, confidence: answers.reviewer_effort.confidence };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof APIConnectionError) return true;
  if (error instanceof APIError) return error.status === 429 || error.status === 529;
  return false;
}

/** Retry a TypeSafe call on rate limits, server overload, or connection failures. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryableError(error)) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** Run `worker` over `items` with at most `concurrency` in flight at once. */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}

function outcomeFor(item: GitHubPullListItem): Outcome {
  return item.merged_at ? "merged" : "unmerged";
}

interface ProcessContext {
  owner: string;
  repo: string;
  githubToken: string | undefined;
  dryRun: boolean;
}

/** Judge (or load the cached judgment for) one candidate pull request.
 *
 * Returns `null` when the pull request turns out to be ineligible (changed_files outside
 * [1, 300]) — eligibility can only be known once the pull request has actually been fetched,
 * since GitHub's PR *list* endpoint does not report `changed_files`.
 */
async function processCandidate(item: GitHubPullListItem, ctx: ProcessContext): Promise<EvalRow | null> {
  const { owner, repo, githubToken, dryRun } = ctx;
  const url = `https://github.com/${owner}/${repo}/pull/${item.number}`;
  const author = item.user?.login ?? "unknown";
  const author_association = item.author_association ?? "NONE";
  const outcome = outcomeFor(item);

  const cached = dryRun ? undefined : loadCache(owner, repo, item.number);
  if (cached) {
    if (!isEligible(cached.pr)) return null;
    const cachedCodeFacts = computeCodeFacts(cached.pr);
    const balanced = decide(cached.answers, "balanced", cachedCodeFacts);
    const hotfix = decide(cached.answers, "hotfix", cachedCodeFacts);
    return {
      number: item.number,
      url,
      title: cached.pr.title,
      author,
      author_association,
      outcome,
      created_at: item.created_at,
      closed_at: item.closed_at,
      additions: cached.pr.additions,
      deletions: cached.pr.deletions,
      changed_files: cached.pr.changedFiles,
      state_summary: cached.state_summary,
      decision_balanced: balanced.decision,
      decision_hotfix: hotfix.decision,
      composite_balanced: balanced.composite,
      model_verdict: balanced.modelVerdict.choice,
      model_verdict_confidence: balanced.modelVerdict.confidence,
      model_verdict_probabilities: balanced.modelVerdict.probabilities,
      scores: buildScores(cached.answers),
      review_effort: buildReviewEffort(cached.answers),
      nouls: buildNouls(cached.answers),
      proxies: computeProxies(cached.pr),
      code_facts: codeFactsCounts(cachedCodeFacts),
      usage: cached.usage,
      model: cached.model,
      latency_ms: cached.latency_ms,
    };
  }

  let pr: PullRequest;
  try {
    pr = await fetchPullRequest(url, { githubToken });
  } catch (error) {
    // We can't tell eligibility without a fetch; a failed fetch is reported as an error row
    // rather than silently dropped, so the run's failure rate stays visible.
    return {
      number: item.number,
      url,
      title: item.title,
      author,
      author_association,
      outcome,
      created_at: item.created_at,
      closed_at: item.closed_at,
      additions: 0,
      deletions: 0,
      changed_files: 0,
      state_summary: { files_with_patch: 0, files_truncated: 0, files_omitted: 0 },
      proxies: {
        test_files_touched: false,
        body_claims_tests: false,
        claims_tests_without_evidence_proxy: false,
        leftover_debug_proxy: false,
        possible_secret_proxy: false,
        unmentioned_debt_proxy: false,
        touches_shared_infra_proxy: false,
        touches_auth_proxy: false,
        migration_proxy: false,
      },
      code_facts: zeroCodeFactsCounts(),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!isEligible(pr)) return null;

  const state = buildJudgeState(pr);
  const proxies = computeProxies(pr);
  const stateSummary = summarizeState(state);

  const baseRow: EvalRow = {
    number: item.number,
    url,
    title: pr.title,
    author,
    author_association,
    outcome,
    created_at: item.created_at,
    closed_at: item.closed_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changed_files: pr.changedFiles,
    state_summary: stateSummary,
    proxies,
    code_facts: codeFactsCounts(state.code_facts),
  };

  if (dryRun) {
    return { ...baseRow, answers: null };
  }

  try {
    const started = Date.now();
    const judged = await withRetry(() => judgePullRequest(url, { githubToken }));
    const latency_ms = Date.now() - started;
    const answers = judged.result.answers as unknown as JudgeAnswers;
    const balanced = decide(answers, "balanced", judged.state.code_facts);
    const hotfix = decide(answers, "hotfix", judged.state.code_facts);
    const judgedStateSummary = summarizeState(judged.state);

    saveCache(owner, repo, item.number, {
      pr: judged.pr,
      state_summary: judgedStateSummary,
      answers,
      usage: judged.result.usage,
      model: judged.result.model,
      latency_ms,
    });

    return {
      ...baseRow,
      title: judged.pr.title,
      additions: judged.pr.additions,
      deletions: judged.pr.deletions,
      changed_files: judged.pr.changedFiles,
      state_summary: judgedStateSummary,
      code_facts: codeFactsCounts(judged.state.code_facts),
      decision_balanced: balanced.decision,
      decision_hotfix: hotfix.decision,
      composite_balanced: balanced.composite,
      model_verdict: balanced.modelVerdict.choice,
      model_verdict_confidence: balanced.modelVerdict.confidence,
      model_verdict_probabilities: balanced.modelVerdict.probabilities,
      scores: buildScores(answers),
      review_effort: buildReviewEffort(answers),
      nouls: buildNouls(answers),
      usage: judged.result.usage,
      model: judged.result.model,
      latency_ms,
    };
  } catch (error) {
    return { ...baseRow, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  const [owner, repo] = options.repo.split("/");
  const githubToken = process.env.GITHUB_TOKEN;

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(options.out, { recursive: true });

  console.log(`Fetching closed pull requests for ${owner}/${repo}...`);
  const allClosed = await fetchClosedPulls(owner, repo, githubToken, fetch);
  const candidates = allClosed.filter((item) => !BOT_AUTHOR_PATTERN.test(item.user?.login ?? ""));
  console.log(
    `Found ${allClosed.length} closed pull request(s), ${candidates.length} after excluding bot authors.`,
  );

  const rows: EvalRow[] = [];
  let cursor = 0;
  const ctx: ProcessContext = { owner, repo, githubToken, dryRun: options.dryRun };

  while (cursor < candidates.length && rows.length < options.limit) {
    const batch = candidates.slice(cursor, cursor + options.concurrency);
    cursor += batch.length;

    const batchResults = await runPool(batch, options.concurrency, (item) => processCandidate(item, ctx));
    for (const row of batchResults) {
      if (row) rows.push(row);
    }
    console.log(`Processed ${cursor}/${candidates.length} candidate(s), ${rows.length} eligible so far...`);
  }

  if (rows.length < options.limit) {
    console.warn(
      `Only found ${rows.length} eligible pull request(s) out of ${candidates.length} candidates scanned ` +
        `(requested ${options.limit}). Try a larger --limit scan or a more active repository.`,
    );
  }

  const finalRows = rows.slice(0, options.limit);
  const outPath = join(options.out, "results.jsonl");
  writeFileSync(outPath, finalRows.map((row) => JSON.stringify(row)).join("\n") + "\n");

  const errorCount = finalRows.filter((r) => r.error).length;
  console.log(`Wrote ${finalRows.length} row(s) to ${outPath} (${errorCount} with errors).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
