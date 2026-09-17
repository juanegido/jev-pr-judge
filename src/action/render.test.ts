import assert from "node:assert/strict";
import { test } from "node:test";

import { decide, type JudgeAnswers } from "@/lib/judge/policy";
import type { Profile } from "@/lib/judge/types";
import { renderComment, STICKY_COMMENT_MARKER, type RenderCommentInput } from "./render";

const LEGEND = { "0": "low", "1": "mid-low", "2": "mid-high", "3": "high" };

function scoreAnswer(value: number, dominant = String(Math.round(value))) {
  const probabilities: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  probabilities[dominant] = 1;
  return { score: value, confidence: 0.9, legend: LEGEND, probabilities };
}

function noulAnswer(probability: number) {
  return { noul: probability };
}

/** A fixture with no red flags and strong scores in every dimension. */
function cleanFixture(): JudgeAnswers {
  return {
    scope_adherence: scoreAnswer(3),
    test_evidence: scoreAnswer(3),
    blast_radius: scoreAnswer(0),
    description_quality: scoreAnswer(3),
    claims_tests_without_evidence: noulAnswer(0.02),
    out_of_scope_changes: noulAnswer(0.02),
    unmentioned_debt: noulAnswer(0.02),
    leftover_debug: noulAnswer(0.02),
    possible_secret: noulAnswer(0.01),
    breaking_change_unflagged: noulAnswer(0.02),
    verdict: {
      choice: "approve",
      confidence: 0.95,
      probabilities: { approve: 0.95, human_review: 0.04, send_back: 0.01 },
    },
  };
}

function renderFor(profile: Profile, answers: JudgeAnswers = cleanFixture()): string {
  const policy = decide(answers, profile);
  const input: RenderCommentInput = {
    policy,
    model: "jev-latest",
    usage: { input_tokens: 1234, output_tokens: 56 },
    repoUrl: "https://github.com/juanegido/pr-judge",
  };
  return renderComment(input);
}

test("the sticky marker is the first line of the rendered comment", () => {
  const body = renderFor("balanced");
  assert.equal(body.split("\n")[0], STICKY_COMMENT_MARKER);
});

test("decision emoji mapping: approve, human_review, send_back", () => {
  const approveBody = renderFor("balanced");
  assert.match(approveBody, /✅/);

  const humanReviewAnswers = cleanFixture();
  humanReviewAnswers.breaking_change_unflagged = noulAnswer(0.8); // never approved outright
  const humanReviewBody = renderFor("balanced", humanReviewAnswers);
  assert.match(humanReviewBody, /👀/);

  const sendBackAnswers = cleanFixture();
  sendBackAnswers.possible_secret = noulAnswer(0.9); // hard rule -> send_back
  const sendBackBody = renderFor("balanced", sendBackAnswers);
  assert.match(sendBackBody, /⛔/);
});

test("a hard rule hit is marked in the flags table", () => {
  const answers = cleanFixture();
  answers.possible_secret = noulAnswer(0.9);
  const body = renderFor("balanced", answers);

  const flagLine = body.split("\n").find((line) => line.includes("Possible secret"));
  assert.ok(flagLine, "expected a row for the possible_secret flag");
  assert.match(flagLine!, /hard rule/);
});

test("a flag with no hard rule hit is not marked", () => {
  const body = renderFor("balanced");
  const flagLine = body.split("\n").find((line) => line.includes("Possible secret"));
  assert.ok(flagLine, "expected a row for the possible_secret flag");
  assert.doesNotMatch(flagLine!, /hard rule/);
});

test("rendering never leaks API-key-shaped material, even with a fake key nearby", () => {
  const fakeKey = "sk-typesafe-fake-1234567890abcdef";
  process.env.INPUT_TYPESAFE_API_KEY_TEST_ONLY = fakeKey;
  try {
    const body = renderFor("balanced");
    assert.doesNotMatch(body, /TYPESAFE/i);
    assert.ok(!body.includes(fakeKey));
  } finally {
    delete process.env.INPUT_TYPESAFE_API_KEY_TEST_ONLY;
  }
});
