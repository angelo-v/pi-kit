/**
 * High-level RDF patch helper.
 *
 * Orchestrates read → parse → SPARQL-Update → serialize → write for the
 * `rdf_patch` tool. All I/O is injected so the function is unit-testable
 * without touching the real filesystem.
 */

import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as nodeFs from "node:fs/promises";
import {Store} from "oxigraph";
import {parseTurtle} from "./rdf-parse.js";
import {serialize} from "./rdf-serialize.js";
import type {OutputFormat} from "./rdf-format.js";
import {inferFormat} from "./rdf-format.js";
import type { Quad } from "n3";
import { Parser as N3Parser, NamedNode } from "n3";

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
  // Pass the file's own location as base so relative IRIs (e.g.
  // `@prefix v: <../vocab.ttl#>.` and `<#this>`) resolve against the file.
  // An explicit `@base` in the source still wins.
  const fileUrl = pathToFileURL(absPath).href;
  const { quads: originalQuads, prefixes } = await parseTurtle(source, { baseIRI: fileUrl });
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
  // The same base is needed here so relative IRIs inside the update itself
  // (e.g. `INSERT DATA { <#task-1> dct:title "x" . }`) resolve like in the file.
  //
  // SPARQL Update does not inherit @prefix declarations from the document, so
  // document prefixes are injected first — prefixed names in the update resolve
  // against the document's vocabulary without requiring inline PREFIX clauses.
  // Explicit PREFIX clauses later in the update override document prefixes.
  const prefixDeclarations = Object.entries(prefixes)
    .map(([name, iri]) => `PREFIX ${name}: <${iri}>`)
    .join("\n");
  const effectiveUpdate = prefixDeclarations
    ? `${prefixDeclarations}\n${options.update}`
    : options.update;

  try {
    store.update(effectiveUpdate, { base_iri: fileUrl });
  } catch (err: any) {
    const prefixHint = /Prefix not found/.test(err?.message ?? "")
      ? ` Prefix \`${extractMissingPrefix(err.message, effectiveUpdate)}\` is not declared in the update. ` +
        `Document-level @prefix declarations are in scope automatically — ` +
        `check the prefix spelling or add a PREFIX clause to the update.`
      : "";
    throw new Error(`rdf_patch: invalid SPARQL Update. ${err?.message ?? err}${prefixHint}`);
  }

  // Extract updated quads from the store.
  const updatedQuads = [...store.match(null, null, null, null)];
  const triplesAfter = updatedQuads.length;

  // Serialize back to Turtle (re-using original prefixes).
  // Oxigraph quads must be converted to n3-compatible Quad objects.
  // The easiest bridge: dump to N-Quads, re-parse with parseTurtle.
  const nqDump = store.dump({ format: NQ_FORMAT });

  // Re-parse the N-Quads dump to get n3 Quad objects that serialize() can handle.

  // Relative IRIs must survive the patch: the store holds them in absolute
  // form (Oxigraph cannot keep scheme-less IRIs), so relativize terms and
  // prefix values against the file's own URL before serializing.
  //
  // Oxigraph walks its internal store list backwards on dump/match, which would
  // reshuffle the whole file on every patch. Reversing the dumped quads restores
  // the original source order (untouched triples keep their position;
  // patched/inserted ones land at the end). Pinned by the "order stability" tests.
  const relativeQuads = (await parseNQuads(nqDump))
    .reverse()
    .map((q) => relativizeQuad(q, fileUrl));
  const relativePrefixes = Object.fromEntries(
    Object.entries(prefixes).map(([name, value]) => [name, relativizeIri(value, fileUrl)])
  );

  const output = await serialize(relativeQuads, "turtle", relativePrefixes);

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

/* eslint-disable-next-line */
function extractMissingPrefix(message: string, update: string): string {
  // Oxigraph's message looks like: `error at 2:26: expected one of Prefix not found, ...`
  // Column points at the offending prefixed name's start; the local part ends
  // at the next character that cannot appear in a PN_LOCAL.
  const m = /error at (\d+):(\d+):/.exec(message);
  if (!m) return "";
  const lineIndex = Number(m[1]) - 1;
  const col = Number(m[2]) - 1;
  const line = update.split("\n")[lineIndex] ?? "";
  const rest = line.slice(col);
  const match = /^[A-Za-z][\w.-]*/.exec(rest);
  return match ? `${match[0]}:` : "";
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Converts an absolute IRI into a relative reference against `baseUrl` (the
 * document's own URL), so files keep their relative-IRI style after patching.
 *
 * - Same document: `file:///dir/plan.ttl#this` → `#this`
 * - Sibling/ancestor in the same tree: `file:///dir/doc.ttl` vs
 *   `file:///dir/vocab.ttl#` → `../vocab.ttl#`
 * - Anything else (e.g. `http://…`): returned unchanged.
 */
export function relativizeIri(iri: string, baseUrl: string): string {
  if (iri.startsWith(baseUrl)) {
    return iri.slice(baseUrl.length);
  }

  const baseDir = baseUrl.slice(0, baseUrl.lastIndexOf("/") + 1);
  let rel: string | undefined;

  if (iri.startsWith(baseDir)) {
    // Below the document's directory: one `../` per remaining path segment of
    // the base URL (the final segment is the document itself, not a directory).
    const baseAfterDir = baseUrl.slice(baseDir.length);
    const levelsUp = baseAfterDir.split("/").length - 1;
    rel = "../".repeat(levelsUp) + iri.slice(baseDir.length);
  } else {
    // Climb up from the document's directory until the IRI shares that prefix.
    let dir = baseDir;
    let levelsUp = 0;
    while (dir.length > 0) {
      const cut = dir.lastIndexOf("/", dir.length - 2);
      if (cut < 0) return iri; // reached the scheme root without a match
      dir = dir.slice(0, cut + 1);
      levelsUp++;
      if (iri.startsWith(dir)) {
        rel = "../".repeat(levelsUp) + iri.slice(dir.length);
        break;
      }
    }
  }

  // A relative reference must not contain ":" before its first "/" —
  // that would be parsed as a scheme instead of a path segment.
  if (rel === undefined || rel.includes(":")) {
    return iri;
  }
  return rel;
}

/** Returns a copy of `quad` with all `file://`-based IRIs relativized. */
function relativizeQuad(quad: Quad, baseUrl: string): Quad {
  const rel = (term: Quad["subject"]): Quad["subject"] =>
    term.termType === "NamedNode"
      ? new NamedNode(relativizeIri(term.value, baseUrl))
      : term;
  return {
    subject:     rel(quad.subject),
    predicate:   rel(quad.predicate),
    object:      rel(quad.object),
    graph:       rel(quad.graph),
    value:       quad.value,
    termType:    quad.termType,
    equals:      quad.equals,
    toString:    quad.toString,
    toJSON:      quad.toJSON,
  } as Quad;
}

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
