# PR Judge Evaluation Report

Generated from `evaluation/results.jsonl` (50 row(s)).

## 1. Sample

- **Repository:** excalidraw/excalidraw
- **N (pull requests):** 50
- **Merged:** 15 (30.00%)
- **Unmerged:** 35 (70.00%)
- **Date range:** 2025-08-24T16:15:25Z to 2026-09-16T17:50:39Z

**By author association**

| Association | Count | % |
| --- | --- | --- |
| NONE | 26 | 52.00% |
| MEMBER | 10 | 20.00% |
| COLLABORATOR | 10 | 20.00% |
| CONTRIBUTOR | 4 | 8.00% |

**Model calls, tokens, and state truncation**

| Metric | Value |
| --- | --- |
| Rows with model output | 50 / 50 |
| Rows with an error | 0 |
| Total tokens (input + output) | 515351 |
| Mean latency (ms) | 1693 |
| Median latency (ms) | 1667 |
| Files with a patch sent to the model | 684 |
| Files truncated (per-file cap) | 61 |
| Files omitted (lockfile or budget) | 280 |

## 2. Policy decision × outcome, and model verdict × outcome

**Policy decision (balanced profile) × outcome** — row percentages show the share of each decision that ended up merged vs. unmerged.

| Decision \ Outcome | Merged | Unmerged | Total |
| --- | --- | --- | --- |
| approve | 7 (50.00%) | 7 (50.00%) | 14 |
| human_review | 5 (31.25%) | 11 (68.75%) | 16 |
| send_back | 3 (15.00%) | 17 (85.00%) | 20 |

**Model verdict × outcome**

| Decision \ Outcome | Merged | Unmerged | Total |
| --- | --- | --- | --- |
| approve | 12 (48.00%) | 13 (52.00%) | 25 |
| human_review | 3 (15.00%) | 17 (85.00%) | 20 |
| send_back | 0 (0.00%) | 5 (100.00%) | 5 |

### 3. Score dimensions by outcome

| Dimension | Outcome | N | Mean | SD | Mean confidence |
| --- | --- | --- | --- | --- | --- |
| Scope adherence | merged | 15 | 2.44 | 0.42 | 0.61 |
| Scope adherence | unmerged | 35 | 2.28 | 0.89 | 0.76 |
| Test evidence | merged | 15 | 2.40 | 1.23 | 0.99 |
| Test evidence | unmerged | 35 | 1.40 | 1.27 | 0.80 |
| Blast radius | merged | 15 | 1.93 | 0.57 | 0.74 |
| Blast radius | unmerged | 35 | 1.68 | 0.73 | 0.76 |
| Description quality | merged | 15 | 2.11 | 1.23 | 0.91 |
| Description quality | unmerged | 35 | 1.65 | 1.21 | 0.89 |

## 4. The maintainer confound

Merged pull requests skew toward maintainers: maintainers (OWNER/MEMBER/COLLABORATOR) merge at 60.00% (n=20) versus 10.00% (n=30) for everyone else. Any decision × outcome or score × outcome table computed over the whole sample therefore partly measures *who opened the PR*, not just *how good it is*. The tables below split scores by maintainer status and restrict the decision × outcome table to non-maintainers only, to see how much of the effect survives.

### Score dimensions by outcome, split by maintainer status

| Dimension | Group | Outcome | N | Mean | SD |
| --- | --- | --- | --- | --- | --- |
| Scope adherence | Maintainer | merged | 12 | 2.49 | 0.33 |
| Scope adherence | Maintainer | unmerged | 8 | 1.81 | 0.96 |
| Scope adherence | Non-maintainer | merged | 3 | 2.22 | 0.74 |
| Scope adherence | Non-maintainer | unmerged | 27 | 2.42 | 0.83 |
| Test evidence | Maintainer | merged | 12 | 2.50 | 1.16 |
| Test evidence | Maintainer | unmerged | 8 | 1.56 | 0.94 |
| Test evidence | Non-maintainer | merged | 3 | 2.00 | 1.71 |
| Test evidence | Non-maintainer | unmerged | 27 | 1.36 | 1.37 |
| Blast radius | Maintainer | merged | 12 | 2.06 | 0.52 |
| Blast radius | Maintainer | unmerged | 8 | 2.15 | 0.64 |
| Blast radius | Non-maintainer | merged | 3 | 1.44 | 0.53 |
| Blast radius | Non-maintainer | unmerged | 27 | 1.54 | 0.71 |
| Description quality | Maintainer | merged | 12 | 1.94 | 1.32 |
| Description quality | Maintainer | unmerged | 8 | 0.45 | 0.93 |
| Description quality | Non-maintainer | merged | 3 | 2.81 | 0.14 |
| Description quality | Non-maintainer | unmerged | 27 | 2.00 | 1.06 |

### Policy decision × outcome, non-maintainers only

| Decision \ Outcome | Merged | Unmerged | Total |
| --- | --- | --- | --- |
| approve | 1 (12.50%) | 7 (87.50%) | 8 |
| human_review | 1 (10.00%) | 9 (90.00%) | 10 |
| send_back | 1 (8.33%) | 11 (91.67%) | 12 |

## 5. Noul flags vs. deterministic proxies

Proxies are computed from the FULL, untruncated diff (see `src/lib/eval/proxies.ts`), while the model only ever sees the bounded state described in section 1 — on large pull requests the model may be judging a partial diff that the proxy can see past. Treat this as a calibration-style sanity check, not ground truth: proxies are regexes with their own false positives and negatives.

### Claims tests without evidence

