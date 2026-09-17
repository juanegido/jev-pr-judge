/**
 * Deterministic, regex-based proxies for a subset of the judge's Noul flags.
 *
 * These are pure functions over the pull request itself (title, body, and — importantly — the
 * FULL, untruncated patches from `fetchPullRequest`, not the bounded state the model actually
 * sees). They exist to give a calibration-style check on the model's answers that is independent
 * of merge outcome: `scripts/report.ts` compares each Noul's probability against its matching
 * proxy. They are regexes, not ground truth, and have their own false positives and negatives —
 * see `evaluation/REPORT.md`'s caveats section.
 */
import { AUTH_PATH_PATTERN, MIGRATION_PATH_PATTERN } from "@/lib/judge/code-facts";
import type { PullRequest, PullRequestFile } from "@/lib/judge/types";
import { TEST_FILE_PATTERN } from "@/lib/shared/test-file-pattern";

const BODY_CLAIMS_TESTS_PATTERN = /\b(test|tests|tested|testing|unit test|e2e|coverage)\b/i;
// `debugger` must stand alone as a statement so prose like "debugger-friendly" doesn't match.
const DEBUG_STATEMENT_PATTERN =
  /console\.(log|debug|trace)\(|(^|[+;{}\s])debugger\s*;?\s*$|(^|\W)print\(|dbg!\(|binding\.pry/;
// Files where printing to the console is the job, not a leftover: docs and CLI-style scripts.
const PROSE_OR_CLI_PATH_PATTERN = /\.(md|mdx|txt|rst)$|(^|\/)(scripts?|bin|tools)\//;
// Added lines that are comments in common syntaxes (after the leading "+").
const COMMENT_LINE_PATTERN = /^\+\s*(\/\/|\/\*|\*|#)/;
const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{8,}["']/i,
];
const DEBT_MARKER_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b|\.skip\(|\bxit\(|\bxdescribe\(|@ts-ignore|@ts-expect-error|eslint-disable/;
const BODY_ACKNOWLEDGES_DEBT_PATTERN = /\b(todo|fixme|follow[- ]?up|skip|temporar|workaround)\b/i;
const SHARED_INFRA_PATH_PATTERN =
  /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|tsconfig.*\.json|Dockerfile|\.env.*)$|^\.github\/|(^|\/)(vite|webpack|next|rollup|babel|jest|vitest|eslint)\.config\.[cm]?[jt]s$|\/migrations?\//;

/** Lines added by the diff (start with "+", excluding the "+++" file header line). */
function addedLines(patch: string): string[] {
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
}

/** True if any file's path looks like a test file (by path or name). */
export function testFilesTouched(files: readonly PullRequestFile[]): boolean {
  return files.some((file) => TEST_FILE_PATTERN.test(file.path));
}

/** True if the PR body claims tests were added, updated, or that they pass. */
export function bodyClaimsTests(body: string): boolean {
  return BODY_CLAIMS_TESTS_PATTERN.test(body);
}

/** The body claims test coverage, but no file in the diff looks like a test file. */
export function claimsTestsWithoutEvidenceProxy(pr: Pick<PullRequest, "body" | "files">): boolean {
  return bodyClaimsTests(pr.body) && !testFilesTouched(pr.files);
}

/**
 * Any added, non-comment line in a non-test, non-docs, non-CLI file looks like a debug
 * statement (console.log, debugger, etc). The first evaluation run showed the naive version
 * firing on Markdown prose, code comments and scripts whose purpose is to print.
 */
export function leftoverDebugProxy(files: readonly PullRequestFile[]): boolean {
  return files.some((file) => {
    if (TEST_FILE_PATTERN.test(file.path) || PROSE_OR_CLI_PATH_PATTERN.test(file.path) || !file.patch) {
      return false;
    }
    return addedLines(file.patch).some(
      (line) => !COMMENT_LINE_PATTERN.test(line) && DEBUG_STATEMENT_PATTERN.test(line),
    );
  });
}

/** Any added line looks like a genuine credential (API key, token, private key, password). */
export function possibleSecretProxy(files: readonly PullRequestFile[]): boolean {
  return files.some((file) => {
    if (!file.patch) return false;
    return addedLines(file.patch).some((line) => SECRET_PATTERNS.some((pattern) => pattern.test(line)));
  });
}

/**
 * Added debt markers (TODO/FIXME, skipped tests, ts-ignore, eslint-disable, ...) with no
 * matching acknowledgement in the PR body (todo/follow-up/skip/temporary/workaround).
 */
export function unmentionedDebtProxy(pr: Pick<PullRequest, "body" | "files">): boolean {
  const addsDebtMarker = pr.files.some((file) => {
    if (!file.patch) return false;
    return addedLines(file.patch).some((line) => DEBT_MARKER_PATTERN.test(line));
  });
  if (!addsDebtMarker) return false;
  return !BODY_ACKNOWLEDGES_DEBT_PATTERN.test(pr.body);
}

/** Any changed path touches shared infrastructure (manifests, CI config, build config, migrations). */
export function touchesSharedInfraProxy(files: readonly PullRequestFile[]): boolean {
  return files.some((file) => SHARED_INFRA_PATH_PATTERN.test(file.path));
}

/**
 * Path-only proxy for `touches_auth`, built from the same `AUTH_PATH_PATTERN` as
 * `code_facts.auth_paths_touched`. Unlike the Noul, it can't tell whether the code at that path
 * actually changed auth *behavior* — it only sees that an auth-sounding path was touched — so it
 * is best read as an independent-ish sanity check on a semantic judgment, not a ground truth.
 */
export function touchesAuthProxy(files: readonly PullRequestFile[]): boolean {
  return files.some((file) => AUTH_PATH_PATTERN.test(file.path));
}

/**
 * Path-only proxy for `destructive_migration`, built from the same `MIGRATION_PATH_PATTERN` as
 * `code_facts.migration_files_touched`. It only detects that a migration file exists in the diff,
 * not whether that migration is destructive or lacks a stated plan, so recall against the Noul is
 * expected to be much higher than precision.
 */
export function migrationProxy(files: readonly PullRequestFile[]): boolean {
  return files.some((file) => MIGRATION_PATH_PATTERN.test(file.path));
}

export interface ProxyResults {
  test_files_touched: boolean;
  body_claims_tests: boolean;
  claims_tests_without_evidence_proxy: boolean;
  leftover_debug_proxy: boolean;
  possible_secret_proxy: boolean;
  unmentioned_debt_proxy: boolean;
  touches_shared_infra_proxy: boolean;
  touches_auth_proxy: boolean;
  migration_proxy: boolean;
}

/** Compute every deterministic proxy for one pull request in one pass. */
export function computeProxies(pr: Pick<PullRequest, "body" | "files">): ProxyResults {
  return {
    test_files_touched: testFilesTouched(pr.files),
    body_claims_tests: bodyClaimsTests(pr.body),
    claims_tests_without_evidence_proxy: claimsTestsWithoutEvidenceProxy(pr),
    leftover_debug_proxy: leftoverDebugProxy(pr.files),
    possible_secret_proxy: possibleSecretProxy(pr.files),
    unmentioned_debt_proxy: unmentionedDebtProxy(pr),
    touches_shared_infra_proxy: touchesSharedInfraProxy(pr.files),
    touches_auth_proxy: touchesAuthProxy(pr.files),
    migration_proxy: migrationProxy(pr.files),
  };
}
