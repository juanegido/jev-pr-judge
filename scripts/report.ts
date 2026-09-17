#!/usr/bin/env npx tsx
/**
 * Turn `evaluation/results.jsonl` (written by `scripts/evaluate.ts`) into a Markdown report.
 *
 * Usage: npx tsx scripts/report.ts [--in evaluation/results.jsonl] [--out evaluation/REPORT.md]
 *
 * Pure aggregation: no network calls, no TypeSafe spend. Every section that needs model answers
 * degrades to a plain "no model answers in sample" note instead of throwing when the input rows
 * were produced with `--dry-run` (or every judgment errored).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { DIMENSION_IDS, DIMENSION_LABELS, NOUL_LABELS, type NoulId } from "../src/lib/judge/policy";
import type { EvalRow } from "./evaluate";

function parseArgs(argv: string[]): { in: string; out: string } {
  let inPath = "evaluation/results.jsonl";
  let outPath = "evaluation/REPORT.md";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") inPath = argv[++i];
    else if (argv[i] === "--out") outPath = argv[++i];
  }
  return { in: inPath, out: outPath };
}

function readRows(path: string): EvalRow[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as EvalRow);
}

// ---------------------------------------------------------------------------
// Small stats helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function fmt(n: number, decimals = 2): string {
  return Number.isFinite(n) ? n.toFixed(decimals) : "N/A";
}

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(2)}%` : "N/A";
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function isMaintainer(row: EvalRow): boolean {
  return MAINTAINER_ASSOCIATIONS.has(row.author_association);
}

/** Rows that carry real model output (excludes dry-run rows and rows that errored). */
function withModelAnswers(rows: EvalRow[]): EvalRow[] {
  return rows.filter((r) => !r.error && r.decision_balanced !== undefined && r.scores !== undefined);
}

