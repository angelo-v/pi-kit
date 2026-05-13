/**
 * Ensures a SPARQL SELECT or ASK query has a LIMIT clause.
 *
 * If the query already contains a LIMIT it is left untouched.
 * CONSTRUCT and DESCRIBE queries are returned unchanged — they produce
 * graph output where a missing LIMIT is rarely a token-budget problem,
 * and appending LIMIT produces invalid syntax for some forms.
 */

export const DEFAULT_LIMIT = 500;

/** Matches the start of a CONSTRUCT or DESCRIBE query (case-insensitive). */
const GRAPH_QUERY_RE = /^\s*(CONSTRUCT|DESCRIBE)\b/i;

/**
 * Strips single-line comments (`# …`) and quoted string literals
 * (`"…"` / `'…'`) from a SPARQL query so that a LIMIT keyword that appears
 * only inside a comment or literal is not mistaken for a real LIMIT clause.
 *
 * This is intentionally conservative: it does not attempt to parse SPARQL
 * fully. Its only job is to remove the textual regions where a false-positive
 * LIMIT match is most likely.
 */
function stripCommentsAndLiterals(query: string): string {
  return query
    // Remove # comments (everything from # to end of line).
    .replace(/#[^\n]*/g, "")
    // Remove double-quoted string literals (non-greedy, no backslash support needed
    // for this purpose — we only care about removing the token).
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
    // Remove single-quoted string literals.
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''");
}

/**
 * Returns the query unchanged if it already has a LIMIT or is a
 * CONSTRUCT/DESCRIBE. Otherwise appends `LIMIT <limit>`.
 *
 * The LIMIT detection ignores occurrences inside string literals and
 * single-line comments to prevent false positives from corrupting the
 * safety cap.
 */
export function ensureLimit(query: string, limit: number = DEFAULT_LIMIT): string {
  if (GRAPH_QUERY_RE.test(query)) return query;
  // Check for an existing LIMIT only in the stripped (comment/literal-free) text.
  const stripped = stripCommentsAndLiterals(query);
  if (/\bLIMIT\s+\d+/i.test(stripped)) return query;
  return `${query.trimEnd()}\nLIMIT ${limit}`;
}
