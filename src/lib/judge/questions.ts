import { choice, noul, score } from "@typesafe-ai/sdk";

/**
 * The questions asked of TypeSafe System One for every judged pull request.
 *
 * Each instruction is self-contained: question IDs are never sent to the model, and questions
 * cannot see each other's answers, so every instruction re-states what it needs from the state
 * (the pull request's title, body, and file diffs) on its own.
 */
export function buildQuestions() {
  return {
    scope_adherence: score(
      "Look at the pull request's title, body, and the diffs in `files`. How well does the diff " +
        "match what the title and body describe? Judge only whether the stated intent and the " +
        "actual change line up, not whether the change is a good idea.",
      [
        "The diff does something clearly different from what the title and body describe; a reviewer " +
          "reading only the description would not predict this diff.",
        "The diff mostly matches the description, but includes noticeable pieces of unrelated or " +
          "unexplained work.",
        "The diff matches the description, with only minor loose ends a careful reviewer would want " +
          "called out.",
        "Every change in the diff is accounted for by the title and body; nothing unexplained remains.",
      ] as const,
    ),

    test_evidence: score(
      "Look at whether the diff in `files` changes runtime behavior, and whether test files were " +
        "touched to cover that change. A file counts as a test file if its path or name marks it as " +
        "one (e.g. `test`, `spec`, `__tests__`). Docs-only or config-only diffs with no behavior " +
        "change should score at the top: there is nothing to test.",
      [
        "Behavior changed in the diff, but no test files were touched at all.",
        "Test files were touched, but the changes do not exercise the behavior that actually changed.",
        "Tests were added or updated and touch the changed behavior, but coverage of the important " +
          "cases looks thin.",
        "New or updated tests directly target the changed behavior and its main edge cases, or the " +
          "diff has no behavior change (docs/config only) so there is nothing to test.",
      ] as const,
    ),

    blast_radius: score(
      "Look at the files changed in the diff. How far does this change reach into the rest of the " +
        "system if something about it is wrong?",
      [
        "The change is an isolated leaf: one module, a doc file, or test-only code that nothing else " +
          "depends on.",
        "The change touches a shared internal module or a handful of call sites, but stays inside one " +
          "part of the app.",
        "The change touches a boundary several parts of the app rely on, such as a shared library, a " +
          "widely-imported utility, or an internal API used by multiple callers.",
        "The change touches shared infrastructure: build or deploy config, CI pipelines, auth, " +
          "database schema or migrations, a public API contract, or dependency manifests.",
      ] as const,
    ),

    description_quality: score(
      "Look only at the pull request's body text (not the diff). Does it explain why the change is " +
        "needed and how it works, not just what changed?",
      [
        "The body is empty, or just restates the title in one line.",
        "The body says what changed, but not why or how.",
        "The body explains why the change is needed and roughly how it works, but skips trade-offs " +
          "or how to verify it.",
        "The body explains the motivation, the approach, any trade-offs considered, and how to " +
          "verify the change.",
      ] as const,
    ),

    claims_tests_without_evidence: noul(
      "Does the pull request body claim that tests were added, updated, or that they pass, while no " +
        "file in `files` looks like a test file (by path or name)?",
      {
        true:
          "The body mentions tests (e.g. \"added tests\", \"tests pass\", \"covered by tests\") but no " +
          "file in the diff looks like a test file.",
        false: "The body makes no claim about tests, or the diff does include changes to test files.",
      },
    ),

    out_of_scope_changes: noul(
      "Does the diff in `files` include changes that are not mentioned anywhere in the title or " +
        "body, such as drive-by refactors, reformatting of unrelated files, or renames unrelated to " +
        "the stated purpose?",
      {
        true:
          "Part of the diff has no connection to anything the title or body describes.",
        false: "Every part of the diff traces back to something the title or body describes.",
      },
    ),

    unmentioned_debt: noul(
      "Does the diff in `files` add TODO/FIXME/HACK comments, commented-out code, newly skipped or " +
        "disabled tests, or any-style escape hatches, without the body mentioning this added debt?",
      {
        true: "The diff adds one or more of these and the body says nothing about it.",
        false: "The diff adds none of these, or the body explicitly calls out the trade-off.",
      },
    ),

    leftover_debug: noul(
      "Does the diff in `files` add debug statements such as console.log, print, debugger, dbg!, or " +
        "binding.pry in non-test code?",
      {
        true: "Non-test code in the diff adds one or more debug statements.",
        false: "No debug statements were added in non-test code.",
      },
    ),

    possible_secret: noul(
      "Does the diff in `files` add anything that looks like a real credential: an API key, an " +
        "access or bearer token, a private key, or a connection string containing a password?",
      {
        true: "The diff adds text that looks like a genuine secret value.",
        false: "The diff adds no such value (placeholders and env var references do not count).",
      },
    ),

    breaking_change_unflagged: noul(
      "Does the diff in `files` change a public function signature, API contract, configuration " +
        "key, or CLI flag in a way existing callers must adapt to, without the body calling out this " +
        "as a breaking change?",
      {
        true: "The diff changes a public contract in a way that breaks callers, and the body says nothing about it.",
        false:
          "The diff makes no such breaking change, or the body explicitly flags it as a breaking change.",
      },
    ),

    verdict: choice(
      "Given the pull request's title, body, and the diffs in `files`, pick the single best verdict.",
      {
        approve:
          "The pull request does what it claims, has adequate tests for its risk level, and nothing " +
          "about it looks suspicious.",
        human_review:
          "The pull request is plausible but a human reviewer should look closer: some scope drift, " +
          "weak tests for the risk involved, or an unclear description.",
        send_back:
          "There is a clear mismatch between the diff and its description, or a red flag such as a " +
          "possible secret, an unflagged breaking change, or claimed tests that are not present.",
      },
    ),
  };
}

/** The exact question set shape, used to type the `systemOne` response. */
export type JudgeQuestions = ReturnType<typeof buildQuestions>;
