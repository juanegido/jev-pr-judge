/** Thrown when `TYPESAFE_API_KEY` is missing before a TypeSafe client is ever constructed.
 *
 * We check for the key ourselves, ahead of the SDK, so every caller (the API route and the
 * CLI script) gets one exact, predictable message instead of parsing the SDK's own error text.
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super("TYPESAFE_API_KEY is not configured");
    this.name = "MissingApiKeyError";
  }
}
