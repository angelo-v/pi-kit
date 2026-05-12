/**
 * Ensures a SPARQL SELECT or ASK query has a LIMIT clause.
 *
 * If the query already contains a LIMIT it is left untouched.
 * CONSTRUCT and DESCRIBE queries are returned unchanged — they produce
 * graph output where a missing LIMIT is rarely a token-budget problem,
 * and appending LIMIT produces invalid syntax for some forms.
 */

export const DEFAULT_LIMIT = 500;

/** Matches an existing LIMIT clause (case-insensitive). */
const LIMIT_RE = /\bLIMIT\s+\d+/i;

/** Matches the start of a CONSTRUCT or DESCRIBE query (case-insensitive). */
const GRAPH_QUERY_RE = /^\s*(CONSTRUCT|DESCRIBE)\b/i;

/**
 * Returns the query unchanged if it already has a LIMIT or is a
 * CONSTRUCT/DESCRIBE. Otherwise appends `LIMIT <limit>`.
 */
export function ensureLimit(query: string, limit: number = DEFAULT_LIMIT): string {
  if (GRAPH_QUERY_RE.test(query)) return query;
  if (LIMIT_RE.test(query)) return query;
  return `${query.trimEnd()}\nLIMIT ${limit}`;
}
