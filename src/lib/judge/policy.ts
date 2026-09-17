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
  claims_tests_without_evidence: NoulAnswer;
  out_of_scope_changes: NoulAnswer;
  unmentioned_debt: NoulAnswer;
  leftover_debug: NoulAnswer;
  possible_secret: NoulAnswer;
  breaking_change_unflagged: NoulAnswer;
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
  | "breaking_change_unflagged";

const NOUL_IDS: readonly NoulId[] = [
  "claims_tests_without_evidence",
  "out_of_scope_changes",
  "unmentioned_debt",
  "leftover_debug",
  "possible_secret",
  "breaking_change_unflagged",
];

export const NOUL_LABELS: Record<NoulId, string> = {
  claims_tests_without_evidence: "Claims tests without evidence",
  out_of_scope_changes: "Out-of-scope changes",
  unmentioned_debt: "Unmentioned debt",
  leftover_debug: "Leftover debug statements",
  possible_secret: "Possible secret",
  breaking_change_unflagged: "Unflagged breaking change",
};

const NOUL_THRESHOLDS: Record<NoulId, { warn: number; block: number }> = {
  claims_tests_without_evidence: { warn: 0.5, block: 0.8 },
  out_of_scope_changes: { warn: 0.5, block: 0.85 },
  unmentioned_debt: { warn: 0.5, block: 0.85 },
  leftover_debug: { warn: 0.5, block: 0.85 },
  possible_secret: { warn: 0.3, block: 0.7 },
  breaking_change_unflagged: { warn: 0.4, block: 0.75 },
};

/** Hard rules are evaluated on their own and never averaged into the composite. */
const HARD_RULES: ReadonlyArray<{ id: NoulId; threshold: number }> = [
  { id: "possible_secret", threshold: 0.7 },
  { id: "claims_tests_without_evidence", threshold: 0.8 },
];

/** An unflagged breaking change can't be waved through as "approve", even with a high composite. */
const BREAKING_CHANGE_FLOOR_THRESHOLD = 0.75;

const APPROVE_THRESHOLD = 0.75;
const HUMAN_REVIEW_THRESHOLD = 0.5;

export interface PolicyResult {
  profile: Profile;
  weights: ProfileWeights;
  composite: number;
  dimensions: Record<DimensionId, DimensionResult>;
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
 */
export function decide(answers: JudgeAnswers, profile: Profile): PolicyResult {
  const weights = PROFILE_WEIGHTS[profile];

  const dimensions: Record<DimensionId, DimensionResult> = {
    scope_adherence: buildDimension(answers.scope_adherence),
    test_evidence: buildDimension(answers.test_evidence),
    blast_radius: buildDimension(answers.blast_radius),
    description_quality: buildDimension(answers.description_quality),
  };

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

  let decision = decisionFromComposite(composite);
  const breakingChangeHit = answers.breaking_change_unflagged.noul >= BREAKING_CHANGE_FLOOR_THRESHOLD;
  if (breakingChangeHit && decision === "approve") decision = "human_review";
  if (hardRuleHits.length > 0) decision = "send_back";

  return {
    profile,
    weights,
    composite,
    dimensions,
    flags,
    hardRuleHits,
    decision,
    modelVerdict: {
      choice: answers.verdict.choice,
      confidence: answers.verdict.confidence,
      probabilities: answers.verdict.probabilities,
    },
  };
}
