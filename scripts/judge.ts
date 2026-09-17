#!/usr/bin/env npx tsx
/**
 * CLI for PR Judge.
 *
 * Usage: npx tsx scripts/judge.ts <pr-url> [--profile <balanced|hotfix|refactor|docs>] [--json]
 *        npx tsx scripts/judge.ts <pr-url> --dump-request   # print the System One payload, no API call
 */
import { fetchPullRequest, GitHubUpstreamError, PrNotFoundError, PrUrlError } from "../src/lib/github/fetch-pr";
import { MissingApiKeyError } from "../src/lib/judge/errors";
import { loadEnvFiles } from "./lib/env";
import { judgePullRequest } from "../src/lib/judge/judge";
import { buildQuestions } from "../src/lib/judge/questions";
import { buildJudgeState } from "../src/lib/judge/state";
import {
  decide,
  DIMENSION_IDS,
  DIMENSION_LABELS,
  NOUL_LABELS,
  type JudgeAnswers,
  type PolicyResult,
} from "../src/lib/judge/policy";
import { PROFILES, type JudgeState, type PullRequest, type Profile } from "../src/lib/judge/types";

function parseArgs(argv: string[]): { url?: string; profile: Profile; json: boolean; dumpRequest: boolean } {
  let url: string | undefined;
  let profile: Profile = "balanced";
  let json = false;
  let dumpRequest = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--profile") {
      profile = argv[++i] as Profile;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--dump-request") {
      dumpRequest = true;
    } else if (!arg.startsWith("--") && url === undefined) {
      url = arg;
    }
  }

  return { url, profile, json, dumpRequest };
}

function summarizeState(state: JudgeState) {
  return {
    files_with_patch: state.files.filter((f) => f.patch !== undefined).length,
    files_omitted: state.files.filter((f) => f.patch_omitted_reason !== undefined).length,
    truncated: state.files.filter((f) => f.patch_truncated === true).length,
    notes: state.notes,
  };
}

function printSummary(
  pr: PullRequest,
  profile: Profile,
  policy: PolicyResult,
  model: string,
  usage: { input_tokens: number; output_tokens: number } | undefined,
): void {
  console.log(`\n${pr.owner}/${pr.repo}#${pr.number}: ${pr.title}`);
  console.log(`by ${pr.author} · +${pr.additions} -${pr.deletions} across ${pr.changedFiles} file(s)\n`);

  console.log(`Policy decision:  ${policy.decision.toUpperCase()}`);
  console.log(
    `Model verdict:    ${policy.modelVerdict.choice} (${Math.round(policy.modelVerdict.confidence * 100)}% confidence)`,
  );
  console.log(`Composite score:  ${Math.round(policy.composite * 100)}%  [profile: ${profile}]`);

  console.log("\nDimensions:");
  for (const id of DIMENSION_IDS) {
    const dimension = policy.dimensions[id];
    console.log(
      `  ${DIMENSION_LABELS[id].padEnd(22)} ${dimension.raw.toFixed(1)}/${dimension.levels - 1}  ${dimension.dominantLegend}`,
    );
  }

  console.log("\nFlags:");
  const hardRuleHits: string[] = policy.hardRuleHits;
  const noulLabels: Record<string, string> = NOUL_LABELS;
  for (const flag of policy.flags) {
    const marker = hardRuleHits.includes(flag.id) ? "  [HARD RULE]" : "";
    console.log(
      `  ${(noulLabels[flag.id] ?? flag.id).padEnd(28)} ${Math.round(flag.probability * 100)}% (${flag.level})${marker}`,
    );
  }

  console.log(`\nModel: ${model}`);
  if (usage) {
    console.log(`Tokens: ${usage.input_tokens} in / ${usage.output_tokens} out`);
  }
  console.log("");
}

async function main(): Promise<void> {
  loadEnvFiles();

  const { url, profile, json, dumpRequest } = parseArgs(process.argv.slice(2));

  if (!url) {
    console.error(
      "Usage: npx tsx scripts/judge.ts <pr-url> [--profile <balanced|hotfix|refactor|docs>] [--json | --dump-request]",
    );
    process.exit(1);
  }

  if (!PROFILES.includes(profile)) {
    console.error(`Unknown profile "${profile}". Expected one of: ${PROFILES.join(", ")}.`);
    process.exit(1);
  }

  try {
    if (dumpRequest) {
      // Exactly what judgePullRequest sends to POST /v1/systemone; paste it into the playground.
      const pr = await fetchPullRequest(url, { githubToken: process.env.GITHUB_TOKEN });
      const payload = { model: "jev-latest", state: buildJudgeState(pr), questions: buildQuestions() };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    const { pr, state, result } = await judgePullRequest(url, { githubToken: process.env.GITHUB_TOKEN });
    // See policy.ts: the SDK's per-question generic type doesn't flow into our looser,
    // unit-testable `JudgeAnswers` shape without a cast at this one boundary.
    const policy = decide(result.answers as unknown as JudgeAnswers, profile);

    if (json) {
      console.log(
        JSON.stringify(
          {
            pr,
            state_summary: summarizeState(state),
            answers: result.answers,
            usage: result.usage,
            model: result.model,
            policy,
          },
          null,
          2,
        ),
      );
      return;
    }

    printSummary(pr, profile, policy, result.model, result.usage);
  } catch (error) {
    if (
      error instanceof MissingApiKeyError ||
      error instanceof PrUrlError ||
      error instanceof PrNotFoundError ||
      error instanceof GitHubUpstreamError
    ) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
