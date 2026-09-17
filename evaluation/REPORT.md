# PR Judge Evaluation Report

Generated from `evaluation/results.jsonl` (50 row(s)).

## 1. Sample

- **Repository:** excalidraw/excalidraw
- **N (pull requests):** 50
- **Merged:** 14 (28.00%)
- **Unmerged:** 36 (72.00%)
- **Date range:** 2025-08-24T16:15:25Z to 2026-09-17T16:16:37Z

**By author association**

| Association | Count | % |
| --- | --- | --- |
| NONE | 27 | 54.00% |
| MEMBER | 10 | 20.00% |
| COLLABORATOR | 10 | 20.00% |
| CONTRIBUTOR | 3 | 6.00% |

**Model calls, tokens, and state truncation**

| Metric | Value |
| --- | --- |
| Rows with model output | 50 / 50 |
| Rows with an error | 0 |
| Total tokens (input + output) | 565696 |
| Mean latency (ms) | 1713 |
| Median latency (ms) | 1580 |
| Files with a patch sent to the model | 694 |
| Files truncated (per-file cap) | 61 |
| Files omitted (lockfile or budget) | 280 |

**Code facts** (deterministic, computed from the full diff — see `src/lib/judge/code-facts.ts`)

| Fact | PRs | % |
| --- | --- | --- |
| Test files removed | 0 | 0.00% |
| Test cases removed (inside kept files) | 3 | 6.00% |
| Test cases disabled | 0 | 0.00% |
| Migration files touched | 0 | 0.00% |
| Auth paths touched | 4 | 8.00% |

## 2. Policy decision × outcome, and model verdict × outcome

**Policy decision (balanced profile) × outcome** — row percentages show the share of each decision that ended up merged vs. unmerged.

| Decision \ Outcome | Merged | Unmerged | Total |
| --- | --- | --- | --- |
| approve | 7 (50.00%) | 7 (50.00%) | 14 |
| human_review | 5 (29.41%) | 12 (70.59%) | 17 |
| send_back | 2 (10.53%) | 17 (89.47%) | 19 |

**Model verdict × outcome**

| Decision \ Outcome | Merged | Unmerged | Total |
| --- | --- | --- | --- |
| approve | 11 (47.83%) | 12 (52.17%) | 23 |
| human_review | 3 (13.04%) | 20 (86.96%) | 23 |
| send_back | 0 (0.00%) | 4 (100.00%) | 4 |

### 3. Score dimensions by outcome

| Dimension | Outcome | N | Mean | SD | Mean confidence |
| --- | --- | --- | --- | --- | --- |
| Scope adherence | merged | 14 | 2.41 | 0.42 | 0.61 |
| Scope adherence | unmerged | 36 | 2.25 | 0.90 | 0.76 |
| Test evidence | merged | 14 | 2.57 | 1.09 | 0.99 |
| Test evidence | unmerged | 36 | 1.44 | 1.28 | 0.80 |
| Blast radius | merged | 14 | 1.99 | 0.56 | 0.72 |
| Blast radius | unmerged | 36 | 1.69 | 0.73 | 0.76 |
| Description quality | merged | 14 | 2.07 | 1.26 | 0.93 |
| Description quality | unmerged | 36 | 1.69 | 1.21 | 0.89 |
| Reviewer effort | merged | 14 | 2.39 | 0.22 | 0.58 |
| Reviewer effort | unmerged | 36 | 1.76 | 0.82 | 0.58 |

## 4. The maintainer confound

Merged pull requests skew toward maintainers: maintainers (OWNER/MEMBER/COLLABORATOR) merge at 60.00% (n=20) versus 6.67% (n=30) for everyone else. Any decision × outcome or score × outcome table computed over the whole sample therefore partly measures *who opened the PR*, not just *how good it is*. The tables below split scores by maintainer status and restrict the decision × outcome table to non-maintainers only, to see how much of the effect survives.

### Score dimensions by outcome, split by maintainer status

| Dimension | Group | Outcome | N | Mean | SD |
| --- | --- | --- | --- | --- | --- |
| Scope adherence | Maintainer | merged | 12 | 2.49 | 0.33 |
| Scope adherence | Maintainer | unmerged | 8 | 1.79 | 0.96 |
| Scope adherence | Non-maintainer | merged | 2 | 1.92 | 0.76 |
| Scope adherence | Non-maintainer | unmerged | 28 | 2.38 | 0.86 |
| Test evidence | Maintainer | merged | 12 | 2.50 | 1.16 |
| Test evidence | Maintainer | unmerged | 8 | 1.53 | 0.96 |
| Test evidence | Non-maintainer | merged | 2 | 2.99 | 0.00 |
| Test evidence | Non-maintainer | unmerged | 28 | 1.41 | 1.37 |
| Blast radius | Maintainer | merged | 12 | 2.05 | 0.55 |
| Blast radius | Maintainer | unmerged | 8 | 2.14 | 0.66 |
| Blast radius | Non-maintainer | merged | 2 | 1.60 | 0.64 |
| Blast radius | Non-maintainer | unmerged | 28 | 1.56 | 0.70 |
| Description quality | Maintainer | merged | 12 | 1.94 | 1.32 |
| Description quality | Maintainer | unmerged | 8 | 0.45 | 0.92 |
| Description quality | Non-maintainer | merged | 2 | 2.85 | 0.18 |
| Description quality | Non-maintainer | unmerged | 28 | 2.04 | 1.05 |

