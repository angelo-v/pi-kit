/**
 * Output-format helpers for the Comunica CLI.
 *
 * Maps the user-facing format names to the MIME types expected by
 * `comunica-sparql-file -t <mime>`, and builds the full argument list
 * for a single query invocation.
 */

/** Supported output format identifiers. */
export type OutputFormat = "table" | "json" | "csv" | "turtle";

/** Maps each format name to the MIME type accepted by `comunica-sparql-file -t`. */
export const MIME: Readonly<Record<OutputFormat, string>> = {
  table:  "table",
  json:   "application/sparql-results+json",
  csv:    "text/csv",
  turtle: "text/turtle",
};

/**
 * Builds the argument list for a `comunica-sparql-file` invocation.
 *
 * @param sources  `file://` URIs of the source files (positional args).
 * @param query    The SPARQL query string.
 * @param format   The desired output format (defaults to `"table"`).
 * @returns        The complete argv array to pass to `execFile`.
 */
export function buildArgs(
  sources: string[],
  query: string,
  format: OutputFormat = "table"
): string[] {
  const mimeType = MIME[format] ?? MIME.table;
  return [...sources, "-q", query, "-t", mimeType];
}
