# Compare Jev and OpenAI routing judgments

A standalone Python 3.9+ standard-library example. Both providers classify the
same seven synthetic requests into `fast`, `balanced`, or `deep`, plus
`needs_clarification`. They do not execute the routed task.

## Start offline

From the repository root:

```sh
python3 examples/aida_routing/compare.py --help
python3 examples/aida_routing/compare.py
python3 -m unittest discover -s examples/aida_routing -p 'test_*.py' -v
```

The default prints cases and **provisional labels**, not invented model results.
It reads no provider environment configuration, uses no keys, and makes no network calls.
No installation is required. No `.env` files are loaded, ever.

## Explicit live execution (may incur charges)

Only proceed with authorized credentials and models. Set `TYPESAFE_API_KEY` and
`OPENAI_API_KEY` in your shell using your normal secret-management process; do not
put them in this repository or command history. Choose model identifiers available
to your accounts. Neither model has an assumed latest/default value.

Replace the two model placeholders below:

```sh
python3 examples/aida_routing/compare.py --live \
  --jev-model YOUR_JEV_MODEL --openai-model YOUR_OPENAI_MODEL --repeats 2
```

Alternatively set `AIDA_JEV_MODEL` and `AIDA_OPENAI_MODEL`, then run:

```sh
python3 examples/aida_routing/compare.py --live
```

All four configuration values are checked before any request. One repeat makes
14 requests; repeats are limited to 1–10. Provider order alternates by case and
repeat. Requests are sequential, with no automatic retry. The default socket
timeout is 30 seconds (`--timeout` accepts >0 through 120); this is not a hard
total-run deadline. Redirects and ambient HTTP proxies are disabled. HTTP errors
report only status codes, never response bodies; transport errors are redacted.
An error produces a per-case record, remaining cases continue, and the CLI exits 1.
Argument/configuration errors exit 2.

Reports print to stdout. Only `--save-report` writes a report, exclusively to a
new timestamped JSON file under this example's ignored `reports/` directory:

```sh
python3 examples/aida_routing/compare.py --save-report
```

Add that flag to an authorized live command to save actual results. No report
files were generated as part of implementation verification.

## What is compared

The shared instruction and rubric constants feed both payloads. Only request and
context enter provider state; case IDs and provisional labels remain outside it.
Jev receives one Choice and one Noul in the same request. The OpenAI Responses
request uses a strict two-field JSON schema, with storage disabled. Its model must
support structured output. Jev's Noul is thresholded at **>=0.5**, an illustrative
policy rather than a calibrated production threshold. Raw probabilities and Choice
confidence are retained after validation.

Rows contain request model, result or safe error, wall-clock milliseconds (HTTP
and parsing), and returned numeric top-level token usage when available. Missing
usage remains null; nested usage details are not collected. Summaries report
success/error counts, joint two-field agreement with provisional labels, paired
provider disagreements, and median **successful-request** latency. Failed calls
retain their individual latency but do not enter that median. No cost is estimated.

Seven cases cover invoice extraction, short idempotency explanation, ordinary
onboarding comparison, distributed duplicate-payment diagnosis, missing referents,
context-rich migration choice, and an attempted router instruction injection.
Agreement with seven hand-authored expectations is **not quality proof**. This is
not a representative benchmark; repeated cases, caching, network conditions,
provider-specific prompt serialization, model changes, and the Noul threshold
confound comparisons. Typed output is not guaranteed correctness. Live behavior,
model availability, and performance remain unverified until an authorized run.

## Contract evidence and limits

Checked on 2026-09-16:

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
  supplied the Responses `text.format` strict schema shape and refusal handling.
- [TypeSafe Noul](https://docs.typesafe.ai/primitives/noul) loaded successfully and
  documents a probability of yes, not a separate confidence score.
- [TypeSafe HTTP API](https://docs.typesafe.ai/api) and
  [Choice](https://docs.typesafe.ai/primitives/choice) page/Markdown fetches failed;
  a public curl request also failed DNS resolution. Their current public contract
  could not be independently verified.
- Fallback evidence: installed `@typesafe-ai/sdk` **0.6.0**, specifically
  `node_modules/@typesafe-ai/sdk/dist/index.mjs` and `index.d.mts`, establishes
  `POST https://api.typesafe.ai/v1/systemone`, Bearer authentication, question
  shapes, `answers`, Choice probabilities/confidence, and Noul values.
  Nearby `src/lib/judge/judge.ts` and `questions.ts` confirm same-request named
  questions. These existing files were read, not modified.

No credentials or `.env` contents were inspected; no paid API was called. Offline
mock tests establish client behavior, not compatibility with a live service.
Rollback is removal of this new example directory only; it has no app integration.