### Policy decision × outcome, non-maintainers only

| Decision \ Outcome | Merged | Unmerged | Total |
| --- | --- | --- | --- |
| approve | 1 (12.50%) | 7 (87.50%) | 8 |
| human_review | 1 (9.09%) | 10 (90.91%) | 11 |
| send_back | 0 (0.00%) | 11 (100.00%) | 11 |

## 5. Noul flags vs. deterministic proxies

Proxies are computed from the FULL, untruncated diff (see `src/lib/eval/proxies.ts`), while the model only ever sees the bounded state described in section 1 — on large pull requests the model may be judging a partial diff that the proxy can see past. Treat this as a calibration-style sanity check, not ground truth: proxies are regexes with their own false positives and negatives.

### Claims tests without evidence

| Proxy | N | Mean noul probability |
| --- | --- | --- |
| True | 8 | 0.64 |
| False | 42 | 0.03 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1.00 | 0.63 | 0.77 | 5 | 0 | 3 | 42 |
| 0.7 | 1.00 | 0.63 | 0.77 | 5 | 0 | 3 | 42 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 44 | 0.05 |
| 0.2–0.4 | 1 | 1.00 |
| 0.4–0.6 | 0 | N/A |
| 0.6–0.8 | 0 | N/A |
| 0.8–1.0 | 5 | 1.00 |

### Leftover debug statements

| Proxy | N | Mean noul probability |
| --- | --- | --- |
| True | 0 | N/A |
| False | 50 | 0.06 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | N/A | N/A | N/A | 0 | 0 | 0 | 50 |
| 0.7 | N/A | N/A | N/A | 0 | 0 | 0 | 50 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 49 | 0.00 |
| 0.2–0.4 | 1 | 0.00 |
| 0.4–0.6 | 0 | N/A |
| 0.6–0.8 | 0 | N/A |
| 0.8–1.0 | 0 | N/A |

### Possible secret

| Proxy | N | Mean noul probability |
| --- | --- | --- |
| True | 1 | 0.87 |
| False | 49 | 0.03 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1.00 | 1.00 | 1.00 | 1 | 0 | 0 | 49 |
| 0.7 | 1.00 | 1.00 | 1.00 | 1 | 0 | 0 | 49 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 49 | 0.00 |
| 0.2–0.4 | 0 | N/A |
| 0.4–0.6 | 0 | N/A |
| 0.6–0.8 | 0 | N/A |
| 0.8–1.0 | 1 | 1.00 |

### Unmentioned debt

| Proxy | N | Mean noul probability |
| --- | --- | --- |
| True | 8 | 0.71 |
| False | 42 | 0.11 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1.00 | 0.75 | 0.86 | 6 | 0 | 2 | 42 |
| 0.7 | 1.00 | 0.63 | 0.77 | 5 | 0 | 3 | 42 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 38 | 0.03 |
| 0.2–0.4 | 5 | 0.20 |
| 0.4–0.6 | 1 | 0.00 |
| 0.6–0.8 | 1 | 1.00 |
| 0.8–1.0 | 5 | 1.00 |

### Touches auth

| Proxy | N | Mean noul probability |
| --- | --- | --- |
| True | 4 | 0.34 |
| False | 46 | 0.03 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1.00 | 0.25 | 0.40 | 1 | 0 | 3 | 46 |
| 0.7 | 1.00 | 0.25 | 0.40 | 1 | 0 | 3 | 46 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 48 | 0.04 |
| 0.2–0.4 | 1 | 1.00 |
| 0.4–0.6 | 0 | N/A |
| 0.6–0.8 | 0 | N/A |
| 0.8–1.0 | 1 | 1.00 |

### Destructive migration

`migration_proxy` only detects that a migration file exists in the diff (see `src/lib/eval/proxies.ts`) — it says nothing about whether that migration is actually destructive or lacks a stated plan. Expect lower precision here than for the other proxies: most migrations are not destructive, so the proxy will fire on many PRs the Noul correctly scores low.

