import type { PullRequest, PullRequestFile } from "@/lib/judge/types";

/** The pull request URL does not point at a GitHub pull request. */
export class PrUrlError extends Error {}

/** GitHub reported that the pull request does not exist (or is not visible to us). */
export class PrNotFoundError extends Error {}

/** GitHub's API failed in a way we can't recover from (rate limit, outage, unexpected shape). */
export class GitHubUpstreamError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GitHubUpstreamError";
    this.status = status;
  }
}

export interface FetchPrOptions {
  /** Sent as a Bearer token; raises GitHub's rate limit and allows private repos. */
  githubToken?: string;
  /** Override for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

const PR_URL_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/;

/** Parse a GitHub pull request URL into its owner, repo, and number. */
export function parsePullRequestUrl(url: string): { owner: string; repo: string; number: number } {
  const trimmed = url.trim();
  const match = PR_URL_PATTERN.exec(trimmed);
  if (!match) {
    throw new PrUrlError(
      `"${url}" is not a GitHub pull request URL. Expected https://github.com/{owner}/{repo}/pull/{number}.`,
    );
  }
  const [, owner, repo, numberText] = match;
  return { owner, repo, number: Number.parseInt(numberText, 10) };
}

const GITHUB_API_BASE = "https://api.github.com";
const FILES_PER_PAGE = 100;
const MAX_FILES = 300;

async function githubRequest(
  path: string,
  token: string | undefined,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchImpl(`${GITHUB_API_BASE}${path}`, { headers });
}

interface GitHubPullResponse {
  title?: string | null;
  body?: string | null;
  user?: { login?: string } | null;
  base?: { ref?: string } | null;
  head?: { ref?: string } | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

interface GitHubFileResponse {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

/** Fetch and normalize a pull request from the GitHub REST API. */
export async function fetchPullRequest(url: string, options: FetchPrOptions = {}): Promise<PullRequest> {
  const { owner, repo, number } = parsePullRequestUrl(url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.githubToken;

  const prResponse = await githubRequest(`/repos/${owner}/${repo}/pulls/${number}`, token, fetchImpl);
  if (prResponse.status === 404) {
    throw new PrNotFoundError(`Pull request ${owner}/${repo}#${number} was not found.`);
  }
  if (!prResponse.ok) {
    throw new GitHubUpstreamError(
      `GitHub API returned ${prResponse.status} while fetching the pull request.`,
      prResponse.status,
    );
  }
  const pr = (await prResponse.json()) as GitHubPullResponse;

  const files: PullRequestFile[] = [];
  for (let page = 1; files.length < MAX_FILES; page++) {
    const filesResponse = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=${FILES_PER_PAGE}&page=${page}`,
      token,
      fetchImpl,
    );
    if (!filesResponse.ok) {
      throw new GitHubUpstreamError(
        `GitHub API returned ${filesResponse.status} while fetching changed files.`,
        filesResponse.status,
      );
    }
    const pageFiles = (await filesResponse.json()) as GitHubFileResponse[];
    if (!Array.isArray(pageFiles) || pageFiles.length === 0) break;

    for (const file of pageFiles) {
      files.push({
        path: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch,
      });
      if (files.length >= MAX_FILES) break;
    }
    if (pageFiles.length < FILES_PER_PAGE) break;
  }

  return {
    owner,
    repo,
    number,
    title: pr.title ?? "",
    body: pr.body ?? "",
    author: pr.user?.login ?? "unknown",
    baseBranch: pr.base?.ref ?? "",
    headBranch: pr.head?.ref ?? "",
    additions: pr.additions ?? files.reduce((sum, f) => sum + f.additions, 0),
    deletions: pr.deletions ?? files.reduce((sum, f) => sum + f.deletions, 0),
    changedFiles: pr.changed_files ?? files.length,
    files,
  };
}
