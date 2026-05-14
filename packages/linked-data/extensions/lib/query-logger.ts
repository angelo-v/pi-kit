/**
 * Query logger for SPARQL tools.
 *
 * Writes one log file per query execution to:
 *   <cwd>/.agents/logs/<toolName>/<timestamp>.log
 *
 * Each log contains:
 *   - tool name and timestamp
 *   - the input sources (file paths or endpoint URL)
 *   - the full SPARQL query
 *   - the query result (or error output)
 *
 * Logging failures are intentionally swallowed so they never surface
 * to the LLM or disrupt the query result.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface QueryLogEntry {
  /** The registered tool name (e.g. "sparql_query_files"). */
  toolName: string;
  /** Source files (as file:// URIs) or endpoint URL. */
  sources: string[];
  /** The SPARQL query that was executed (after any prefix injection). */
  query: string;
  /** The output returned to the caller (table, JSON, turtle, or error text). */
  result: string;
  /** True when the query ended in an error. */
  isError?: boolean;
  /** Working directory — used to resolve the log directory. */
  cwd: string;
}

/**
 * Builds the ISO-8601 timestamp fragment used in the log filename.
 * Colons are replaced with hyphens so the string is safe on all file systems.
 *
 * Example: "2026-05-14T10-23-45.678Z"
 */
export function makeTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/:/g, "-");
}

/**
 * Renders a human-readable log file for one query execution.
 */
export function formatLogEntry(entry: QueryLogEntry): string {
  const sourcesBlock = entry.sources.map((s) => `  ${s}`).join("\n");
  const status = entry.isError ? "ERROR" : "OK";

  return [
    `Tool:      ${entry.toolName}`,
    `Status:    ${status}`,
    ``,
    `## Sources`,
    sourcesBlock,
    ``,
    `## Query`,
    entry.query,
    ``,
    `## Result`,
    entry.result,
    ``,
  ].join("\n");
}

/**
 * Writes a single log file for the given query execution.
 * Never throws — any I/O error is silently discarded.
 */
export async function logQuery(entry: QueryLogEntry): Promise<void> {
  try {
    const logDir = join(entry.cwd, ".agents", "logs", entry.toolName);
    await mkdir(logDir, { recursive: true });

    const filename = `${makeTimestamp()}.log`;
    const logPath = join(logDir, filename);
    const content = formatLogEntry(entry);

    await writeFile(logPath, content, "utf8");
  } catch {
    // Intentionally silent — logging must never affect query results.
  }
}
