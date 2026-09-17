import type { DimensionResult } from "@/lib/judge/policy";

interface DimensionRowProps {
  label: string;
  dimension: DimensionResult;
}

/** One dimension: label, a normalized bar, the expected score, and its winning legend text. */
export function DimensionRow({ label, dimension }: DimensionRowProps) {
  const percent = Math.round(dimension.normalized * 100);
  const maxLevel = dimension.levels - 1;

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
          {dimension.raw.toFixed(1)} / {maxLevel}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300" style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">{dimension.dominantLegend}</p>

      <div className="mt-2 flex h-6 items-end gap-1">
        {Object.entries(dimension.probabilities)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([level, probability]) => (
            <div
              key={level}
              title={`Level ${level}: ${Math.round(probability * 100)}%`}
              className="flex h-full flex-1 items-end overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-900"
            >
              <div
                className="w-full rounded-sm bg-zinc-500 dark:bg-zinc-400"
                style={{ height: `${Math.max(6, probability * 100)}%` }}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
