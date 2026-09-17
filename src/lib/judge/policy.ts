import type { CodeFacts } from "./code-facts";
import type { Decision, Flag, FlagLevel, Profile } from "./types";

/** Structural shape of one `score` answer, loose enough to unit-test with plain fixtures.
 *
 * The SDK infers a more specific type per question (legend/probabilities keyed by the exact
 * rubric indices as string literals). That specific type is structurally compatible at runtime
 * but TypeScript's index-signature rules don't let it flow into a `Record<string, ...>` without
 * a cast, so callers passing a real `systemOne` result cast once at this boundary (see judge.ts).
 */
export interface ScoreAnswer {
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}

export interface NoulAnswer {
  noul: number;
}

export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

/** The answers this policy needs, independent of the SDK's exact generic types. */
export interface JudgeAnswers {
  scope_adherence: ScoreAnswer;
  test_evidence: ScoreAnswer;
  blast_radius: ScoreAnswer;
  description_quality: ScoreAnswer;
  reviewer_effort: ScoreAnswer;
  claims_tests_without_evidence: NoulAnswer;
  out_of_scope_changes: NoulAnswer;
  unmentioned_debt: NoulAnswer;
  leftover_debug: NoulAnswer;
  possible_secret: NoulAnswer;
  breaking_change_unflagged: NoulAnswer;
  sql_injection_risk: NoulAnswer;
  touches_auth: NoulAnswer;
  destructive_migration: NoulAnswer;
  test_deletion_unjustified: NoulAnswer;
  verdict: ChoiceAnswer;
}

const SCORE_LEVELS = 4;

export interface ProfileWeights {
  scope: number;
  tests: number;
  safety: number;
  description: number;
}

export const PROFILE_WEIGHTS: Record<Profile, ProfileWeights> = {
  balanced: { scope: 0.35, tests: 0.25, safety: 0.15, description: 0.25 },
  hotfix: { scope: 0.3, tests: 0.35, safety: 0.3, description: 0.05 },
  refactor: { scope: 0.4, tests: 0.35, safety: 0.15, description: 0.1 },
  docs: { scope: 0.4, tests: 0.05, safety: 0.05, description: 0.5 },
};

export const PROFILE_LABELS: Record<Profile, string> = {
  balanced: "Balanced",
  hotfix: "Hotfix",
  refactor: "Refactor",
  docs: "Docs",
};

export type DimensionId = "scope_adherence" | "test_evidence" | "blast_radius" | "description_quality";

export const DIMENSION_IDS: readonly DimensionId[] = [
  "scope_adherence",
  "test_evidence",
  "blast_radius",
  "description_quality",
];

export const DIMENSION_LABELS: Record<DimensionId, string> = {
  scope_adherence: "Scope adherence",
  test_evidence: "Test evidence",
  blast_radius: "Blast radius",
  description_quality: "Description quality",
};

export interface DimensionResult {
  /** Expected score, 0..levels-1 (may be fractional, e.g. 1.8). */
  raw: number;
  levels: number;
  /** raw / (levels - 1), in 0..1. Not inverted, even for blast_radius. */
  normalized: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  /** The rubric level with the single highest probability. */
  dominantLevel: string;
  dominantLegend: string;
}

export type NoulId =
  | "claims_tests_without_evidence"
  | "out_of_scope_changes"
  | "unmentioned_debt"
  | "leftover_debug"
  | "possible_secret"
  | "breaking_change_unflagged"
  | "sql_injection_risk"
  | "touches_auth"
  | "destructive_migration"
  | "test_deletion_unjustified";

const NOUL_IDS: readonly NoulId[] = [
  "claims_tests_without_evidence",
  "out_of_scope_changes",
  "unmentioned_debt",
  "leftover_debug",
  "possible_secret",
  "breaking_change_unflagged",
  "sql_injection_risk",
  "touches_auth",
  "destructive_migration",
  "test_deletion_unjustified",
];

export const NOUL_LABELS: Record<NoulId, string> = {
  claims_tests_without_evidence: "Claims tests without evidence",
  out_of_scope_changes: "Out-of-scope changes",
  unmentioned_debt: "Unmentioned debt",
  leftover_debug: "Leftover debug statements",
  possible_secret: "Possible secret",
  breaking_change_unflagged: "Unflagged breaking change",
  sql_injection_risk: "SQL injection risk",
  touches_auth: "Touches auth",
  destructive_migration: "Destructive migration",
  test_deletion_unjustified: "Unjustified test deletion",
};

