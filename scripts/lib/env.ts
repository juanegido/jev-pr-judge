/**
 * Load `.env.local` then `.env` into `process.env` without adding a `dotenv` dependency.
 *
 * Earlier files win (existing keys are never overwritten), which mirrors Next.js precedence.
 * Shared by `scripts/judge.ts` and `scripts/evaluate.ts` so both CLIs behave identically.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFiles(): void {
  for (const name of [".env.local", ".env"]) loadEnvFile(resolve(process.cwd(), name));
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
