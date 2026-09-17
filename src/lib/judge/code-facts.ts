/**
 * Deterministic code facts computed from a pull request's full, untruncated diff — before any
 * truncation for the bounded state sent to the model (see `state.ts`). These are pure functions
 * over the diff itself, computed in code rather than judged by the model, and handed to the model
 * as `code_facts` in the state so it can reason from observed facts instead of re-deriving them
 * from a possibly-truncated patch.
 */
import { TEST_FILE_PATTERN } from "@/lib/shared/test-file-pattern";
import type { PullRequest } from "./types";

// Removed diff lines still carry their leading "-"; matching it directly (rather than requiring
// callers to strip it first) keeps this symmetric with `proxies.ts`'s `COMMENT_LINE_PATTERN`.
const REMOVED_TEST_CASE_PATTERN = /^\s*-\s*(test|it|describe)\s*\(/;
const DISABLED_TEST_CASE_PATTERN = /\.(skip|only)\(|\bxit\(|\bxdescribe\(|\bxtest\(/;

// Exported so `src/lib/eval/proxies.ts` can build its own path-only proxies from the exact same
// patterns used here, rather than maintaining a second copy that could drift.
export const MIGRATION_PATH_PATTERN = /\/migrations?\/|\/migrate\/|\.sql$|schema\.prisma$|\/alembic\//;
export const AUTH_PATH_PATTERN = /auth|session|permission|acl|oauth|jwt|passport|guard|middleware/i;

export interface CodeFacts {
  test_files_removed: string[];
  test_cases_removed: number;
  test_cases_disabled: number;
  migration_files_touched: string[];
  auth_paths_touched: string[];
  files_removed: number;
}

/** Removed lines ("-", excluding the "---" file header) from a unified diff patch. */
function removedLines(patch: string): string[] {
  return patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"));
}

/** Added lines ("+", excluding the "+++" file header) from a unified diff patch. */
function addedLines(patch: string): string[] {
  return patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
}

/** Compute every deterministic code fact for a pull request's full diff, in one pass. */
export function computeCodeFacts(pr: Pick<PullRequest, "files">): CodeFacts {
  const test_files_removed: string[] = [];
  const migration_files_touched: string[] = [];
  const auth_paths_touched: string[] = [];
  let test_cases_removed = 0;
  let test_cases_disabled = 0;
  let files_removed = 0;

  for (const file of pr.files) {
    const isTestFile = TEST_FILE_PATTERN.test(file.path);

    if (file.status === "removed") {
      files_removed++;
      if (isTestFile) test_files_removed.push(file.path);
    }

    if (MIGRATION_PATH_PATTERN.test(file.path)) migration_files_touched.push(file.path);
    if (AUTH_PATH_PATTERN.test(file.path)) auth_paths_touched.push(file.path);

    if (isTestFile && file.patch) {
      for (const line of removedLines(file.patch)) {
        if (REMOVED_TEST_CASE_PATTERN.test(line)) test_cases_removed++;
      }
      for (const line of addedLines(file.patch)) {
        if (DISABLED_TEST_CASE_PATTERN.test(line)) test_cases_disabled++;
      }
    }
  }

  return {
    test_files_removed,
    test_cases_removed,
    test_cases_disabled,
    migration_files_touched,
    auth_paths_touched,
    files_removed,
  };
}