const NOUL_THRESHOLDS: Record<NoulId, { warn: number; block: number }> = {
  claims_tests_without_evidence: { warn: 0.5, block: 0.8 },
  out_of_scope_changes: { warn: 0.5, block: 0.85 },
  unmentioned_debt: { warn: 0.5, block: 0.85 },
  leftover_debug: { warn: 0.5, block: 0.85 },
  possible_secret: { warn: 0.3, block: 0.7 },
  breaking_change_unflagged: { warn: 0.4, block: 0.75 },
  sql_injection_risk: { warn: 0.4, block: 0.7 },
  touches_auth: { warn: 0.4, block: 0.7 },
  destructive_migration: { warn: 0.4, block: 0.7 },
  test_deletion_unjustified: { warn: 0.4, block: 0.7 },
};

/** Hard rules are evaluated on their own and never averaged into the composite; a hit always
 * forces `send_back` regardless of profile or composite. */
const HARD_RULES: ReadonlyArray<{ id: NoulId; threshold: number }> = [
  { id: "possible_secret", threshold: 0.7 },
  { id: "claims_tests_without_evidence", threshold: 0.8 },
  { id: "sql_injection_risk", threshold: 0.7 },
];

/** An unflagged breaking change can't be waved through as "approve", even with a high composite. */
const BREAKING_CHANGE_FLOOR_THRESHOLD = 0.75;

/** Floor rules bump `approve` up to at least `human_review`; unlike `HARD_RULES` they never force
 * `send_back` on their own. */
const HUMAN_REVIEW_FLOOR_RULES: ReadonlyArray<{ id: NoulId; threshold: number }> = [
  { id: "touches_auth", threshold: 0.7 },
  { id: "destructive_migration", threshold: 0.7 },
  { id: "test_deletion_unjustified", threshold: 0.7 },
];

/**
 * The code-fact rule for `test_deletion_unjustified`: when deterministic code facts already show
 * tests were removed or disabled, the noul's premise is already established by observed evidence
 * rather than model inference alone, so a lower probability is enough to warrant at least a human
 * look — hence a lower threshold (0.5) than the model-only floor rule above (0.7).
 */
const TEST_DELETION_CODE_FACT_THRESHOLD = 0.5;

const APPROVE_THRESHOLD = 0.75;
const HUMAN_REVIEW_THRESHOLD = 0.5;

export type ReviewEffortLabel = "skim" | "focused" | "deep" | "hands-on";

const REVIEW_EFFORT_LABELS: readonly ReviewEffortLabel[] = ["skim", "focused", "deep", "hands-on"];

/** `reviewer_effort` is reported alongside the composite but never folded into it: it measures how
 * hard the change is to verify, not how good it is. */
export interface ReviewEffortResult {
  raw: number;
  levels: number;
  dominantLegend: string;
  label: ReviewEffortLabel;
}

