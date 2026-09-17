"use client";

import { useMemo, useState, type FormEvent } from "react";

import type { CodeFacts } from "@/lib/judge/code-facts";
import {
  decide,
  DIMENSION_IDS,
  DIMENSION_LABELS,
  NOUL_LABELS,
  type JudgeAnswers,
  type ReviewEffortLabel,
} from "@/lib/judge/policy";
import type { Profile } from "@/lib/judge/types";

import { DimensionRow } from "./DimensionRow";
import { FlagsList } from "./FlagsList";
import { ProfileSelect } from "./ProfileSelect";
import { RawDetails } from "./RawDetails";
import { VerdictCard } from "./VerdictCard";

const REVIEW_EFFORT_TITLES: Record<ReviewEffortLabel, string> = {
  skim: "Skim",
  focused: "Focused read",
  deep: "Deep review",
  "hands-on": "Hands-on",
};

interface JudgeApiResponse {
  pr: {
    owner: string;
    repo: string;
    number: number;
    title: string;
    author: string;
    url: string;
    stats: { additions: number; deletions: number; changed_files: number };
  };
  state_summary: {
    files_with_patch: number;
    files_omitted: number;
    truncated: number;
    notes: string[];
  };
  code_facts: CodeFacts;
  answers: JudgeAnswers;
  usage?: { input_tokens: number; output_tokens: number };
  model: string;
}

/** Owns the fetch and the profile selection; everything below it is presentational.
 *
 * Policy is recomputed with `decide()` purely on the client whenever the profile changes,
 * against the same answers from the one API call — no extra inference round trip.
 */
export function JudgeContainer() {
  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState<Profile>("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<JudgeApiResponse | null>(null);

  const policy = useMemo(
    () => (data ? decide(data.answers, profile, data.code_facts) : null),
    [data, profile],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? `Request failed with status ${response.status}`);
      }
      setData(json as JudgeApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="url"
          required
          placeholder="https://github.com/owner/repo/pull/123"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <ProfileSelect value={profile} onChange={setProfile} />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "Judging…" : "Judge"}
        </button>
      </form>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {data && policy && (
        <div className="space-y-8">
          <div>
            <a
              href={data.pr.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
            >
              {data.pr.owner}/{data.pr.repo}#{data.pr.number}: {data.pr.title}
            </a>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              by {data.pr.author} · +{data.pr.stats.additions} -{data.pr.stats.deletions} across{" "}
              {data.pr.stats.changed_files} file(s)
            </p>
          </div>

          <VerdictCard decision={policy.decision} modelVerdict={policy.modelVerdict} />

          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Estimated review effort
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {REVIEW_EFFORT_TITLES[policy.reviewEffort.label]}
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">{policy.reviewEffort.dominantLegend}</p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Composite score: {Math.round(policy.composite * 100)}%
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  No re-inference: weights are code. Switching profiles rescores the same answers.
                </p>
              </div>
              <ProfileSelect value={profile} onChange={setProfile} />
            </div>
            <div className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {DIMENSION_IDS.map((id) => (
                <DimensionRow key={id} label={DIMENSION_LABELS[id]} dimension={policy.dimensions[id]} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">Flags</p>
            <FlagsList flags={policy.flags} labels={NOUL_LABELS} hardRuleHits={policy.hardRuleHits} />
          </div>

          <div className="space-y-2">
            <RawDetails summary="State sent to model">
              <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                <li>Files with patch: {data.state_summary.files_with_patch}</li>
                <li>Files omitted: {data.state_summary.files_omitted}</li>
                <li>Files truncated: {data.state_summary.truncated}</li>
                {data.state_summary.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
                <li>Code facts — test files removed: {data.code_facts.test_files_removed.length}</li>
                <li>Code facts — test cases removed: {data.code_facts.test_cases_removed}</li>
                <li>Code facts — test cases disabled: {data.code_facts.test_cases_disabled}</li>
                <li>Code facts — migration files touched: {data.code_facts.migration_files_touched.length}</li>
                <li>Code facts — auth paths touched: {data.code_facts.auth_paths_touched.length}</li>
              </ul>
            </RawDetails>
            <RawDetails summary="Raw answers">
              <pre className="max-h-96 overflow-auto text-xs text-zinc-600 dark:text-zinc-400">
                {JSON.stringify(data.answers, null, 2)}
              </pre>
            </RawDetails>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Model: {data.model}
            {data.usage && (
              <>
                {" "}
                · {data.usage.input_tokens} input / {data.usage.output_tokens} output tokens
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
