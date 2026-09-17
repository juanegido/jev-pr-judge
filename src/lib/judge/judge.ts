import { TypeSafeClient, type SystemOneResult } from "@typesafe-ai/sdk";

/** The object branch of the SDK's `EntryType`, spelled out since it isn't exported on its own. */
type JsonRecord = { [key: string]: import("@typesafe-ai/sdk").JsonValue };

import { fetchPullRequest } from "@/lib/github/fetch-pr";
import { MissingApiKeyError } from "./errors";
import { buildJudgeState } from "./state";
import { buildQuestions, type JudgeQuestions } from "./questions";
import type { JudgeState, PullRequest } from "./types";

export interface RunJudgeOptions {
  githubToken?: string;
  /** Only meant for tests; production always reads TYPESAFE_API_KEY from the environment. */
  apiKey?: string;
  model?: string;
}

export interface JudgeOutcome {
  pr: PullRequest;
  state: JudgeState;
  result: SystemOneResult<JudgeQuestions>;
}

/** Fetch a pull request, build its bounded state, and judge it with a single System One call. */
export async function judgePullRequest(url: string, options: RunJudgeOptions = {}): Promise<JudgeOutcome> {
  if (!options.apiKey && !process.env.TYPESAFE_API_KEY) {
    throw new MissingApiKeyError();
  }

  const pr = await fetchPullRequest(url, { githubToken: options.githubToken });
  const state = buildJudgeState(pr);
  const questions = buildQuestions();

  const client = new TypeSafeClient(options.apiKey ? { apiKey: options.apiKey } : undefined);
  const result = await client.systemOne({
    // JudgeState is a concrete interface (no index signature), while the SDK's `EntryType`
    // requires one; the object is plain JSON-serializable data either way.
    state: state as unknown as JsonRecord,
    questions,
    ...(options.model ? { model: options.model } : {}),
  });

  return { pr, state, result };
}