export interface PolicyResult {
  profile: Profile;
  weights: ProfileWeights;
  composite: number;
  dimensions: Record<DimensionId, DimensionResult>;
  reviewEffort: ReviewEffortResult;
  flags: Flag[];
  hardRuleHits: NoulId[];
  decision: Decision;
  modelVerdict: {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
}

function buildDimension(answer: ScoreAnswer): DimensionResult {
  let dominantLevel = "0";
  let bestProbability = -Infinity;
  for (const [level, probability] of Object.entries(answer.probabilities)) {
    if (probability > bestProbability) {
      bestProbability = probability;
      dominantLevel = level;
    }
  }

  return {
    raw: answer.score,
    levels: SCORE_LEVELS,
    normalized: answer.score / (SCORE_LEVELS - 1),
    legend: answer.legend,
    probabilities: answer.probabilities,
    dominantLevel,
    dominantLegend: answer.legend[dominantLevel] ?? "",
  };
}

function buildReviewEffort(answer: ScoreAnswer): ReviewEffortResult {
  const dimension = buildDimension(answer);
  const label = REVIEW_EFFORT_LABELS[Number(dimension.dominantLevel)] ?? REVIEW_EFFORT_LABELS[0];
  return {
    raw: dimension.raw,
    levels: dimension.levels,
    dominantLegend: dimension.dominantLegend,
    label,
  };
}

function levelFor(id: NoulId, probability: number): FlagLevel {
  const thresholds = NOUL_THRESHOLDS[id];
  if (probability >= thresholds.block) return "block";
  if (probability >= thresholds.warn) return "warn";
  return "info";
}

function decisionFromComposite(composite: number): Decision {
  if (composite >= APPROVE_THRESHOLD) return "approve";
  if (composite >= HUMAN_REVIEW_THRESHOLD) return "human_review";
  return "send_back";
}

/** Turn a set of System One answers into a policy decision for the given profile.
 *
 * Pure and synchronous: no I/O. Safe to re-run in the browser whenever the user switches
 * profiles, against the same answers already returned by the one API call.
 *
 * `codeFacts` is optional (and defaults to having no effect) so existing callers/tests that only
 * have answers, not a full `JudgeState`, keep working unchanged; pass `state.code_facts` wherever
 * it's available (CLI, API route, UI, evaluation, and the GitHub Action all do).
 */
export function decide(answers: JudgeAnswers, profile: Profile, codeFacts?: CodeFacts): PolicyResult {
  const weights = PROFILE_WEIGHTS[profile];

  const dimensions: Record<DimensionId, DimensionResult> = {
    scope_adherence: buildDimension(answers.scope_adherence),
    test_evidence: buildDimension(answers.test_evidence),
    blast_radius: buildDimension(answers.blast_radius),
    description_quality: buildDimension(answers.description_quality),
  };
  const reviewEffort = buildReviewEffort(answers.reviewer_effort);

  const safety = 1 - dimensions.blast_radius.normalized;
  const composite =
    dimensions.scope_adherence.normalized * weights.scope +
    dimensions.test_evidence.normalized * weights.tests +
    safety * weights.safety +
    dimensions.description_quality.normalized * weights.description;

  const flags: Flag[] = NOUL_IDS.map((id) => {
    const probability = answers[id].noul;
    return { id, probability, level: levelFor(id, probability) };
  });

  const hardRuleHits: NoulId[] = HARD_RULES.filter((rule) => answers[rule.id].noul >= rule.threshold).map(
    (rule) => rule.id,
  );
  const floorRuleHits: NoulId[] = HUMAN_REVIEW_FLOOR_RULES.filter(
    (rule) => answers[rule.id].noul >= rule.threshold,
  ).map((rule) => rule.id);

  // The code-fact rule below can also hit `test_deletion_unjustified` at a lower threshold than
  // `HUMAN_REVIEW_FLOOR_RULES` does; track it separately so it's still surfaced once in
  // `hardRuleHits` even when the model-only floor rule didn't fire.
  const testDeletionCodeFactHit =
    codeFacts !== undefined &&
    (codeFacts.test_files_removed.length > 0 ||
      codeFacts.test_cases_removed > 0 ||
      codeFacts.test_cases_disabled > 0) &&
    answers.test_deletion_unjustified.noul >= TEST_DELETION_CODE_FACT_THRESHOLD;

  let decision = decisionFromComposite(composite);
  const breakingChangeHit = answers.breaking_change_unflagged.noul >= BREAKING_CHANGE_FLOOR_THRESHOLD;
  if (breakingChangeHit && decision === "approve") decision = "human_review";
  if ((floorRuleHits.length > 0 || testDeletionCodeFactHit) && decision === "approve") decision = "human_review";
  if (hardRuleHits.length > 0) decision = "send_back";

  const allHardRuleHits = [...hardRuleHits, ...floorRuleHits];
  if (testDeletionCodeFactHit && !allHardRuleHits.includes("test_deletion_unjustified")) {
    allHardRuleHits.push("test_deletion_unjustified");
  }

  return {
    profile,
    weights,
    composite,
    dimensions,
    reviewEffort,
    flags,
    hardRuleHits: allHardRuleHits,
    decision,
    modelVerdict: {
      choice: answers.verdict.choice,
      confidence: answers.verdict.confidence,
      probabilities: answers.verdict.probabilities,
    },
  };
}
