import type { JudgeState, JudgeStateFile, PullRequest, PullRequestFile } from "./types";

const PER_FILE_PATCH_CAP = 6_000;
const TOTAL_PATCH_BUDGET = 60_000;

const LOCKFILE_NAMES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "go.sum"]);

function isLockfile(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return LOCKFILE_NAMES.has(base) || base.endsWith(".lock");
}

function isLikelyGenerated(path: string): boolean {
  return (
    /(^|\/)(dist|build|vendor|generated|\.generated|out)(\/|\.|$)/i.test(path) ||
    /\.min\.(js|css)$/i.test(path)
  );
}

interface RankedFile {
  file: PullRequestFile;
  index: number;
  lockfile: boolean;
  generated: boolean;
  size: number;
}

type PatchDecision =
  | { kind: "none" }
  | { kind: "patch"; patch: string; truncated: boolean }
  | { kind: "omitted"; reason: "lockfile" | "budget" };

/** Bound a normalized pull request into the JSON state sent to TypeSafe System One.
 *
 * Priority for keeping a full patch: non-lockfile before lockfile, non-generated before
 * generated, smaller diffs before larger ones. Lockfiles never carry a patch. Everything else
 * is truncated per-file at `PER_FILE_PATCH_CAP` and, once the running total crosses
 * `TOTAL_PATCH_BUDGET`, dropped entirely (metadata is always kept).
 */
export function buildJudgeState(pr: PullRequest): JudgeState {
  const ranked: RankedFile[] = pr.files.map((file, index) => ({
    file,
    index,
    lockfile: isLockfile(file.path),
    generated: isLikelyGenerated(file.path),
    size: file.additions + file.deletions,
  }));

  const priorityOrder = [...ranked].sort((a, b) => {
    if (a.lockfile !== b.lockfile) return a.lockfile ? 1 : -1;
    if (a.generated !== b.generated) return a.generated ? 1 : -1;
    if (a.size !== b.size) return a.size - b.size;
    return a.index - b.index;
  });

  const decisions = new Map<number, PatchDecision>();
  let remainingBudget = TOTAL_PATCH_BUDGET;
  let omittedForLockfile = 0;
  let omittedForBudget = 0;
  let truncatedCount = 0;

  for (const entry of priorityOrder) {
    if (entry.lockfile) {
      decisions.set(entry.index, { kind: "omitted", reason: "lockfile" });
      omittedForLockfile++;
      continue;
    }

    const rawPatch = entry.file.patch;
    if (!rawPatch) {
      decisions.set(entry.index, { kind: "none" });
      continue;
    }

    if (remainingBudget <= 0) {
      decisions.set(entry.index, { kind: "omitted", reason: "budget" });
      omittedForBudget++;
      continue;
    }

    let patch = rawPatch;
    let truncated = false;
    if (patch.length > PER_FILE_PATCH_CAP) {
      patch = patch.slice(0, PER_FILE_PATCH_CAP);
      truncated = true;
    }
    if (patch.length > remainingBudget) {
      patch = patch.slice(0, remainingBudget);
      truncated = true;
    }

    if (patch.length === 0) {
      decisions.set(entry.index, { kind: "omitted", reason: "budget" });
      omittedForBudget++;
      continue;
    }

    if (truncated) truncatedCount++;
    remainingBudget -= patch.length;
    decisions.set(entry.index, { kind: "patch", patch, truncated });
  }

  const files: JudgeStateFile[] = pr.files.map((file, index) => {
    const decision = decisions.get(index) ?? { kind: "none" as const };
    const stateFile: JudgeStateFile = {
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    };
    if (decision.kind === "patch") {
      stateFile.patch = decision.patch;
      if (decision.truncated) stateFile.patch_truncated = true;
    } else if (decision.kind === "omitted") {
      stateFile.patch_omitted_reason = decision.reason;
    }
    return stateFile;
  });

  const notes: string[] = [];
  if (omittedForLockfile > 0) {
    notes.push(
      `${omittedForLockfile} file(s) had their patch omitted because they are lockfiles; judge only what is present.`,
    );
  }
  if (omittedForBudget > 0) {
    notes.push(
      `${omittedForBudget} file(s) had their patch omitted due to the size budget; judge only what is present.`,
    );
  }
  if (truncatedCount > 0) {
    notes.push(`${truncatedCount} file(s) had their patch truncated to fit the per-file size cap.`);
  }

  return {
    pull_request: {
      title: pr.title,
      body: pr.body ?? "",
      author: pr.author,
      base_branch: pr.baseBranch,
      head_branch: pr.headBranch,
      stats: {
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changedFiles,
      },
    },
    files,
    notes,
  };
}
