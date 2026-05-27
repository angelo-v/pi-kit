/**
 * High-level RDF patch helper.
 *
 * Orchestrates read → parse → SPARQL-Update → serialize → write for the
 * `rdf_patch` tool. All I/O is injected so the function is unit-testable
 * without touching the real filesystem.
 */

import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import {Store} from "oxigraph";
import {parseTurtle} from "./rdf-parse.js";
import {serialize} from "./rdf-serialize.js";
import type {OutputFormat} from "./rdf-format.js";
import {inferFormat} from "./rdf-format.js";
import type {Quad} from "n3";
import {Parser as N3Parser} from "n3";

export interface PatchRdfOptions {
  /** Destination file path (absolute or relative to `cwd`). */
  path: string;
  /** A SPARQL Update statement (INSERT DATA / DELETE DATA / DELETE…INSERT…WHERE). */
  update: string;
  /** Working directory used to resolve a relative `path`. Defaults to `process.cwd()`. */
  cwd?: string;
}

export interface PatchRdfResult {
  /** Absolute path of the file that was written. */
  absPath: string;
  /** The format used for serialisation. */
  format: OutputFormat;
  /** Number of triples before the update. */
  triplesBefore: number;
  /** Number of triples after the update. */
  triplesAfter: number;
  /** Human-readable summary line. */
  summary: string;
}

/** Injectable filesystem interface (makes the function unit-testable). */
export interface FsAdapter {
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
  mkdir(dir: string, opts: { recursive: boolean }): Promise<unknown>;
  writeFile(filePath: string, data: string, encoding: "utf8"): Promise<void>;
}

/** Default fs adapter: delegates to `node:fs/promises`. */
export const defaultFs: FsAdapter = {
  readFile:  (filePath, enc)       => nodeFs.readFile(filePath, enc),
  mkdir:     (dir, opts)           => nodeFs.mkdir(dir, opts),
  writeFile: (filePath, data, enc) => nodeFs.writeFile(filePath, data, enc),
};

/**
 * Reads an existing RDF file, applies a SPARQL Update, and writes the result
 * back in place.
 *
 * Currently supports Turtle (`.ttl`) files only. Other extensions will
 * be rejected with a descriptive error.
 *
 * @param options  Input parameters (path, SPARQL update string, cwd).
 * @param fs       Injectable filesystem adapter (defaults to `node:fs/promises`).
 * @throws         When the file does not exist, the format is unsupported,
 *                 the Turtle is invalid, or the SPARQL Update is invalid.
 */
export async function patchRdf(
  options: PatchRdfOptions,
  fs: FsAdapter = defaultFs
): Promise<PatchRdfResult> {
  const cwd     = options.cwd ?? process.cwd();
  const absPath = nodePath.resolve(cwd, options.path);
  const fmt: OutputFormat = inferFormat(options.path);

  // Only Turtle round-trips cleanly through Oxigraph right now.
  if (fmt !== "turtle") {
    throw new Error(
      `rdf_patch currently supports Turtle (.ttl) files only. ` +
      `"${options.path}" has format "${fmt}". ` +
      `Use rdf_write to overwrite the file with the desired changes.`
    );
  }

  // Read source file — surface a friendly error when it does not exist.
  let source: string;
  try {
    source = await fs.readFile(absPath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(
        `rdf_patch: file not found: "${absPath}". ` +
        `Use rdf_write to create a new file.`
      );
    }
    throw err;
  }

  // Parse Turtle → quads + prefixes (preserves prefix declarations).
  const { quads: originalQuads, prefixes } = await parseTurtle(source);
  const triplesBefore = originalQuads.length;

  // Load quads into an in-memory Oxigraph store.
  const store = new Store();
  const NQ_FORMAT = "application/n-quads";

  // Serialize original quads to N-Quads for loading into Oxigraph.
  // We use the n3 Writer implicitly via our serialize helper.
  // Simpler: build N-Quads string manually from the n3 Quad objects.
  for (const q of originalQuads) {
    store.add(q as any);
  }

  // Execute the SPARQL Update — Oxigraph throws on invalid syntax.
  store.update(options.update);

  // Extract updated quads from the store.
  const updatedQuads = [...store.match(null, null, null, null)];
  const triplesAfter = updatedQuads.length;

  // Serialize back to Turtle (re-using original prefixes).
  // Oxigraph quads must be converted to n3-compatible Quad objects.
  // The easiest bridge: dump to N-Quads, re-parse with parseTurtle.
  const nqDump = store.dump({ format: NQ_FORMAT });

  // Re-parse the N-Quads dump to get n3 Quad objects that serialize() can handle.
  const n3Quads = await parseNQuads(nqDump);
  const output = await serialize(n3Quads, "turtle", prefixes);

  await fs.mkdir(nodePath.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, output, "utf8");

  const delta = triplesAfter - triplesBefore;
  const deltaStr =
    delta === 0
      ? "no change"
      : delta > 0
      ? `+${delta} triple${delta !== 1 ? "s" : ""}`
      : `${delta} triple${Math.abs(delta) !== 1 ? "s" : ""}`;

  const summary =
    `✓ Patched \`${options.path}\`: ${triplesBefore} → ${triplesAfter} triples (${deltaStr}).`;

  return { absPath, format: fmt, triplesBefore, triplesAfter, summary };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Parse an N-Quads string back into n3 Quad objects so we can hand them to
 * the existing `serialize()` helper. n3's Parser accepts N-Triples/N-Quads.
 */
function parseNQuads(nquads: string): Promise<Quad[]> {
  if (!nquads.trim()) return Promise.resolve([]);
  const parser = new N3Parser({ format: "N-Quads" });
  const quads: Quad[] = [];
  return new Promise<Quad[]>((resolve, reject) => {
    parser.parse(nquads, (err, quad) => {
      if (err) { reject(err); return; }
      if (quad) { quads.push(quad); }
      else      { resolve(quads); }
    });
  });
}
