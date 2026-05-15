/**
 * SHACL validation helper.
 *
 * Validates one or more RDF data files against one or more SHACL shapes files.
 * All filesystem I/O is injected so the logic can be unit-tested without
 * touching the real filesystem.
 */

import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import { Parser } from "n3";
// @ts-ignore — rdf-validate-shacl ships plain JS; typedefs are available but
// the module resolution for the default export is via its index.js
import SHACLValidator from "rdf-validate-shacl";
// @ts-ignore
import factory from "rdf-validate-shacl/src/defaultEnv.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ValidateOptions {
  /** Absolute paths to the RDF data files to validate. */
  dataFiles: string[];
  /** Absolute paths to the SHACL shapes files. */
  shapesFiles: string[];
}

export interface ValidationViolation {
  focusNode: string;
  resultPath: string;
  message: string;
  severity: string;
}

export interface ValidationResult {
  conforms: boolean;
  violations: ValidationViolation[];
}

/** Injectable filesystem read interface. */
export interface FsReadAdapter {
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
}

/** Default fs adapter: delegates to `node:fs/promises`. */
export const defaultFsRead: FsReadAdapter = {
  readFile: (filePath, enc) => nodeFs.readFile(filePath, enc),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Local name of a SHACL severity IRI (e.g. "Violation", "Warning", "Info"). */
function severityLabel(iri: string): string {
  const hash = iri.lastIndexOf("#");
  const slash = iri.lastIndexOf("/");
  const sep = Math.max(hash, slash);
  return sep >= 0 ? iri.slice(sep + 1) : iri;
}

/** Short human-readable label for a path IRI or blank-node. */
function pathLabel(term: unknown): string {
  if (!term) return "";
  const t = term as { value?: string; termType?: string };
  if (t.termType === "BlankNode") return "";
  return t.value ?? "";
}

/** Parse a Turtle string into an RDF/JS DatasetCore using the shared factory. */
function parseTurtleToDataset(turtle: string): unknown {
  const parser = new Parser({ format: "Turtle" });
  const quads = parser.parse(turtle);
  // factory.dataset accepts an iterable of quads
  return (factory as { dataset(quads: unknown[]): unknown }).dataset(quads);
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Validates `options.dataFiles` against `options.shapesFiles` using the
 * `rdf-validate-shacl` SHACL engine.
 *
 * All files are read and merged before validation:
 * - All shapes files are unioned into a single shapes graph.
 * - All data files are unioned into a single data graph.
 *
 * @param options  Data and shapes file paths (must be absolute).
 * @param fs       Injectable filesystem adapter.
 * @throws         Re-throws Turtle parse errors or file-read errors.
 */
export async function validateShacl(
  options: ValidateOptions,
  fs: FsReadAdapter = defaultFsRead
): Promise<ValidationResult> {
  // Load and merge all shapes files
  const shapesTurtles = await Promise.all(
    options.shapesFiles.map((f) => fs.readFile(f, "utf8"))
  );
  const shapesDataset = (factory as {
    dataset(quads: unknown[]): unknown;
  }).dataset([]);
  for (const turtle of shapesTurtles) {
    const ds = parseTurtleToDataset(turtle);
    // Merge: iterate over the dataset and add each quad
    for (const quad of ds as Iterable<unknown>) {
      (shapesDataset as { add(q: unknown): void }).add(quad);
    }
  }

  // Load and merge all data files
  const dataTurtles = await Promise.all(
    options.dataFiles.map((f) => fs.readFile(f, "utf8"))
  );
  const dataDataset = (factory as {
    dataset(quads: unknown[]): unknown;
  }).dataset([]);
  for (const turtle of dataTurtles) {
    const ds = parseTurtleToDataset(turtle);
    for (const quad of ds as Iterable<unknown>) {
      (dataDataset as { add(q: unknown): void }).add(quad);
    }
  }

  const validator = new SHACLValidator(shapesDataset, { factory });
  const report = await validator.validate(dataDataset);

  const violations: ValidationViolation[] = report.results.map(
    (r: {
      focusNode?: { value?: string };
      path?: { value?: string; termType?: string };
      message?: Array<{ value?: string }>;
      severity?: { value?: string };
    }) => ({
      focusNode: r.focusNode?.value ?? "",
      resultPath: pathLabel(r.path),
      message: (r.message ?? []).map((m) => m.value ?? "").join("; "),
      severity: severityLabel(r.severity?.value ?? ""),
    })
  );

  return { conforms: report.conforms as boolean, violations };
}

// ── Formatting helpers (used by the extension entry-point) ────────────────────

/**
 * Formats a `ValidationResult` as a human-readable table string.
 *
 * Returns a short "✓ Conforms" line when there are no violations,
 * otherwise a Markdown-style table listing each violation.
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.conforms) {
    return "✓ Conforms — no SHACL violations found.";
  }

  const header =
    `✗ ${result.violations.length} violation${result.violations.length !== 1 ? "s" : ""} found.\n\n` +
    "| Focus Node | Path | Message | Severity |\n" +
    "|------------|------|---------|----------|\n";

  const rows = result.violations
    .map(
      (v) =>
        `| ${v.focusNode} | ${v.resultPath} | ${v.message} | ${v.severity} |`
    )
    .join("\n");

  return header + rows;
}
