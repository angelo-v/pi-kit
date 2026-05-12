/**
 * Resolves a list of file paths (relative or absolute) to `file://` URIs
 * suitable for passing to the Comunica CLI, while also collecting any paths
 * that do not exist on disk.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface ResolvedSources {
  /** `file://` URIs for files that were found. */
  sources: string[];
  /** Absolute paths of files that could not be found. */
  missing: string[];
}

/**
 * For each entry in `files`:
 *   - resolves it relative to `cwd`
 *   - checks that it exists
 *   - converts to a `file://` URI
 *
 * Files that do not exist are collected in `missing` instead.
 */
export function resolveSources(files: string[], cwd: string): ResolvedSources {
  const sources: string[] = [];
  const missing: string[] = [];

  for (const f of files) {
    const abs = resolve(cwd, f);
    if (!existsSync(abs)) {
      missing.push(abs);
    } else {
      sources.push(`file://${abs}`);
    }
  }

  return { sources, missing };
}
