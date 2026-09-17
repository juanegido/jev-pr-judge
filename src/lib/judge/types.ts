/** Shared domain types for the PR Judge demo. */
import type { CodeFacts } from "./code-facts";

/** One file changed by a pull request, as normalized from the GitHub API. */
export interface PullRequestFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

/** A pull request normalized from the GitHub REST API. */
export interface PullRequest {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PullRequestFile[];
}

/** A file entry inside the bounded state sent to the model. */
export interface JudgeStateFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  patch_truncated?: boolean;
  patch_omitted_reason?: "lockfile" | "budget";
}

/** The bounded, JSON-serializable state handed to TypeSafe System One. */
export interface JudgeState {
  pull_request: {
    title: string;
    body: string;
    author: string;
    base_branch: string;
    head_branch: string;
    stats: {
      additions: number;
      deletions: number;
      changed_files: number;
    };
  };
  files: JudgeStateFile[];
  notes: string[];
  code_facts: CodeFacts;
}

/** Named weighting profiles used by the policy layer. */
export type Profile = "balanced" | "hotfix" | "refactor" | "docs";

export const PROFILES: readonly Profile[] = ["balanced", "hotfix", "refactor", "docs"];

/** Severity level assigned to a flag in the UI. */
export type FlagLevel = "info" | "warn" | "block";

/** A single noul-derived flag, ready for display. */
export interface Flag {
  id: string;
  probability: number;
  level: FlagLevel;
}

/** The policy's final decision for a pull request. */
export type Decision = "approve" | "human_review" | "send_back";
