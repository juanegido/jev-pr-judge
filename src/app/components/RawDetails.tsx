import type { ReactNode } from "react";

interface RawDetailsProps {
  summary: string;
  children: ReactNode;
}

/** A native collapsible section for raw/debug data that shouldn't clutter the main view. */
export function RawDetails({ summary, children }: RawDetailsProps) {
  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {summary}
      </summary>
      <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">{children}</div>
    </details>
  );
}
