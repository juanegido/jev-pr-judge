import assert from "node:assert/strict";
import { test } from "node:test";

import { buildJudgeState } from "./state";
import type { PullRequest, PullRequestFile } from "./types";

function makeFile(overrides: Partial<PullRequestFile> & { path: string }): PullRequestFile {
  return {
    status: "modified",
    additions: 1,
    deletions: 0,
    ...overrides,
  };
}

function makePr(files: PullRequestFile[]): PullRequest {
  return {
    owner: "octocat",
    repo: "demo",
    number: 1,
    title: "Test PR",
    body: "Body",
    author: "octocat",
    baseBranch: "main",
    headBranch: "feature",
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    changedFiles: files.length,
    files,
  };
}

test("a patch over the per-file cap is truncated and flagged", () => {
  const patch = "a".repeat(8_000);
  const pr = makePr([makeFile({ path: "src/big.ts", additions: 500, patch })]);

  const state = buildJudgeState(pr);
  const file = state.files[0];

  assert.equal(file.patch?.length, 6_000);
  assert.equal(file.patch_truncated, true);
  assert.equal(file.patch_omitted_reason, undefined);
});

test("a patch at or under the per-file cap is kept whole and not flagged truncated", () => {
  const patch = "a".repeat(6_000);
  const pr = makePr([makeFile({ path: "src/small.ts", additions: 10, patch })]);

  const state = buildJudgeState(pr);
  const file = state.files[0];

  assert.equal(file.patch, patch);
  assert.equal(file.patch_truncated, undefined);
});

test("lockfiles never carry a patch and are omitted with reason 'lockfile'", () => {
  const pr = makePr([
    makeFile({ path: "package-lock.json", additions: 200, patch: "a".repeat(100) }),
    makeFile({ path: "vendor/thing/yarn.lock", additions: 50, patch: "b".repeat(100) }),
  ]);

  const state = buildJudgeState(pr);

  for (const file of state.files) {
    assert.equal(file.patch, undefined);
    assert.equal(file.patch_omitted_reason, "lockfile");
  }
  assert.ok(state.notes.some((note) => note.includes("lockfile")));
});

test("once the total patch budget is exhausted, further patches are omitted with reason 'budget' and a note is added", () => {
  // Ten files exactly consume the 60,000 char total budget (each at the 6,000 per-file cap,
  // so none of them individually truncates); an eleventh, larger file must be dropped entirely.
  const files: PullRequestFile[] = [];
  for (let i = 0; i < 10; i++) {
    files.push(makeFile({ path: `src/file-${i}.ts`, additions: i + 1, patch: "a".repeat(6_000) }));
  }
  files.push(makeFile({ path: "src/overflow.ts", additions: 100, patch: "b".repeat(6_000) }));

  const pr = makePr(files);
  const state = buildJudgeState(pr);

  const overflow = state.files.find((f) => f.path === "src/overflow.ts");
  assert.equal(overflow?.patch, undefined);
  assert.equal(overflow?.patch_omitted_reason, "budget");

  for (let i = 0; i < 10; i++) {
    const kept = state.files.find((f) => f.path === `src/file-${i}.ts`);
    assert.equal(kept?.patch?.length, 6_000);
  }

  assert.ok(state.notes.some((note) => note.includes("budget")));
});

test("small files are prioritized to keep their full patch over larger ones, regardless of original order", () => {
  // Nine filler files (smaller than both candidates) burn all but the last 6,000 chars of
  // budget. `big` appears first in the PR's file list but is much larger than `small`; only one
  // of the two can fit in the remaining budget, and small-first prioritization must pick `small`.
  const files: PullRequestFile[] = [
    makeFile({ path: "src/big.ts", additions: 100, patch: "B".repeat(6_000) }),
    makeFile({ path: "src/small.ts", additions: 1, patch: "S".repeat(6_000) }),
  ];
  for (let i = 0; i < 9; i++) {
    files.push(makeFile({ path: `src/filler-${i}.ts`, additions: 0, patch: "f".repeat(6_000) }));
  }

  const pr = makePr(files);
  const state = buildJudgeState(pr);

  const small = state.files.find((f) => f.path === "src/small.ts");
  const big = state.files.find((f) => f.path === "src/big.ts");

  assert.equal(small?.patch?.length, 6_000);
  assert.equal(small?.patch_omitted_reason, undefined);

  assert.equal(big?.patch, undefined);
  assert.equal(big?.patch_omitted_reason, "budget");
});

test("buildJudgeState includes code_facts computed from the full pull request", () => {
  const pr = makePr([
    makeFile({ path: "src/foo.test.ts", status: "removed" }),
    makeFile({ path: "db/migrations/001_init.sql" }),
  ]);

  const state = buildJudgeState(pr);

  assert.deepEqual(state.code_facts.test_files_removed, ["src/foo.test.ts"]);
  assert.deepEqual(state.code_facts.migration_files_touched, ["db/migrations/001_init.sql"]);
  assert.equal(state.code_facts.files_removed, 1);
});
