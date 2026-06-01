/**
 * SHACL validation helper.
 *
 * Validates one or more RDF data files against one or more SHACL shapes files.
 * All filesystem I/O is injected so the logic can be unit-tested without
 * touching the real filesystem.
 */

import * as nodeFs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Parser, Store } from "n3";
// @ts-ignore – Reasoner and getRulesFromDataset exist at runtime but lack type declarations in n3 v2
import { Reasoner, getRulesFromDataset } from "n3";
// @ts-ignore
import { Validator } from "shacl-engine";
// @ts-ignore
import { targetResolvers, validations } from "shacl-engine/sparql.js";
// @ts-ignore
import dataModel from "@rdfjs/data-model";
// @ts-ignore
import rdfDataset from "@rdfjs/dataset";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ValidateOptions {
  /** Absolute paths to the RDF data files to validate. */
  dataFiles: string[];
  /** Absolute paths to the SHACL shapes files. */
  shapesFiles: string[];
  /** Optional N3/Notation3 rules files. Triples inferred by the rules are
   *  merged into the data graph before SHACL validation runs. */
  rulesFiles?: string[];
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

/**
 * Extract a human-readable path label from a shacl-engine path structure.
 * The path is an array of step objects; we return the first predicate IRI.
 */
function extractPathLabel(path: unknown): string {
  if (!path || !Array.isArray(path) || path.length === 0) return "";
  const step = path[0] as { predicates?: Array<{ value?: string }> };
  return step.predicates?.[0]?.value ?? "";
}

/** Parse a Turtle string into an RDF/JS DatasetCore. */
function parseTurtleToDataset(turtle: string, filePath?: string): Iterable<unknown> & { add(q: unknown): void } {
  const baseIRI = filePath ? pathToFileURL(filePath).href : undefined;
  const parser = new Parser({ format: "Turtle", ...(baseIRI ? { baseIRI } : {}) });
  const quads = parser.parse(turtle);
  const ds = (rdfDataset as { dataset(): unknown }).dataset() as Iterable<unknown> & { add(q: unknown): void };
  for (const q of quads) ds.add(q);
  return ds;
}

/**
 * Apply N3 rules to an array of data quads and return the augmented quads.
 * Parsed using the N3 Store/Reasoner from the `n3` package.
 */
function applyN3Rules(
  dataQuads: unknown[],
  rules: Array<{ text: string; filePath: string }>
): unknown[] {
  // Load all rules into a single N3 Store.
  // Each rules file is parsed with its own baseIRI so that relative URIs
  // (e.g. </vocab.ttl#Foo>) expand to the same absolute file:// IRIs that
  // the Turtle data parser produces — without this the rule antecedents
  // never match any data triple and inference is a no-op.
  const rulesStore = new Store();
  for (const { text, filePath } of rules) {
    const baseIRI = pathToFileURL(filePath).href;
    const parser = new Parser({ format: "N3", baseIRI });
    const ruleQuads = parser.parse(text);
    rulesStore.addQuads(ruleQuads);
  }
  const n3Rules = getRulesFromDataset(rulesStore);

  // Load data into an N3 Store and apply reasoning
  const dataStore = new Store();
  dataStore.addQuads(dataQuads as Parameters<typeof dataStore.addQuads>[0]);
  const reasoner = new Reasoner(dataStore);
  reasoner.reason(n3Rules);

  // Return all quads (original + inferred)
  return [...dataStore] as unknown[];
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Validates `options.dataFiles` against `options.shapesFiles` using the
 * `shacl-engine` SHACL engine with full SPARQL support
 * (`sh:SPARQLTarget`, `sh:sparql` constraints).
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
  const shapesDataset = (rdfDataset as { dataset(): unknown }).dataset() as
    Iterable<unknown> & { add(q: unknown): void };
  for (let i = 0; i < shapesTurtles.length; i++) {
    for (const quad of parseTurtleToDataset(shapesTurtles[i], options.shapesFiles[i])) shapesDataset.add(quad);
  }

  // Load and merge all data files
  const dataTurtles = await Promise.all(
    options.dataFiles.map((f) => fs.readFile(f, "utf8"))
  );
  let dataQuads: unknown[] = [];
  for (let i = 0; i < dataTurtles.length; i++) {
    for (const quad of parseTurtleToDataset(dataTurtles[i], options.dataFiles[i])) dataQuads.push(quad);
  }

  // Apply N3 rules (if any) before validation
  if (options.rulesFiles && options.rulesFiles.length > 0) {
    const ruleStrings = await Promise.all(
      options.rulesFiles.map((f) => fs.readFile(f, "utf8"))
    );
    dataQuads = applyN3Rules(
      dataQuads,
      ruleStrings.map((text, i) => ({ text, filePath: options.rulesFiles![i] }))
    );
  }

  const dataDataset = (rdfDataset as { dataset(): unknown }).dataset() as
    Iterable<unknown> & { add(q: unknown): void };
  for (const quad of dataQuads) dataDataset.add(quad);

  // shacl-engine with full SPARQL support
  const validator = new (Validator as new (
    shapes: unknown,
    opts: unknown
  ) => { validate(data: unknown): Promise<unknown> })(shapesDataset, {
    factory: dataModel,
    targetResolvers, // enables sh:SPARQLTarget (sh:target + sh:select)
    validations,     // enables sh:sparql constraint components
  });

  const report = await validator.validate({ dataset: dataDataset }) as {
    conforms: boolean;
    results: Array<{
      focusNode?: { value?: string };
      path?: unknown;
      message?: Array<{ value?: string }>;
      severity?: { value?: string };
    }>;
  };

  const violations: ValidationViolation[] = report.results.map((r) => ({
    focusNode: r.focusNode?.value ?? "",
    resultPath: extractPathLabel(r.path),
    message: (r.message ?? []).map((m) => m.value ?? "").join("; "),
    severity: severityLabel(r.severity?.value ?? ""),
  }));

  return { conforms: report.conforms, violations };
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