function parseRepo(rows: EvalRow[]): string {
  const first = rows[0];
  if (!first) return "(no rows)";
  const match = /github\.com\/([^/]+)\/([^/]+)\/pull\//.exec(first.url);
  return match ? `${match[1]}/${match[2]}` : "(unknown)";
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function sectionSample(rows: EvalRow[]): string {
  const lines: string[] = ["## 1. Sample", ""];

  if (rows.length === 0) {
    lines.push("_No rows in input._");
    return lines.join("\n");
  }

  const repo = parseRepo(rows);
  const merged = rows.filter((r) => r.outcome === "merged").length;
  const unmerged = rows.filter((r) => r.outcome === "unmerged").length;

  lines.push(`- **Repository:** ${repo}`);
  lines.push(`- **N (pull requests):** ${rows.length}`);
  lines.push(`- **Merged:** ${merged} (${pct(merged, rows.length)})`);
  lines.push(`- **Unmerged:** ${unmerged} (${pct(unmerged, rows.length)})`);

  const dates = rows.flatMap((r) => [r.created_at, r.closed_at].filter((d): d is string => !!d));
  if (dates.length > 0) {
    const sorted = [...dates].sort();
    lines.push(`- **Date range:** ${sorted[0]} to ${sorted[sorted.length - 1]}`);
  }

  lines.push("", "**By author association**", "", "| Association | Count | % |", "| --- | --- | --- |");
  const byAssociation = countBy(rows, (r) => r.author_association);
  for (const [association, count] of [...byAssociation.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${association} | ${count} | ${pct(count, rows.length)} |`);
  }

  const withUsage = rows.filter((r) => r.usage);
  const totalInputTokens = withUsage.reduce((sum, r) => sum + (r.usage?.input_tokens ?? 0), 0);
  const totalOutputTokens = withUsage.reduce((sum, r) => sum + (r.usage?.output_tokens ?? 0), 0);
  const latencies = rows.filter((r) => r.latency_ms !== undefined).map((r) => r.latency_ms as number);
  const withPatch = rows.reduce((sum, r) => sum + r.state_summary.files_with_patch, 0);
  const truncated = rows.reduce((sum, r) => sum + r.state_summary.files_truncated, 0);
  const omitted = rows.reduce((sum, r) => sum + r.state_summary.files_omitted, 0);
  const errors = rows.filter((r) => r.error).length;

  lines.push(
    "",
    "**Model calls, tokens, and state truncation**",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Rows with model output | ${withUsage.length} / ${rows.length} |`,
    `| Rows with an error | ${errors} |`,
    `| Total tokens (input + output) | ${withUsage.length > 0 ? totalInputTokens + totalOutputTokens : "N/A"} |`,
    `| Mean latency (ms) | ${latencies.length > 0 ? fmt(mean(latencies), 0) : "N/A"} |`,
    `| Median latency (ms) | ${latencies.length > 0 ? fmt(median(latencies), 0) : "N/A"} |`,
    `| Files with a patch sent to the model | ${withPatch} |`,
    `| Files truncated (per-file cap) | ${truncated} |`,
    `| Files omitted (lockfile or budget) | ${omitted} |`,
  );

  return lines.join("\n");
}

function contingencyTable(
  rows: EvalRow[],
  rowKeyFn: (r: EvalRow) => string,
  rowLabels: string[],
): string {
  const columns = ["merged", "unmerged"] as const;
  const lines = [
    `| Decision \\ Outcome | ${columns.map((c) => c[0].toUpperCase() + c.slice(1)).join(" | ")} | Total |`,
    `| --- | ${columns.map(() => "---").join(" | ")} | --- |`,
  ];

  for (const label of rowLabels) {
    const matching = rows.filter((r) => rowKeyFn(r) === label);
    const total = matching.length;
    const cells = columns.map((outcome) => {
      const n = matching.filter((r) => r.outcome === outcome).length;
      return `${n} (${pct(n, total)})`;
    });
    lines.push(`| ${label} | ${cells.join(" | ")} | ${total} |`);
  }
  return lines.join("\n");
}

function sectionDecisionAndVerdictVsOutcome(rows: EvalRow[]): string {
  const lines: string[] = ["## 2. Policy decision × outcome, and model verdict × outcome", ""];
  const modelRows = withModelAnswers(rows);

  if (modelRows.length === 0) {
    lines.push("_No model answers in sample._");
    return lines.join("\n");
  }

  lines.push(
    "**Policy decision (balanced profile) × outcome** — row percentages show the share of each decision that ended up merged vs. unmerged.",
    "",
    contingencyTable(modelRows, (r) => r.decision_balanced ?? "unknown", ["approve", "human_review", "send_back"]),
    "",
    "**Model verdict × outcome**",
    "",
    contingencyTable(modelRows, (r) => r.model_verdict ?? "unknown", ["approve", "human_review", "send_back"]),
  );
  return lines.join("\n");
}

function sectionScoresByOutcome(rows: EvalRow[], title: string, level = 3): string {
  const heading = "#".repeat(level);
  const lines: string[] = [`${heading} ${title}`, ""];
  const modelRows = withModelAnswers(rows);

  if (modelRows.length === 0) {
    lines.push("_No model answers in sample._");
    return lines.join("\n");
  }

  lines.push(
    "| Dimension | Outcome | N | Mean | SD | Mean confidence |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const id of DIMENSION_IDS) {
    for (const outcome of ["merged", "unmerged"] as const) {
      const group = modelRows.filter((r) => r.outcome === outcome);
      const values = group.map((r) => r.scores?.[id]?.score).filter((v): v is number => v !== undefined);
      const confidences = group
        .map((r) => r.scores?.[id]?.confidence)
        .filter((v): v is number => v !== undefined);
      lines.push(
        `| ${DIMENSION_LABELS[id]} | ${outcome} | ${values.length} | ${fmt(mean(values))} | ${fmt(stddev(values))} | ${fmt(mean(confidences))} |`,
      );
    }
  }
  return lines.join("\n");
}

function sectionMaintainerConfound(rows: EvalRow[]): string {
  const lines: string[] = ["## 4. The maintainer confound", ""];
  const modelRows = withModelAnswers(rows);

  if (modelRows.length === 0) {
    lines.push("_No model answers in sample._");
    return lines.join("\n");
  }

  const maintainerRows = modelRows.filter(isMaintainer);
  const nonMaintainerRows = modelRows.filter((r) => !isMaintainer(r));
  const maintainerMergeRate = pct(maintainerRows.filter((r) => r.outcome === "merged").length, maintainerRows.length);
  const nonMaintainerMergeRate = pct(
    nonMaintainerRows.filter((r) => r.outcome === "merged").length,
    nonMaintainerRows.length,
  );

  lines.push(
    `Merged pull requests skew toward maintainers: maintainers (OWNER/MEMBER/COLLABORATOR) merge at ` +
      `${maintainerMergeRate} (n=${maintainerRows.length}) versus ${nonMaintainerMergeRate} ` +
      `(n=${nonMaintainerRows.length}) for everyone else. Any decision × outcome or score × outcome table ` +
      `computed over the whole sample therefore partly measures *who opened the PR*, not just *how good it is*. ` +
      `The tables below split scores by maintainer status and restrict the decision × outcome table to ` +
      `non-maintainers only, to see how much of the effect survives.`,
    "",
    sectionScoresByOutcomeByGroup(maintainerRows, nonMaintainerRows),
    "",
    "### Policy decision × outcome, non-maintainers only",
    "",
  );

  if (nonMaintainerRows.length === 0) {
    lines.push("_No non-maintainer rows with model answers in sample._");
  } else {
    lines.push(
      contingencyTable(nonMaintainerRows, (r) => r.decision_balanced ?? "unknown", [
        "approve",
        "human_review",
        "send_back",
      ]),
    );
  }

  return lines.join("\n");
}

function sectionScoresByOutcomeByGroup(maintainerRows: EvalRow[], nonMaintainerRows: EvalRow[]): string {
  const lines: string[] = [
    "### Score dimensions by outcome, split by maintainer status",
    "",
    "| Dimension | Group | Outcome | N | Mean | SD |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const groups: Array<[string, EvalRow[]]> = [
    ["Maintainer", maintainerRows],
    ["Non-maintainer", nonMaintainerRows],
  ];
  for (const id of DIMENSION_IDS) {
    for (const [groupLabel, groupRows] of groups) {
      for (const outcome of ["merged", "unmerged"] as const) {
        const group = groupRows.filter((r) => r.outcome === outcome);
        const values = group.map((r) => r.scores?.[id]?.score).filter((v): v is number => v !== undefined);
        lines.push(
          `| ${DIMENSION_LABELS[id]} | ${groupLabel} | ${outcome} | ${values.length} | ${fmt(mean(values))} | ${fmt(stddev(values))} |`,
        );
      }
    }
  }
  return lines.join("\n");
}

interface ProxyMapping {
  noulId: NoulId;
  proxyKey: keyof NonNullable<EvalRow["proxies"]>;
}

const NOUL_PROXY_MAPPINGS: ProxyMapping[] = [
  { noulId: "claims_tests_without_evidence", proxyKey: "claims_tests_without_evidence_proxy" },
  { noulId: "leftover_debug", proxyKey: "leftover_debug_proxy" },
  { noulId: "possible_secret", proxyKey: "possible_secret_proxy" },
  { noulId: "unmentioned_debt", proxyKey: "unmentioned_debt_proxy" },
];

function precisionRecallF1(
  values: Array<{ noul: number; proxyPositive: boolean }>,
  threshold: number,
): { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number; tn: number } {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const { noul, proxyPositive } of values) {
    const predictedPositive = noul >= threshold;
    if (predictedPositive && proxyPositive) tp++;
    else if (predictedPositive && !proxyPositive) fp++;
    else if (!predictedPositive && proxyPositive) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : NaN;
  const recall = tp + fn > 0 ? tp / (tp + fn) : NaN;
  const f1 = precision + recall > 0 && Number.isFinite(precision) && Number.isFinite(recall)
    ? (2 * precision * recall) / (precision + recall)
    : NaN;
  return { precision, recall, f1, tp, fp, fn, tn };
}

function sectionNoulsVsProxies(rows: EvalRow[]): string {
  const lines: string[] = ["## 5. Noul flags vs. deterministic proxies", ""];
  const modelRows = withModelAnswers(rows);

  if (modelRows.length === 0) {
    lines.push("_No model answers in sample._");
    return lines.join("\n");
  }

  lines.push(
    "Proxies are computed from the FULL, untruncated diff (see `src/lib/eval/proxies.ts`), while the model " +
      "only ever sees the bounded state described in section 1 — on large pull requests the model may be " +
      "judging a partial diff that the proxy can see past. Treat this as a calibration-style sanity check, " +
      "not ground truth: proxies are regexes with their own false positives and negatives.",
    "",
  );

  for (const { noulId, proxyKey } of NOUL_PROXY_MAPPINGS) {
    const values = modelRows
      .map((r) => ({ noul: r.nouls?.[noulId], proxyPositive: r.proxies?.[proxyKey] as boolean | undefined }))
      .filter((v): v is { noul: number; proxyPositive: boolean } => v.noul !== undefined && v.proxyPositive !== undefined);

    lines.push(`### ${NOUL_LABELS[noulId]}`, "");

    if (values.length === 0) {
      lines.push("_No data._", "");
      continue;
    }

    const proxyTrue = values.filter((v) => v.proxyPositive);
    const proxyFalse = values.filter((v) => !v.proxyPositive);

    lines.push(
      "| Proxy | N | Mean noul probability |",
      "| --- | --- | --- |",
      `| True | ${proxyTrue.length} | ${fmt(mean(proxyTrue.map((v) => v.noul)))} |`,
      `| False | ${proxyFalse.length} | ${fmt(mean(proxyFalse.map((v) => v.noul)))} |`,
      "",
      "| Threshold | Precision | Recall | F1 | TP | FP | FN | TN |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const threshold of [0.5, 0.7]) {
      const m = precisionRecallF1(values, threshold);
      lines.push(
        `| ${threshold} | ${fmt(m.precision)} | ${fmt(m.recall)} | ${fmt(m.f1)} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.tn} |`,
      );
    }

    lines.push("", "| Noul probability bin | N | Proxy-positive rate |", "| --- | --- | --- |");
    const binEdges = [0, 0.2, 0.4, 0.6, 0.8, 1.01];
    for (let i = 0; i < binEdges.length - 1; i++) {
      const lo = binEdges[i];
      const hi = binEdges[i + 1];
      const inBin = values.filter((v) => v.noul >= lo && v.noul < hi);
      const positiveRate = inBin.length > 0 ? mean(inBin.map((v) => (v.proxyPositive ? 1 : 0))) : NaN;
      const label = `${lo.toFixed(1)}–${Math.min(hi, 1).toFixed(1)}`;
      lines.push(`| ${label} | ${inBin.length} | ${fmt(positiveRate)} |`);
    }
    lines.push("");
  }

  // blast_radius vs touches_shared_infra_proxy
  const blastValues = modelRows
    .map((r) => ({
      normalized: r.scores?.blast_radius ? r.scores.blast_radius.score / 3 : undefined,
      infra: r.proxies?.touches_shared_infra_proxy,
    }))
    .filter((v): v is { normalized: number; infra: boolean } => v.normalized !== undefined && v.infra !== undefined);

  lines.push("### Blast radius vs. touches shared infrastructure", "");
  if (blastValues.length === 0) {
    lines.push("_No data._");
  } else {
    const infraTrue = blastValues.filter((v) => v.infra);
    const infraFalse = blastValues.filter((v) => !v.infra);
    lines.push(
      "| touches_shared_infra_proxy | N | Mean normalized blast_radius |",
      "| --- | --- | --- |",
      `| True | ${infraTrue.length} | ${fmt(mean(infraTrue.map((v) => v.normalized)))} |`,
      `| False | ${infraFalse.length} | ${fmt(mean(infraFalse.map((v) => v.normalized)))} |`,
    );
  }

  return lines.join("\n");
}

function sectionNotableCases(rows: EvalRow[]): string {
  const lines: string[] = ["## 6. Notable cases", ""];
  const modelRows = withModelAnswers(rows);

  if (modelRows.length === 0) {
    lines.push("_No model answers in sample._");
    return lines.join("\n");
  }

  function topBy(noulId: NoulId, n: number): EvalRow[] {
    return [...modelRows]
      .filter((r) => r.nouls?.[noulId] !== undefined)
      .sort((a, b) => (b.nouls?.[noulId] ?? 0) - (a.nouls?.[noulId] ?? 0))
      .slice(0, n);
  }

  lines.push(
    "**Top 5 by `claims_tests_without_evidence`**",
    "",
    "| # | Title | Probability | Outcome | Decision (balanced) |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const r of topBy("claims_tests_without_evidence", 5)) {
    lines.push(
      `| [${r.number}](${r.url}) | ${r.title} | ${fmt(r.nouls?.claims_tests_without_evidence ?? NaN)} | ${r.outcome} | ${r.decision_balanced} |`,
    );
  }

  lines.push(
    "",
    "**Top 5 by `out_of_scope_changes`**",
    "",
    "| # | Title | Probability | Outcome | Decision (balanced) |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const r of topBy("out_of_scope_changes", 5)) {
    lines.push(
      `| [${r.number}](${r.url}) | ${r.title} | ${fmt(r.nouls?.out_of_scope_changes ?? NaN)} | ${r.outcome} | ${r.decision_balanced} |`,
    );
  }

  const mergedWithComposite = modelRows.filter((r) => r.outcome === "merged" && r.composite_balanced !== undefined);
  const lowestComposite = [...mergedWithComposite]
    .sort((a, b) => (a.composite_balanced ?? 0) - (b.composite_balanced ?? 0))
    .slice(0, 5);

  lines.push(
    "",
    "**5 merged pull requests with the lowest composite score (balanced profile)**",
    "",
    "| # | Title | Composite | Decision (balanced) |",
    "| --- | --- | --- | --- |",
  );
  for (const r of lowestComposite) {
    lines.push(`| [${r.number}](${r.url}) | ${r.title} | ${fmt(r.composite_balanced ?? NaN)} | ${r.decision_balanced} |`);
  }

  return lines.join("\n");
}

function sectionCaveats(): string {
  return [
    "## 7. Honest caveats",
    "",
    "- **Merge outcome is a noisy label.** A pull request can be closed unmerged for reasons that have " +
      "nothing to do with quality (stale, superseded by another PR, duplicate, out of scope for the " +
      "maintainers' current priorities) and merged despite real problems a maintainer chose to accept or " +
      "fix up afterward. Treat `outcome` as a weak signal, not ground truth.",
    "- **The maintainer confound is real.** See section 4: merged pull requests skew toward maintainers, so " +
      "any outcome-based comparison partly reflects who opened the PR rather than the PR's own qualities.",
    "- **Proxies are regexes, not ground truth.** Each deterministic proxy in `src/lib/eval/proxies.ts` is a " +
      "pattern match over paths and added lines; it has its own false positives (e.g. a TODO inside a string " +
      "literal) and false negatives (e.g. a secret formatted in a way the regex doesn't recognize).",
    "- **The model saw truncated state for large pull requests.** `src/lib/judge/state.ts` caps per-file " +
      "patches and a total patch budget; the proxies in this report see the full diff, so a mismatch between " +
      "a Noul and its proxy can reflect the model working from less information, not the model being wrong.",
    "- **Thresholds (0.5, 0.7) were not tuned on this data.** They are round numbers chosen for readability, " +
      "not calibrated cutoffs; precision/recall at other thresholds could look different.",
    "- **N is small.** This report is a sanity check on real pull requests, not a statistically powered " +
      "evaluation; treat every percentage and mean here as suggestive, not conclusive.",
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rows = readRows(options.in);

  const sections = [
    `# PR Judge Evaluation Report`,
    "",
    `Generated from \`${options.in}\` (${rows.length} row(s)).`,
    "",
    sectionSample(rows),
    "",
    sectionDecisionAndVerdictVsOutcome(rows),
    "",
    sectionScoresByOutcome(rows, "3. Score dimensions by outcome"),
    "",
    sectionMaintainerConfound(rows),
    "",
    sectionNoulsVsProxies(rows),
    "",
    sectionNotableCases(rows),
    "",
    sectionCaveats(),
    "",
  ];

  writeFileSync(options.out, sections.join("\n"));
  console.log(`Wrote report to ${options.out} (${rows.length} row(s) analyzed).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
