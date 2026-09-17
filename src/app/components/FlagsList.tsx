import type { Flag, FlagLevel } from "@/lib/judge/types";

const LEVEL_STYLES: Record<FlagLevel, string> = {
  block: "border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
  warn: "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
  info: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
};

const LEVEL_BAR_STYLES: Record<FlagLevel, string> = {
  block: "bg-red-500",
  warn: "bg-amber-500",
  info: "bg-zinc-400 dark:bg-zinc-600",
};

interface FlagsListProps {
  flags: Flag[];
  labels: Record<string, string>;
  hardRuleHits: string[];
}

export function FlagsList({ flags, labels, hardRuleHits }: FlagsListProps) {
  return (
    <div className="space-y-2">
      {flags.map((flag) => {
        const isHardRuleHit = hardRuleHits.includes(flag.id);
        const percent = Math.round(flag.probability * 100);
        return (
          <div
            key={flag.id}
            className={`rounded-lg border px-3 py-2 ${LEVEL_STYLES[flag.level]} ${
              isHardRuleHit ? "ring-2 ring-red-500/60" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {labels[flag.id] ?? flag.id}
                {isHardRuleHit && (
                  <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Hard rule
                  </span>
                )}
              </span>
              <span className="tabular-nums text-zinc-500 dark:text-zinc-500">{percent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className={`h-full rounded-full ${LEVEL_BAR_STYLES[flag.level]}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