| Proxy | N | Mean noul probability |
| --- | --- | --- |
| True | 9 | 0.67 |
| False | 41 | 0.03 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1.00 | 0.67 | 0.80 | 6 | 0 | 3 | 41 |
| 0.7 | 1.00 | 0.67 | 0.80 | 6 | 0 | 3 | 41 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 43 | 0.05 |
| 0.2–0.4 | 1 | 1.00 |
| 0.4–0.6 | 0 | N/A |
| 0.6–0.8 | 0 | N/A |
| 0.8–1.0 | 6 | 1.00 |

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
| True | 8 | 0.70 |
| False | 42 | 0.12 |

| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1.00 | 0.75 | 0.86 | 6 | 0 | 2 | 42 |
| 0.7 | 1.00 | 0.63 | 0.77 | 5 | 0 | 3 | 42 |

| Noul probability bin | N | Proxy-positive rate |
| --- | --- | --- |
| 0.0–0.2 | 38 | 0.03 |
| 0.2–0.4 | 4 | 0.25 |
| 0.4–0.6 | 2 | 0.00 |
| 0.6–0.8 | 1 | 1.00 |
| 0.8–1.0 | 5 | 1.00 |

### Blast radius vs. touches shared infrastructure

| touches_shared_infra_proxy | N | Mean normalized blast_radius |
| --- | --- | --- |
| True | 7 | 0.94 |
| False | 43 | 0.53 |

## 6. Notable cases

**Top 5 by `claims_tests_without_evidence`**

| # | Title | Probability | Outcome | Decision (balanced) |
| --- | --- | --- | --- | --- |
| [11350](https://github.com/excalidraw/excalidraw/pull/11350) | refactor(excalidraw): rename cleanAppStateForExport to clearAppStateForExport | 0.97 | unmerged | send_back |
| [11888](https://github.com/excalidraw/excalidraw/pull/11888) | fix(i18n): localize "Sign up" and "Sign in" menu items (#11876) | 0.95 | unmerged | send_back |
| [12050](https://github.com/excalidraw/excalidraw/pull/12050) | perf(editor): stop inverting the interactive canvas via CSS filter in dark mode | 0.94 | merged | send_back |
| [11889](https://github.com/excalidraw/excalidraw/pull/11889) | fix(i18n): localize sign up and sign in menu labels | 0.94 | unmerged | send_back |
| [11893](https://github.com/excalidraw/excalidraw/pull/11893) | fix(app): localize hardcoded "Sign up"/"Sign in" menu labels | 0.93 | merged | send_back |

**Top 5 by `out_of_scope_changes`**

| # | Title | Probability | Outcome | Decision (balanced) |
| --- | --- | --- | --- | --- |
| [11995](https://github.com/excalidraw/excalidraw/pull/11995) | Fix: stop setLanguage() from mutating document.documentElement (#11963) | 0.98 | unmerged | send_back |
| [12048](https://github.com/excalidraw/excalidraw/pull/12048) | Fix: toppicks window reference | 0.96 | unmerged | send_back |
| [11998](https://github.com/excalidraw/excalidraw/pull/11998) | Performance refactor batch | 0.94 | unmerged | send_back |
| [11669](https://github.com/excalidraw/excalidraw/pull/11669) |  allow browser find in help dialog (fixes #9276) | 0.93 | unmerged | send_back |
| [12062](https://github.com/excalidraw/excalidraw/pull/12062) | fix(repo): Revert config | 0.90 | unmerged | send_back |

**5 merged pull requests with the lowest composite score (balanced profile)**

| # | Title | Composite | Decision (balanced) |
| --- | --- | --- | --- |
| [11960](https://github.com/excalidraw/excalidraw/pull/11960) | feat(app): d2c streaming | 0.31 | send_back |
| [12100](https://github.com/excalidraw/excalidraw/pull/12100) | feat(packages/excalidraw): add renderOverrides to allow overriding of element rendering | 0.57 | human_review |
| [12018](https://github.com/excalidraw/excalidraw/pull/12018) | feat(editor): Host abstraction | 0.61 | human_review |
| [12050](https://github.com/excalidraw/excalidraw/pull/12050) | perf(editor): stop inverting the interactive canvas via CSS filter in dark mode | 0.63 | send_back |
| [11849](https://github.com/excalidraw/excalidraw/pull/11849) | feat(editor): bucketfill cursor + eyedropper support | 0.65 | human_review |

## 7. Honest caveats

- **Merge outcome is a noisy label.** A pull request can be closed unmerged for reasons that have nothing to do with quality (stale, superseded by another PR, duplicate, out of scope for the maintainers' current priorities) and merged despite real problems a maintainer chose to accept or fix up afterward. Treat `outcome` as a weak signal, not ground truth.
- **The maintainer confound is real.** See section 4: merged pull requests skew toward maintainers, so any outcome-based comparison partly reflects who opened the PR rather than the PR's own qualities.
- **Proxies are regexes, not ground truth.** Each deterministic proxy in `src/lib/eval/proxies.ts` is a pattern match over paths and added lines; it has its own false positives (e.g. a TODO inside a string literal) and false negatives (e.g. a secret formatted in a way the regex doesn't recognize).
- **The model saw truncated state for large pull requests.** `src/lib/judge/state.ts` caps per-file patches and a total patch budget; the proxies in this report see the full diff, so a mismatch between a Noul and its proxy can reflect the model working from less information, not the model being wrong.
- **Thresholds (0.5, 0.7) were not tuned on this data.** They are round numbers chosen for readability, not calibrated cutoffs; precision/recall at other thresholds could look different.
- **N is small.** This report is a sanity check on real pull requests, not a statistically powered evaluation; treat every percentage and mean here as suggestive, not conclusive.
