/**
 * High-level RDF write helper.
 *
 * Orchestrates parse → serialize → file-write for the `rdf_write` tool.
 * All I/O is injected so individual steps can be unit-tested in isolation.
 */

import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import { parseTurtle } from "./rdf-parse.js";
import { serialize } from "./rdf-serialize.js";
import { inferFormat, FORMAT_LABEL } from "./rdf-format.js";
import type { OutputFormat } from "./rdf-format.js";

export interface WriteRdfOptions {
  /** RDF/Turtle source text. */
  turtle: string;
  /** Destination file path (absolute or relative to `cwd`). */
  path: string;
  /** Explicit output format; inferred from `path` extension when omitted. */
  format?: OutputFormat;
  /** Working directory used to resolve a relative `path`. Defaults to `process.cwd()`. */
  cwd?: string;
}

export interface WriteRdfResult {
  /** Absolute path of the file that was written. */
  absPath: string;
  /** The format used for serialisation. */
  format: OutputFormat;
  /** Number of RDF triples written. */
  tripleCount: number;
  /** Human-readable summary line. */
  summary: string;
}

/** Injectable filesystem interface (makes the function unit-testable). */
export interface FsAdapter {
  mkdir(dir: string, opts: { recursive: boolean }): Promise<unknown>;
  writeFile(filePath: string, data: string, encoding: "utf8"): Promise<void>;
}

/** Default fs adapter: delegates to `node:fs/promises`. */
export const defaultFs: FsAdapter = {
  mkdir:     (dir, opts) => nodeFs.mkdir(dir, opts),
  writeFile: (filePath, data, enc) => nodeFs.writeFile(filePath, data, enc),
};

/**
 * Parses `options.turtle`, serialises it to the requested format, and
 * writes the result to disk.
 *
 * @param options  Input parameters (turtle text, destination path, format, cwd).
 * @param fs       Injectable filesystem adapter (defaults to `node:fs/promises`).
 * @throws         Re-throws parse errors from {@link parseTurtle} or
 *                 serialisation/write errors.
 */
export async function writeRdf(
  options: WriteRdfOptions,
  fs: FsAdapter = defaultFs
): Promise<WriteRdfResult> {
  const cwd       = options.cwd ?? process.cwd();
  const absPath   = nodePath.resolve(cwd, options.path);
  const fmt: OutputFormat = options.format ?? inferFormat(options.path);

  const { quads, prefixes } = await parseTurtle(options.turtle);
  const output = await serialize(quads, fmt, prefixes);

  await fs.mkdir(nodePath.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, output, "utf8");

  const tripleCount = quads.length;
  const summary =
    `✓ Written ${tripleCount} triple${tripleCount !== 1 ? "s" : ""} ` +
    `to \`${options.path}\` as ${FORMAT_LABEL[fmt]}.`;

  return { absPath, format: fmt, tripleCount, summary };
}
