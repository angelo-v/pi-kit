/**
 * Recursive file-system walker that collects files matching a set of
 * extensions, skipping common non-project directories.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Directories that are never descended into. */
export const IGNORE_DIRS = new Set(["node_modules", ".git", ".pi", ".agents"]);

/** RDF data-file extensions recognised by Comunica. */
export const RDF_EXTENSIONS = new Set([
  ".ttl",
  ".rdf",
  ".n3",
  ".jsonld",
  ".trig",
  ".nq",
  ".nt",
]);

/** SPARQL query-file extensions. */
export const QUERY_EXTENSIONS = new Set([".rq", ".sparql"]);

/**
 * Recursively walk `dir`, returning absolute paths of every file whose
 * extension is contained in `extensions`.
 *
 * Directories listed in `IGNORE_DIRS` are skipped entirely.
 * Unreadable entries are silently skipped.
 */
export function findByExtensions(dir: string, extensions: Set<string>): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry)) continue;

      const full = join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(full);
      } else {
        const ext = entry.slice(entry.lastIndexOf("."));
        if (extensions.has(ext)) results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}
