/**
 * Shared regex for recognizing a test file by its path or name.
 *
 * Used by both `src/lib/eval/proxies.ts` (deterministic evaluation proxies) and
 * `src/lib/judge/code-facts.ts` (deterministic code facts handed to the model as state), so the
 * two stay in lockstep on what counts as a test file.
 */
export const TEST_FILE_PATTERN = /(\.|_)(test|spec)\.[jt]sx?$|__tests__\/|(^|\/)tests?\//;
