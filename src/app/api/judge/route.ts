import { NextResponse } from "next/server";

import { GitHubUpstreamError, PrNotFoundError, PrUrlError, parsePullRequestUrl } from "@/lib/github/fetch-pr";
import { MissingApiKeyError } from "@/lib/judge/errors";
import { judgePullRequest } from "@/lib/judge/judge";

export const runtime = "nodejs";
export const maxDuration = 60;

interface JudgeRequestBody {
  url?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: JudgeRequestBody;
  try {
    body = (await request.json()) as JudgeRequestBody;
  } catch {
    return badRequest("Request body must be JSON with a `url` field.");
  }

  if (typeof body.url !== "string" || body.url.trim().length === 0) {
    return badRequest("`url` is required and must be a string.");
  }

  try {
    parsePullRequestUrl(body.url);
  } catch (error) {
    if (error instanceof PrUrlError) {
      return badRequest(error.message);
    }
    return badRequest("`url` is not a valid GitHub pull request URL.");
  }

  try {
    const { pr, state, result } = await judgePullRequest(body.url, {
      githubToken: process.env.GITHUB_TOKEN,
    });

    const filesWithPatch = state.files.filter((f) => f.patch !== undefined).length;
    const filesOmitted = state.files.filter((f) => f.patch_omitted_reason !== undefined).length;
    const truncated = state.files.filter((f) => f.patch_truncated === true).length;

    return NextResponse.json({
      pr: {
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        url: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`,
        stats: {
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changedFiles,
        },
      },
      state_summary: {
        files_with_patch: filesWithPatch,
        files_omitted: filesOmitted,
        truncated,
        notes: state.notes,
      },
      answers: result.answers,
      usage: result.usage,
      model: result.model,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error instanceof PrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PrUrlError) {
      return badRequest(error.message);
    }
    if (error instanceof GitHubUpstreamError) {
      return NextResponse.json(
        { error: "GitHub could not be reached to load this pull request. Please try again." },
        { status: 502 },
      );
    }
    // TypeSafe SDK errors (APIError, APIConnectionError, etc.) and anything else unexpected:
    // never leak error internals that might contain request bodies or headers.
    console.error("PR Judge: unexpected error while judging a pull request", error);
    return NextResponse.json(
      { error: "The judge could not be reached. Please try again." },
      { status: 502 },
    );
  }
}
