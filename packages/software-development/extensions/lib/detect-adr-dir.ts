/**
 * Scans a project root for existing ADR storage directories.
 *
 * All filesystem access is injected via `ExistsAdapter` so the function
 * can be unit-tested without touching the real filesystem.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Candidate directories checked in priority order. */
export const ADR_CANDIDATE_DIRS = [
  "docs/decisions",
  "docs/adr",
  "adr",
  ".adr",
] as const;

/** Injectable existence-check interface. */
export interface ExistsAdapter {
  existsSync(path: string): boolean;
}

/** Default adapter that delegates to `node:fs`. */
export const defaultExists: ExistsAdapter = { existsSync };

/**
 * Returns the subset of `ADR_CANDIDATE_DIRS` that exist under `cwd`.
 *
 * @param cwd      Project root to scan.
 * @param adapter  Injectable fs adapter (defaults to `node:fs`).
 */
export function detectExistingAdrDirs(
  cwd: string,
  adapter: ExistsAdapter = defaultExists
): string[] {
  return ADR_CANDIDATE_DIRS.filter((d) => adapter.existsSync(resolve(cwd, d)));
}
