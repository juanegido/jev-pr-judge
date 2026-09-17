# Evaluation

This measures how PR Judge behaves on real, historical pull requests from a public GitHub
repository, honestly — including where it's noisy or wrong.

## What it measures

Every judged pull request is compared against two independent kinds of reference label:

1. **Merge outcome** (merged vs. closed-unmerged) — a noisy proxy for quality. A PR can be
   closed unmerged for reasons that have nothing to do with quality (stale, superseded,
   duplicate, out of scope for maintainers right now), and merged despite real problems a
   maintainer chose to accept. It also skews toward maintainers, who merge their own PRs at a
   higher rate than outside contributors — see the report's maintainer-confound section.
2. **Deterministic proxies** (`src/lib/eval/proxies.ts`) — plain regexes computed from the pull
   request itself (not the model), for the subset of Noul flags where a pattern can
   approximate the truth: claimed-but-missing tests, leftover debug statements, possible
   secrets, and unmentioned debt markers (TODO/FIXME, skipped tests, `@ts-ignore`,
   `eslint-disable`). These give a calibration-style check on the model's answers that is
   independent of merge outcome. They operate on the FULL, untruncated diff, while the model
   only sees the bounded state described in `src/lib/judge/state.ts` — on large pull requests a
   mismatch can mean the model was working from less information, not that it was wrong.

Neither label is ground truth. Both are cheap, imperfect signals used together.

## Reproduce it

```bash
# 1. Fetch real PRs and judge them (uses your TYPESAFE_API_KEY and GITHUB_TOKEN from .env/.env.local).
#    GITHUB_TOKEN is effectively required: 50 PRs means ~150 GitHub requests, which blows
#    through the unauthenticated limit. `gh auth token` works if you use the GitHub CLI.
GITHUB_TOKEN=$(gh auth token) npx tsx scripts/evaluate.ts --repo <owner>/<name> --limit 50

# 2. Turn the results into a Markdown report
npx tsx scripts/report.ts
```

This writes `evaluation/results.jsonl` (one row per judged pull request) and, from `report.ts`,
`evaluation/REPORT.md`. Results for this repository, once a run has completed, are published in
[`evaluation/REPORT.md`](./REPORT.md).

Useful flags on `evaluate.ts`:

- `--out <dir>` — where `results.jsonl` is written (default `evaluation`).
- `--dry-run` — fetch pull requests and compute proxies, but make **zero** TypeSafe API calls;
  use this to sanity-check a new repository or a pipeline change before spending real tokens.
- `--concurrency <n>` — how many pull requests to judge in parallel (default `2`).

Judged pull requests are cached under `evaluation/cache/` (gitignored), keyed by PR number.
Re-running `evaluate.ts` for the same repository reuses cached judgments instead of re-calling
the (paid) TypeSafe API, so it's safe to re-run after a `report.ts` or policy change.

## Cost expectations

Every judged pull request is exactly **one** TypeSafe System One call (see
`src/lib/judge/judge.ts`): one parallel call answering four Scores, six Nouls, and one Choice,
regardless of how many files the PR touches (state is bounded — see the truncation stats in
section 1 of the report). Token usage therefore scales with the size of the bounded state, not
with the number of questions. Actual input/output token counts and mean/median latency for a
completed run are reported in section 1 of `evaluation/REPORT.md`; check there rather than
assuming a number in advance.

## Caveats

Merge outcome is a noisy label that skews toward maintainers, the deterministic proxies are
regexes with their own false positives and negatives, and thresholds used for precision/recall
in the report were chosen for readability, not tuned on this data. See
`evaluation/REPORT.md`'s "Honest caveats" section for the full list.
