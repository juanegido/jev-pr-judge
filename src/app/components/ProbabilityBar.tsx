interface ProbabilityBarProps {
  label: string;
  value: number;
  /** Tailwind color classes for the filled portion, e.g. "bg-emerald-500". */
  colorClassName?: string;
}

/** A single labeled 0..1 probability rendered as a thin horizontal bar. */
export function ProbabilityBar({ label, value, colorClassName = "bg-zinc-500 dark:bg-zinc-400" }: ProbabilityBarProps) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 truncate text-zinc-600 dark:text-zinc-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${colorClassName}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums text-zinc-500 dark:text-zinc-500">{percent}%</span>
    </div>
  );
}
