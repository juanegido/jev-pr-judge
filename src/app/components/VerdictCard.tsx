import type { Decision } from "@/lib/judge/types";

import { ProbabilityBar } from "./ProbabilityBar";

const DECISION_LABELS: Record<Decision, string> = {
  approve: "Approve",
  human_review: "Human review",
  send_back: "Send back",
};

const DECISION_STYLES: Record<Decision, string> = {
  approve: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  human_review: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  send_back: "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300",
};

const MODEL_VERDICT_LABELS: Record<string, string> = {
  approve: "Approve",
  human_review: "Human review",
  send_back: "Send back",
};

interface VerdictCardProps {
  decision: Decision;
  modelVerdict: { choice: string; confidence: number; probabilities: Record<string, number> };
}

/** The policy decision (big) next to the model's own verdict choice, for contrast. */
export function VerdictCard({ decision, modelVerdict }: VerdictCardProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Policy decision
        </p>
        <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-lg font-semibold ${DECISION_STYLES[decision]}`}>
          {DECISION_LABELS[decision]}
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">Computed in code from the answers below.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          Model verdict
        </p>
        <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {MODEL_VERDICT_LABELS[modelVerdict.choice] ?? modelVerdict.choice}
          <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-500">
            {Math.round(modelVerdict.confidence * 100)}% confidence
          </span>
        </p>
        <div className="mt-3 space-y-1.5">
          {Object.entries(modelVerdict.probabilities).map(([label, value]) => (
            <ProbabilityBar key={label} label={MODEL_VERDICT_LABELS[label] ?? label} value={value} />
          ))}
        </div>
      </div>
    </div>
  );
}
