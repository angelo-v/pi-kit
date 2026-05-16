/**
 * Path helpers for the rdf-memory-explorer extension.
 *
 * Pure-ish utilities for resolving the bundled HTML file location and the
 * default RDF memory store directory.  Both accept injected adapters so they
 * can be tested without touching the real filesystem.
 */

import { resolve, join } from "node:path";
import { homedir } from "node:os";

// ── Adapters ──────────────────────────────────────────────────────────────────

/** Subset of `node:fs` used by this module (injectable for tests). */
export interface PathsFs {
  existsSync(path: string): boolean;
}

// ── resolveHtmlPath ───────────────────────────────────────────────────────────

/**
 * Resolve the absolute path of the bundled HTML app.
 *
 * @param extensionDir - The directory that contains the extension entry-point
 *   (i.e. the resolved `dirname(fileURLToPath(import.meta.url))` of the caller).
 * @param fs - Filesystem adapter (injectable for tests).
 * @returns Absolute path to the HTML file.
 * @throws If the file does not exist at the expected location.
 */
export function resolveHtmlPath(extensionDir: string, fs: PathsFs): string {
  const candidate = resolve(extensionDir, "../tools/rdf-memory-explorer.html");
  if (fs.existsSync(candidate)) return candidate;
  throw new Error(`RDF Memory Explorer HTML not found. Expected: ${candidate}`);
}

// ── defaultStoreDir ───────────────────────────────────────────────────────────

/**
 * Return the default RDF memory store directory.
 * Matches the location used by the `rdf_memory_*` tools.
 *
 * @param home - Home directory to use (injectable for tests; defaults to real `os.homedir()`).
 */
export function defaultStoreDir(home?: string): string {
  return join(home ?? homedir(), ".pi", "agent", "rdf-memory");
}
