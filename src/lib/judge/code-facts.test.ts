import assert from "node:assert/strict";
import { test } from "node:test";

import { computeCodeFacts } from "./code-facts";
import type { PullRequestFile } from "./types";

function file(overrides: Partial<PullRequestFile> & { path: string }): PullRequestFile {
  return {
    status: "modified",
    additions: 1,
    deletions: 0,
    ...overrides,
  };
}

test("test_files_removed lists only removed files with a test-like path", () => {
  const facts = computeCodeFacts({
    files: [
      file({ path: "src/foo.test.ts", status: "removed" }),
      file({ path: "src/foo.ts", status: "removed" }),
      file({ path: "src/bar.test.ts", status: "modified" }),
    ],
  });
  assert.deepEqual(facts.test_files_removed, ["src/foo.test.ts"]);
  assert.equal(facts.files_removed, 2);
});

test("test_cases_removed counts removed test/it/describe lines in test files, ignoring the file header", () => {
  const patch = [
    "--- a/src/foo.test.ts",
    "+++ b/src/foo.test.ts",
    "-test(\"old behavior\", () => {});",
    "-  it('also old', () => {});",
    "-describe(\"suite\", () => {});",
    "-import { x } from './x';",
  ].join("\n");
  const facts = computeCodeFacts({ files: [file({ path: "src/foo.test.ts", patch })] });
  assert.equal(facts.test_cases_removed, 3);
});

test("test_cases_removed is not counted in non-test files", () => {
  const patch = "-test(\"not a test file\", () => {});";
  const facts = computeCodeFacts({ files: [file({ path: "src/foo.ts", patch })] });
  assert.equal(facts.test_cases_removed, 0);
});

test("test_cases_disabled counts added .skip/.only/xit/xdescribe/xtest lines in test files", () => {
  const patch = [
    "+it.skip(\"flaky\", () => {});",
    "+test.only(\"focus\", () => {});",
    "+xit(\"disabled\", () => {});",
    "+xdescribe(\"disabled suite\", () => {});",
    "+xtest(\"disabled\", () => {});",
    "+it(\"still enabled\", () => {});",
  ].join("\n");
  const facts = computeCodeFacts({ files: [file({ path: "src/foo.test.ts", patch })] });
  assert.equal(facts.test_cases_disabled, 5);
});

test("test_cases_disabled ignores added lines outside test files", () => {
  const patch = "+it.skip(\"flaky\", () => {});";
  const facts = computeCodeFacts({ files: [file({ path: "src/foo.ts", patch })] });
  assert.equal(facts.test_cases_disabled, 0);
});

test("migration_files_touched matches migrations directories, .sql, schema.prisma, and alembic", () => {
  const facts = computeCodeFacts({
    files: [
      file({ path: "db/migrations/001_init.sql" }),
      file({ path: "prisma/schema.prisma" }),
      file({ path: "backend/alembic/versions/abc.py" }),
      file({ path: "src/migrate/run.ts" }),
      file({ path: "src/app.ts" }),
    ],
  });
  assert.equal(facts.migration_files_touched.length, 4);
  assert.ok(!facts.migration_files_touched.includes("src/app.ts"));
});

test("auth_paths_touched matches case-insensitively", () => {
  const facts = computeCodeFacts({
    files: [
      file({ path: "src/Auth/session.ts" }),
      file({ path: "src/middleware/JWT.ts" }),
      file({ path: "src/components/Button.tsx" }),
    ],
  });
  assert.deepEqual(facts.auth_paths_touched, ["src/Auth/session.ts", "src/middleware/JWT.ts"]);
});

test("an empty diff yields all-zero, all-empty facts", () => {
  const facts = computeCodeFacts({ files: [file({ path: "README.md" })] });
  assert.deepEqual(facts, {
    test_files_removed: [],
    test_cases_removed: 0,
    test_cases_disabled: 0,
    migration_files_touched: [],
    auth_paths_touched: [],
    files_removed: 0,
  });
});