| Proxy | N | Mean noul probability |
| --- | --- | --- |
| True | 0 | N/A |
| False | 50 | 0.02 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | N/A | N/A | N/A | 0 | 0 | 0 | 50 |
| 0.7 | N/A | N/A | N/A | 0 | 0 | 0 | 50 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 50 | 0.00 |
| 0.2–0.4 | 0 | N/A |
| 0.4–0.6 | 0 | N/A |
| 0.6–0.8 | 0 | N/A |
| 0.8–1.0 | 0 | N/A |

### Blast radius vs. touches shared infrastructure

| touches_shared_infra_proxy | N | Mean normalized blast_radius |
| --- | --- | --- |
| True | 7 | 0.94 |
| False | 43 | 0.53 |

## 6. Notable cases

**Top 5 by `claims_tests_without_evidence`**

| # | Title | Probability | Outcome | Decision (balanced) |
| --- | --- | --- | --- | --- |
| [11350](https://github.com/excalidraw/excalidraw/pull/11350) | refactor(excalidraw): rename cleanAppStateForExport to clearAppStateForExport | 0.96 | unmerged | send_back |
| [11888](https://github.com/excalidraw/excalidraw/pull/11888) | fix(i18n): localize "Sign up" and "Sign in" menu items (#11876) | 0.95 | unmerged | send_back |
| [11889](https://github.com/excalidraw/excalidraw/pull/11889) | fix(i18n): localize sign up and sign in menu labels | 0.95 | unmerged | send_back |
| [12050](https://github.com/excalidraw/excalidraw/pull/12050) | perf(editor): stop inverting the interactive canvas via CSS filter in dark mode | 0.94 | merged | send_back |
| [11986](https://github.com/excalidraw/excalidraw/pull/11986) | fix: detect localStorage quota errors in Firefox and Safari | 0.86 | unmerged | send_back |

**Top 5 by `out_of_scope_changes`**

| # | Title | Probability | Outcome | Decision (balanced) |
| --- | --- | --- | --- | --- |
| [11995](https://github.com/excalidraw/excalidraw/pull/11995) | Fix: stop setLanguage() from mutating document.documentElement (#11963) | 0.97 | unmerged | send_back |
| [12117](https://github.com/excalidraw/excalidraw/pull/12117) | fix: keep frame labels readable when zoomed out | 0.95 | unmerged | human_review |
| [12048](https://github.com/excalidraw/excalidraw/pull/12048) | Fix: toppicks window reference | 0.95 | unmerged | send_back |
| [11998](https://github.com/excalidraw/excalidraw/pull/11998) | Performance refactor batch | 0.94 | unmerged | send_back |
| [11669](https://github.com/excalidraw/excalidraw/pull/11669) |  allow browser find in help dialog (fixes #9276) | 0.92 | unmerged | send_back |

**5 merged pull requests with the lowest composite score (balanced profile)**

| # | Title | Composite | Decision (balanced) |
| --- | --- | --- | --- |
| [11960](https://github.com/excalidraw/excalidraw/pull/11960) | feat(app): d2c streaming | 0.29 | send_back |
| [12100](https://github.com/excalidraw/excalidraw/pull/12100) | feat(packages/excalidraw): add renderOverrides to allow overriding of element rendering | 0.58 | human_review |
| [12018](https://github.com/excalidraw/excalidraw/pull/12018) | feat(editor): Host abstraction | 0.61 | human_review |
| [12050](https://github.com/excalidraw/excalidraw/pull/12050) | perf(editor): stop inverting the interactive canvas via CSS filter in dark mode | 0.64 | send_back |
| [11849](https://github.com/excalidraw/excalidraw/pull/11849) | feat(editor): bucketfill cursor + eyedropper support | 0.65 | human_review |

## 7. Honest caveats

- **Merge outcome is a noisy label.** A pull request can be closed unmerged for reasons that have nothing to do with quality (stale, superseded by another PR, duplicate, out of scope for the maintainers' current priorities) and merged despite real problems a maintainer chose to accept or fix up afterward. Treat `outcome` as a weak signal, not ground truth.
- **The maintainer confound is real.** See section 4: merged pull requests skew toward maintainers, so any outcome-based comparison partly reflects who opened the PR rather than the PR's own qualities.
- **Proxies are regexes, not ground truth.** Each deterministic proxy in `src/lib/eval/proxies.ts` is a pattern match over paths and added lines; it has its own false positives (e.g. a TODO inside a string literal) and false negatives (e.g. a secret formatted in a way the regex doesn't recognize).
- **The model saw truncated state for large pull requests.** `src/lib/judge/state.ts` caps per-file patches and a total patch budget; the proxies in this report see the full diff, so a mismatch between a Noul and its proxy can reflect the model working from less information, not the model being wrong.
- **Thresholds (0.5, 0.7) were not tuned on this data.** They are round numbers chosen for readability, not calibrated cutoffs; precision/recall at other thresholds could look different.
- **N is small.** This report is a sanity check on real pull requests, not a statistically powered evaluation; treat every percentage and mean here as suggestive, not conclusive.
