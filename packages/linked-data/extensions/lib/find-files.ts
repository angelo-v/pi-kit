/**
 * Recursive file-system walker that collects files matching a predicate,
 * skipping common non-project directories.
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

/** SHACL shapes files — matched by compound suffix to avoid catching plain .ttl data files. */
export const SHACL_EXTENSIONS = new Set([".shacl.ttl", ".shape.ttl", ".shapes.ttl"]);

/**
 * Recursively walk `dir`, returning absolute paths of every file for which
 * `matches(filename)` returns true.
 *
 * Directories listed in `IGNORE_DIRS` are skipped entirely.
 * Unreadable entries are silently skipped.
 */
export function findFiles(dir: string, matches: (filename: string) => boolean): string[] {
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
      } else if (matches(entry)) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Convenience wrapper: finds files whose last dot-segment extension is in `extensions`.
 * e.g. `findByExtensions(dir, new Set([".ttl", ".n3"]))`.
 */
export function findByExtensions(dir: string, extensions: Set<string>): string[] {
  return findFiles(dir, (name) => {
    const ext = name.slice(name.lastIndexOf("."));
    return extensions.has(ext);
  });
}

/**
 * Convenience wrapper: finds files whose full name ends with one of the given
 * suffixes. Use for compound extensions like `.shacl.ttl`.
 */
export function findByFullSuffix(dir: string, suffixes: Set<string>): string[] {
  return findFiles(dir, (name) => [...suffixes].some((s) => name.endsWith(s)));
}
