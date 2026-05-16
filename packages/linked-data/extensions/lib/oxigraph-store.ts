/**
 * Oxigraph store manager.
 *
 * The oxigraph npm package is a WASM build that runs entirely in-memory.
 * This module wraps it with transparent file-based persistence:
 *
 *   - Each named store maps to a single N-Quads file on disk.
 *   - On first access the file is loaded into an in-memory Store.
 *   - After every mutating operation (insert / update / drop) the store
 *     is flushed back to disk atomically (write to .tmp, then rename).
 *   - On session_shutdown all open stores are flushed and released.
 *
 * Performance notes:
 *   - 100 000 triples → load ≈ 200 ms, dump ≈ 70 ms (benchmarked on WASM).
 *   - The store stays open in memory between tool calls within one session,
 *     so repeated queries pay no deserialization cost.
 *   - For very large datasets (millions of triples) the Oxigraph server
 *     binary with its native RocksDB backend is a better fit.
 */

import { Store } from "oxigraph";
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const NQ_FORMAT = "application/n-quads";

interface StoreEntry {
  store: Store;
  path: string; /** directory that holds the .nq file */
  dirty: boolean;
}

/** Map from absolute store-directory path → open entry. */
const registry = new Map<string, StoreEntry>();

/** Path to the N-Quads snapshot inside a store directory. */
function dataFile(storePath: string): string {
  return join(storePath, "data.nq");
}

/**
 * Resolve a store name to an absolute directory path.
 * Absolute names are used as-is; relative names are resolved against baseDir.
 */
export function resolveStorePath(name: string, baseDir: string): string {
  return resolve(baseDir, name);
}

/**
 * Open (or return the already-open) store at `storePath`.
 * Creates the directory and loads the persisted N-Quads file if it exists.
 */
export function openStore(storePath: string): Store {
  const existing = registry.get(storePath);
  if (existing) return existing.store;

  mkdirSync(storePath, { recursive: true });

  const store = new Store();
  const file = dataFile(storePath);
  if (existsSync(file)) {
    const nq = readFileSync(file, "utf8");
    if (nq.trim().length > 0) {
      store.load(nq, { format: NQ_FORMAT });
    }
  }

  registry.set(storePath, { store, path: storePath, dirty: false });
  return store;
}

/**
 * Flush a store's current state to disk (atomic write via temp file).
 * Called after every mutating operation.
 */
export function flushStore(storePath: string): void {
  const entry = registry.get(storePath);
  if (!entry) return;

  const nq = entry.store.dump({ format: NQ_FORMAT });
  const tmp = dataFile(storePath) + ".tmp";
  writeFileSync(tmp, nq, "utf8");
  renameSync(tmp, dataFile(storePath));
  entry.dirty = false;
}

/**
 * Return all store entries currently registered (open) in this process.
 */
export function listOpenStores(): string[] {
  return Array.from(registry.keys());
}

/**
 * List all store directories inside a base directory.
 */
export function listStoresInDir(baseDir: string): { name: string; path: string }[] {
  if (!existsSync(baseDir)) return [];
  return readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: join(baseDir, d.name) }));
}

/**
 * Flush all open stores and release them from memory.
 * Call in session_shutdown to avoid stale state.
 */
export function closeAll(): void {
  for (const [path, entry] of registry.entries()) {
    try {
      flushStore(path);
      entry.store.free();
    } catch {
      // ignore
    }
  }
  registry.clear();
}

// ── Result serialization ────────────────────────────────────────────────────

/**
 * Serialize a SELECT result set as a markdown table.
 */
export function serializeSelect(results: Iterable<Map<string, any>>): string {
  const rows: Record<string, string>[] = [];
  let variables: string[] = [];

  for (const binding of results) {
    if (variables.length === 0) variables = Array.from(binding.keys());
    const row: Record<string, string> = {};
    for (const [key, term] of binding.entries()) {
      row[key] = term ? termToString(term) : "";
    }
    rows.push(row);
  }

  if (variables.length === 0) return "(no results)";

  const header = "| " + variables.join(" | ") + " |";
  const sep = "| " + variables.map(() => "---").join(" | ") + " |";
  const body = rows.map((r) => "| " + variables.map((v) => r[v] ?? "").join(" | ") + " |");
  return [header, sep, ...body].join("\n");
}

/**
 * Serialize a CONSTRUCT/DESCRIBE result (iterable of quads) as N-Quads text.
 */
export function serializeQuads(quads: Iterable<any>): string {
  const lines: string[] = [];
  for (const q of quads) {
    const s = serializeTerm(q.subject);
    const p = `<${q.predicate.value}>`;
    const o = serializeTerm(q.object);
    const g = q.graph?.termType === "NamedNode" ? ` <${q.graph.value}>` : "";
    lines.push(`${s} ${p} ${o}${g} .`);
  }
  return lines.length > 0 ? lines.join("\n") : "(no results)";
}

function serializeTerm(term: any): string {
  if (!term) return '""';
  switch (term.termType) {
    case "NamedNode":
      return `<${term.value}>`;
    case "BlankNode":
      return `_:${term.value}`;
    case "Literal":
      return serializeLiteral(term);
    default:
      return `"${term.value}"`;
  }
}

function serializeLiteral(term: any): string {
  const escaped = term.value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  if (term.language) return `"${escaped}"@${term.language}`;
  const xsdString = "http://www.w3.org/2001/XMLSchema#string";
  if (term.datatype?.value && term.datatype.value !== xsdString) {
    return `"${escaped}"^^<${term.datatype.value}>`;
  }
  return `"${escaped}"`;
}

function termToString(term: any): string {
  return serializeTerm(term);
}

/** Default store base directory: ~/.pi/agent/rdf-memory/ */
export function defaultStoreDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  return join(home, ".pi", "agent", "rdf-memory");
}
