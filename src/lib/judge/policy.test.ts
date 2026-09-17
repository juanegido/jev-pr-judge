import assert from "node:assert/strict";
import { test } from "node:test";

import { decide, PROFILE_WEIGHTS, type JudgeAnswers } from "./policy";
import { PROFILES, type Profile } from "./types";

const LEGEND = {
  "0": "low",
  "1": "mid-low",
  "2": "mid-high",
  "3": "high",
};

function scoreAnswer(value: number, dominant = String(Math.round(value))) {
  const probabilities: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  probabilities[dominant] = 1;
  return {
    score: value,
    confidence: 0.9,
    legend: LEGEND,
    probabilities,
  };
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

test("every profile's weights sum to 1", () => {
  for (const profile of PROFILES) {
    const weights = PROFILE_WEIGHTS[profile];
    const sum = weights.scope + weights.tests + weights.safety + weights.description;
    assert.ok(Math.abs(sum - 1) < 1e-9, `${profile} weights sum to ${sum}, expected 1`);
  }
});

test("a possible secret forces BLOCK (send_back) regardless of profile", () => {
  const answers = cleanFixture();
  answers.possible_secret = noulAnswer(0.9);

  for (const profile of PROFILES) {
    const result = decide(answers, profile);
    assert.equal(result.decision, "send_back", `expected send_back under ${profile}`);
    assert.ok(result.hardRuleHits.includes("possible_secret"));
  }
});

test("claiming tests without evidence forces BLOCK (send_back) regardless of profile", () => {
  const answers = cleanFixture();
  answers.claims_tests_without_evidence = noulAnswer(0.85);

  for (const profile of PROFILES) {
    const result = decide(answers, profile);
    assert.equal(result.decision, "send_back", `expected send_back under ${profile}`);
    assert.ok(result.hardRuleHits.includes("claims_tests_without_evidence"));
  }
});

test("a clean pull request yields approve under the balanced profile", () => {
  const result = decide(cleanFixture(), "balanced");
  assert.equal(result.decision, "approve");
  assert.equal(result.hardRuleHits.length, 0);
  assert.ok(result.composite >= 0.75);
});

test("an unflagged breaking change is never approved outright", () => {
  const answers = cleanFixture();
  answers.breaking_change_unflagged = noulAnswer(0.8);
  const result = decide(answers, "balanced");
  assert.notEqual(result.decision, "approve");
});

test("blast_radius is inverted for the composite: a high blast radius lowers it", () => {
  const low = decide(cleanFixture(), "balanced");
  const answers = cleanFixture();
  answers.blast_radius = scoreAnswer(3);
  const high = decide(answers, "balanced");
  assert.ok(high.composite < low.composite);
});

test("dimensions report the raw (non-inverted) normalized value for blast_radius", () => {
  const answers = cleanFixture();
  answers.blast_radius = scoreAnswer(3);
  const result = decide(answers, "balanced");
  assert.equal(result.dimensions.blast_radius.normalized, 1);
});

test("switching profiles recomputes purely from the same answers", () => {
  // Vary each dimension so the profiles' differing weights actually show up in the composite;
  // a fixture where every dimension is maxed out would score 1.0 under every weighting.
  const answers = cleanFixture();
  answers.scope_adherence = scoreAnswer(2);
  answers.test_evidence = scoreAnswer(1);
  answers.blast_radius = scoreAnswer(2);
  answers.description_quality = scoreAnswer(3);

  const results: Record<Profile, number> = {} as Record<Profile, number>;
  for (const profile of PROFILES) {
    results[profile] = decide(answers, profile).composite;
  }
  // Different weightings over identical inputs should not collapse to one identical number.
  const distinctValues = new Set(Object.values(results));
  assert.ok(distinctValues.size > 1);
});
