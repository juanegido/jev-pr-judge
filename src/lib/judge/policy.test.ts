import assert from "node:assert/strict";
import { test } from "node:test";

import type { CodeFacts } from "./code-facts";
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
    reviewer_effort: scoreAnswer(0),
    claims_tests_without_evidence: noulAnswer(0.02),
    out_of_scope_changes: noulAnswer(0.02),
    unmentioned_debt: noulAnswer(0.02),
    leftover_debug: noulAnswer(0.02),
    possible_secret: noulAnswer(0.01),
    breaking_change_unflagged: noulAnswer(0.02),
    sql_injection_risk: noulAnswer(0.02),
    touches_auth: noulAnswer(0.02),
    destructive_migration: noulAnswer(0.02),
    test_deletion_unjustified: noulAnswer(0.02),
    verdict: {
      choice: "approve",
      confidence: 0.95,
      probabilities: { approve: 0.95, human_review: 0.04, send_back: 0.01 },
    },
  };
}

function emptyCodeFacts(): CodeFacts {
  return {
    test_files_removed: [],
    test_cases_removed: 0,
    test_cases_disabled: 0,
    migration_files_touched: [],
    auth_paths_touched: [],
    files_removed: 0,
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

test("a SQL injection risk forces BLOCK (send_back) regardless of profile", () => {
  const answers = cleanFixture();
  answers.sql_injection_risk = noulAnswer(0.9);

  for (const profile of PROFILES) {
    const result = decide(answers, profile);
    assert.equal(result.decision, "send_back", `expected send_back under ${profile}`);
    assert.ok(result.hardRuleHits.includes("sql_injection_risk"));
  }
});

test("touches_auth is never approved outright", () => {
  const answers = cleanFixture();
  answers.touches_auth = noulAnswer(0.8);
  const result = decide(answers, "balanced");
  assert.notEqual(result.decision, "approve");
  assert.ok(result.hardRuleHits.includes("touches_auth"));
});

test("destructive_migration is never approved outright", () => {
  const answers = cleanFixture();
  answers.destructive_migration = noulAnswer(0.8);
  const result = decide(answers, "balanced");
  assert.notEqual(result.decision, "approve");
  assert.ok(result.hardRuleHits.includes("destructive_migration"));
});

test("test_deletion_unjustified is never approved outright once past its own floor threshold", () => {
  const answers = cleanFixture();
  answers.test_deletion_unjustified = noulAnswer(0.8);
  const result = decide(answers, "balanced");
  assert.notEqual(result.decision, "approve");
  assert.ok(result.hardRuleHits.includes("test_deletion_unjustified"));
});

test("reviewer_effort is excluded from the composite score", () => {
  const low = decide(cleanFixture(), "balanced");
  const answers = cleanFixture();
  answers.reviewer_effort = scoreAnswer(3);
  const high = decide(answers, "balanced");
  assert.equal(high.composite, low.composite);
});

test("reviewer_effort is reported with its own label, separate from the dimensions", () => {
  const answers = cleanFixture();
  answers.reviewer_effort = scoreAnswer(2);
  const result = decide(answers, "balanced");
  assert.equal(result.reviewEffort.label, "deep");
  assert.equal(result.reviewEffort.raw, 2);
});

test("the code-fact rule bumps test_deletion_unjustified to at least human_review at a lower threshold than the model-only floor", () => {
  const answers = cleanFixture();
  answers.test_deletion_unjustified = noulAnswer(0.6); // below the 0.7 model-only floor rule threshold
  const codeFacts: CodeFacts = { ...emptyCodeFacts(), test_files_removed: ["src/foo.test.ts"] };

  const withoutCodeFacts = decide(answers, "balanced");
  assert.equal(withoutCodeFacts.decision, "approve");
  assert.ok(!withoutCodeFacts.hardRuleHits.includes("test_deletion_unjustified"));

  const withCodeFacts = decide(answers, "balanced", codeFacts);
  assert.notEqual(withCodeFacts.decision, "approve");
  assert.ok(withCodeFacts.hardRuleHits.includes("test_deletion_unjustified"));
});

// Regression from the second excalidraw run: #12110 removed two test cases inside an existing
// test file, the model scored 0.68, and the rule missed it because only whole-file removals and
// disabled cases were counted as the premise.
test("the code-fact rule also fires when individual test cases were removed", () => {
  const answers = cleanFixture();
  answers.test_deletion_unjustified = noulAnswer(0.6);
  const codeFacts: CodeFacts = { ...emptyCodeFacts(), test_cases_removed: 2 };
  const result = decide(answers, "balanced", codeFacts);
  assert.notEqual(result.decision, "approve");
  assert.ok(result.hardRuleHits.includes("test_deletion_unjustified"));
});

test("the code-fact rule does not fire when no tests were removed or disabled", () => {
  const answers = cleanFixture();
  answers.test_deletion_unjustified = noulAnswer(0.6);
  const result = decide(answers, "balanced", emptyCodeFacts());
  assert.equal(result.decision, "approve");
});
