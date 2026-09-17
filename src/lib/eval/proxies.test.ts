import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bodyClaimsTests,
  claimsTestsWithoutEvidenceProxy,
  leftoverDebugProxy,
  possibleSecretProxy,
  testFilesTouched,
  touchesSharedInfraProxy,
  unmentionedDebtProxy,
} from "./proxies";
import type { PullRequestFile } from "@/lib/judge/types";

function file(path: string, patch?: string): PullRequestFile {
  return { path, status: "modified", additions: 1, deletions: 0, patch };
}

test("testFilesTouched matches common test file conventions", () => {
  assert.equal(testFilesTouched([file("src/foo.test.ts")]), true);
  assert.equal(testFilesTouched([file("src/foo.spec.tsx")]), true);
  assert.equal(testFilesTouched([file("src/foo_test.js")]), true);
  assert.equal(testFilesTouched([file("src/__tests__/foo.ts")]), true);
  assert.equal(testFilesTouched([file("tests/foo.ts")]), true);
  assert.equal(testFilesTouched([file("src/foo.ts")]), false);
});

test("bodyClaimsTests matches common test-claim wording, case-insensitively", () => {
  assert.equal(bodyClaimsTests("Added unit tests for this."), true);
  assert.equal(bodyClaimsTests("Covered by e2e."), true);
  assert.equal(bodyClaimsTests("TESTED locally."), true);
  assert.equal(bodyClaimsTests("Fixes a typo in the README."), false);
});

test("claimsTestsWithoutEvidenceProxy is true only when the body claims tests but none were touched", () => {
  assert.equal(
    claimsTestsWithoutEvidenceProxy({ body: "Added tests for this.", files: [file("src/foo.ts")] }),
    true,
  );
  assert.equal(
    claimsTestsWithoutEvidenceProxy({
      body: "Added tests for this.",
      files: [file("src/foo.test.ts")],
    }),
    false,
  );
  assert.equal(
    claimsTestsWithoutEvidenceProxy({ body: "Fixes a typo.", files: [file("src/foo.ts")] }),
    false,
  );
});

test("leftoverDebugProxy flags an added console.log in non-test code", () => {
  const patch = "@@ -1,2 +1,3 @@\n line one\n+console.log('debug')\n line two";
  assert.equal(leftoverDebugProxy([file("src/foo.ts", patch)]), true);
});

test("leftoverDebugProxy ignores removed lines and the +++ diff header", () => {
  const patch = "+++ b/src/foo.ts\n-console.log('debug')\n line two";
  assert.equal(leftoverDebugProxy([file("src/foo.ts", patch)]), false);
});

test("leftoverDebugProxy ignores debug statements added inside test files", () => {
  const patch = "@@ -1,2 +1,3 @@\n+console.log('debug')\n";
  assert.equal(leftoverDebugProxy([file("src/foo.test.ts", patch)]), false);
});

test("leftoverDebugProxy matches debugger, print, dbg!, and binding.pry", () => {
  assert.equal(leftoverDebugProxy([file("a.ts", "+debugger;")]), true);
  assert.equal(leftoverDebugProxy([file("a.ts", "+  debugger")]), true);
  assert.equal(leftoverDebugProxy([file("a.py", "+print('x')")]), true);
  assert.equal(leftoverDebugProxy([file("a.rs", "+dbg!(x);")]), true);
  assert.equal(leftoverDebugProxy([file("a.rb", "+binding.pry")]), true);
});

// Regression cases from the first excalidraw evaluation run: all three were proxy false positives.
test("leftoverDebugProxy ignores 'debugger' inside prose and comments", () => {
  assert.equal(leftoverDebugProxy([file("AGENTS.md", "+- Development JS retains debugger-friendly sources")]), false);
  assert.equal(leftoverDebugProxy([file("src/build.js", "+    // retain sources in debugger-only builds.")]), false);
  assert.equal(leftoverDebugProxy([file("src/build.js", "+  # print(debug) is disabled here")]), false);
});

test("leftoverDebugProxy ignores console output in CLI-style scripts", () => {
  assert.equal(leftoverDebugProxy([file("scripts/fork-check.js", "+  console.log(result)")]), false);
  assert.equal(leftoverDebugProxy([file("bin/cli.ts", "+console.log('usage')")]), false);
  assert.equal(leftoverDebugProxy([file("src/app.ts", "+console.log(result)")]), true);
});

test("possibleSecretProxy flags an added AWS-style access key", () => {
  const patch = "+const key = 'AKIAABCDEFGHIJKLMNOP';";
  assert.equal(possibleSecretProxy([file("src/config.ts", patch)]), true);
});

test("possibleSecretProxy flags an added private key block", () => {
  const patch = "+-----BEGIN RSA PRIVATE KEY-----";
  assert.equal(possibleSecretProxy([file("keys.pem", patch)]), true);
});

test("possibleSecretProxy flags a quoted secret assignment", () => {
  const patch = "+const apiKey = \"abcdefgh12345678\";";
  assert.equal(possibleSecretProxy([file("src/config.ts", patch)]), true);
});

test("possibleSecretProxy ignores placeholders and env var references", () => {
  const patch = "+const key = process.env.API_KEY;";
  assert.equal(possibleSecretProxy([file("src/config.ts", patch)]), false);
});

test("unmentionedDebtProxy flags an added TODO with no acknowledgement in the body", () => {
  const patch = "+// TODO: handle this properly";
  assert.equal(unmentionedDebtProxy({ body: "Fixes the bug.", files: [file("src/foo.ts", patch)] }), true);
});

test("unmentionedDebtProxy is false when the body acknowledges the trade-off", () => {
  const patch = "+// TODO: handle this properly";
  assert.equal(
    unmentionedDebtProxy({ body: "Follow-up needed here, see TODO.", files: [file("src/foo.ts", patch)] }),
    false,
  );
});

test("unmentionedDebtProxy is false when no debt marker was added", () => {
  assert.equal(unmentionedDebtProxy({ body: "Fixes the bug.", files: [file("src/foo.ts", "+ok();")] }), false);
});

test("unmentionedDebtProxy matches skipped tests and lint/type suppressions", () => {
  assert.equal(unmentionedDebtProxy({ body: "", files: [file("a.ts", "+it.skip('x', () => {});")] }), true);
  assert.equal(unmentionedDebtProxy({ body: "", files: [file("a.ts", "+// @ts-ignore")] }), true);
  assert.equal(unmentionedDebtProxy({ body: "", files: [file("a.ts", "+// eslint-disable-next-line")] }), true);
});

test("touchesSharedInfraProxy flags manifests, CI config, and migrations", () => {
  assert.equal(touchesSharedInfraProxy([file("package.json")]), true);
  assert.equal(touchesSharedInfraProxy([file(".github/workflows/ci.yml")]), true);
  assert.equal(touchesSharedInfraProxy([file("next.config.js")]), true);
  assert.equal(touchesSharedInfraProxy([file("db/migrations/001_init.sql")]), true);
  assert.equal(touchesSharedInfraProxy([file("src/components/Button.tsx")]), false);
});
