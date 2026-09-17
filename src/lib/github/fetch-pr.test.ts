import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePullRequestUrl, PrUrlError } from "./fetch-pr";

test("parses a plain pull request URL", () => {
  const result = parsePullRequestUrl("https://github.com/owner/repo/pull/123");
  assert.deepEqual(result, { owner: "owner", repo: "repo", number: 123 });
});

test("accepts a trailing slash", () => {
  const result = parsePullRequestUrl("https://github.com/owner/repo/pull/123/");
  assert.deepEqual(result, { owner: "owner", repo: "repo", number: 123 });
});

test("accepts a query string", () => {
  const result = parsePullRequestUrl("https://github.com/owner/repo/pull/123?diff=split");
  assert.deepEqual(result, { owner: "owner", repo: "repo", number: 123 });
});

test("accepts a /files suffix", () => {
  const result = parsePullRequestUrl("https://github.com/owner/repo/pull/123/files");
  assert.deepEqual(result, { owner: "owner", repo: "repo", number: 123 });
});

test("accepts a fragment", () => {
  const result = parsePullRequestUrl("https://github.com/owner/repo/pull/123#discussion_r1");
  assert.deepEqual(result, { owner: "owner", repo: "repo", number: 123 });
});

test("trims surrounding whitespace", () => {
  const result = parsePullRequestUrl("  https://github.com/owner/repo/pull/123  ");
  assert.deepEqual(result, { owner: "owner", repo: "repo", number: 123 });
});

test("rejects a non-pull-request GitHub URL", () => {
  assert.throws(() => parsePullRequestUrl("https://github.com/owner/repo/issues/123"), PrUrlError);
});

test("rejects a repo URL with no pull request", () => {
  assert.throws(() => parsePullRequestUrl("https://github.com/owner/repo"), PrUrlError);
});

test("rejects a non-GitHub URL", () => {
  assert.throws(() => parsePullRequestUrl("https://example.com/owner/repo/pull/123"), PrUrlError);
});

test("rejects a string that is not a URL at all", () => {
  assert.throws(() => parsePullRequestUrl("not a url"), PrUrlError);
});
