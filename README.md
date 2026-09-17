# PR Judge

A demo of TypeSafe's System One primitives (the Jev model) judging whether a GitHub pull
request actually does what it claims — a fast, cheap, typed verdict for developers running
coding agents, instead of a slow LLM-as-judge prompt chain.

## Why System One fits here

- **One call, not a chain.** Every question runs in parallel against one bounded state; there's
  no multi-turn prompting and no waiting on a chain of chat completions.
- **Typed answers, not parsed text.** Scores, yes/no probabilities, and a labeled choice come
  back as numbers and enums code can use directly — no JSON-mode prompt engineering, no regexes
  over free text.
- **Policy lives in code, not in the prompt.** Weights, thresholds, and hard rules are plain
  TypeScript in `src/lib/judge/policy.ts`, reviewable and unit-tested like any other business
  logic. The model answers questions; your code decides.
- **Cheap enough to run on every PR.** One parallel call per pull request, not a slow
  multi-step agent loop, makes it practical to run as a CI gate rather than an occasional
  audit.

## Setup

1. Install dependencies: `npm install`
2. Copy the environment template (checked in as `env.example`):
   ```bash
   cp env.example .env.local
   ```
3. Get a TypeSafe API key at [typesafe.ai](https://typesafe.ai) and set `TYPESAFE_API_KEY` in
   `.env.local` (or `.env`; both are gitignored).
4. Optionally set `GITHUB_TOKEN` (a classic or fine-grained GitHub token) to raise GitHub's
   rate limit and read private repositories you have access to.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a pull request URL, pick a profile,
and click Judge.

## CLI usage

```bash
npx tsx scripts/judge.ts <pr-url> [--profile balanced|hotfix|refactor|docs] [--json]
```

Add `--dump-request` to print the exact `{ model, state, questions }` payload the app sends to
`POST /v1/systemone` without calling the API — handy for pasting into the TypeSafe playground.
A captured example lives at `examples/nextjs-pr-1.request.json`.

`scripts/judge.ts` loads `.env.local` and then `.env` itself (no `dotenv` dependency, same
precedence as Next.js), so it works the same way whether you run it standalone or through the
web app.

## Evaluation

`scripts/evaluate.ts` and `scripts/report.ts` measure how PR Judge behaves on real, historical
pull requests from a public repository, against two independent reference labels: **merge
outcome** (merged vs. closed-unmerged — a noisy proxy for quality) and **deterministic,
regex-based proxies** (`src/lib/eval/proxies.ts`) computed from the diff itself, independent of
merge outcome, for the Noul flags a pattern can approximate. Results for this repository, once a
run has completed, are published in [`evaluation/REPORT.md`](./evaluation/REPORT.md); see
[`evaluation/README.md`](./evaluation/README.md) for how to reproduce it and what it costs.

Merge outcome is noisy (it skews toward maintainers) and the proxies are regexes with their own
false positives and negatives — both caveats, and more, are spelled out in the report itself.

## How the questions are designed

The heart of this demo is `src/lib/judge/questions.ts`: four **scores** (concrete, ordered
rubrics), six **nouls** (yes/no red flags with explicit true/false criteria), and one **choice**
(the model's own verdict). Each instruction is self-contained — question IDs are never sent to
the model, and questions can't see each other's answers, so nothing beyond the bounded state and
that one instruction string informs an answer. See the primitive docs this design follows:

- [`score`](https://docs.typesafe.ai/primitives/score.md)
- [`noul`](https://docs.typesafe.ai/primitives/noul.md)
- [`choice`](https://docs.typesafe.ai/primitives/choice.md)
- [Composite scoring pattern](https://docs.typesafe.ai/patterns/composite-scoring.md)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md)

## Adding a profile

Profiles live in `PROFILE_WEIGHTS` in `src/lib/judge/policy.ts`, as weights over four
normalized dimensions (`scope`, `tests`, `safety`, `description`) that must sum to 1 — a unit
test in `policy.test.ts` checks this for every profile. Add an entry there and to
`PROFILE_LABELS`, then add the profile's id to `PROFILES` in `src/lib/judge/types.ts`. No change
to the questions or the API route is needed: profiles only affect how the same answers are
weighted, which is why switching profiles in the UI recomputes instantly with no re-inference.

## Honest caveats

- **Typed output guarantees the interface, not the truth.** A `score` of 3/3 for test evidence
  means the model committed to that rubric level with some confidence — it does not mean the
  tests are actually good. Treat every answer as a strong, cheap signal, not ground truth.
- **Thresholds are starting points.** The hard-rule cutoffs (e.g. `possible_secret >= 0.7`) and
  the `approve` / `human_review` / `send_back` composite bands were picked to be reasonable
  defaults, not calibrated against your team's pull requests. Watch the flags on real PRs and
  adjust `policy.ts` accordingly.
- **State is truncated for large diffs.** Per-file patches are capped and the total patch budget
  is bounded (see `src/lib/judge/state.ts`); on large pull requests the model is judging a
  partial diff, and the UI's "State sent to model" panel tells you what was cut.
