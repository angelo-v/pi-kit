/**
 * Filesystem helpers for listing and reading RDF memory stores.
 *
 * All I/O is injected via the `StoresFs` adapter so these functions can be
 * tested without touching the real filesystem.
 */

import { join, resolve, sep } from "node:path";

// ── Adapters ──────────────────────────────────────────────────────────────────

/** A single directory entry returned by the fs adapter. */
export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Subset of `node:fs` used by this module (injectable for tests). */
export interface StoresFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): DirEntry[];
  readFileSync(path: string, encoding: "utf8"): string;
}

// ── listStores ────────────────────────────────────────────────────────────────

/**
 * Return a sorted list of store names found in `dir`.
 *
 * A directory is considered a valid store if it contains a `data.nq` file.
 * Returns an empty array when the directory does not exist.
 */
export function listStores(dir: string, fs: StoresFs): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => d.isDirectory() && fs.existsSync(join(dir, d.name, "data.nq")))
    .map((d) => d.name)
    .sort();
}

// ── readStoreNq ───────────────────────────────────────────────────────────────

/**
 * Read the raw N-Quads content of a named store.
 *
 * The `name` is validated in two layers: separator characters (`/`, `\`) and
 * null bytes are rejected outright, and the resolved file path must remain
 * inside `dir` (guards against `..` and similar traversal after
 * `path.resolve`).
 *
 * @returns The file content as a string, or `null` if the store does not
 *   exist or the name is unsafe.
 */
export function readStoreNq(dir: string, name: string, fs: StoresFs): string | null {
  // Reject empty names, path separators, and null bytes
  if (!name || name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  const file = join(dir, name, "data.nq");
  // Containment check — guards against '..' and any other traversal after resolve()
  if (!resolve(file).startsWith(resolve(dir) + sep)) return null;
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}
