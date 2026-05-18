/**
 * rdf-schema-overview
 *
 * Returns type and predicate usage statistics for an RDF dataset,
 * supporting two backends:
 *   - Oxigraph (rdf-memory stores)  — queried directly via the in-process Store
 *   - Comunica (local RDF files)    — queried via the CLI binary
 *
 * The two SPARQL queries are backend-agnostic; only the execution path differs.
 */

import { runQuery } from "./run-query.js";
import { buildArgs } from "./format.js";
import {
  openStore,
  serializeSelect,
  defaultStoreDir,
  resolveStorePath,
} from "./oxigraph-store.js";
import { mkdirSync } from "node:fs";

// ── SPARQL queries ────────────────────────────────────────────────────────────

/** Count distinct subjects per rdf:type across default and named graphs. */
export const TYPES_QUERY = `
SELECT ?type (COUNT(DISTINCT ?s) AS ?count) WHERE {
  { ?s a ?type . } UNION { GRAPH ?g { ?s a ?type . } }
} GROUP BY ?type ORDER BY DESC(?count)
`.trim();

/** Count usages of each predicate across default and named graphs. */
export const PREDICATES_QUERY = `
SELECT ?predicate (COUNT(*) AS ?count) WHERE {
  { ?s ?predicate ?o . } UNION { GRAPH ?g { ?s ?predicate ?o . } }
} GROUP BY ?predicate ORDER BY DESC(?count)
`.trim();

// ── Result types ──────────────────────────────────────────────────────────────

export interface SchemaRow {
  iri: string;
  count: number;
}

export interface SchemaOverview {
  types: SchemaRow[];
  predicates: SchemaRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip xsd:integer datatype suffix — e.g. `"5"^^<…integer>` → `5`. */
function parseCount(raw: string): number {
  const m = raw.match(/^"?(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Strip angle-bracket wrapping from an IRI string. */
function stripBrackets(iri: string): string {
  return iri.startsWith("<") && iri.endsWith(">") ? iri.slice(1, -1) : iri;
}

/** Parse a markdown table (as produced by serializeSelect) into rows. */
export function parseMarkdownTable(
  table: string,
  col0: string,
  col1: string
): SchemaRow[] {
  const lines = table.split("\n").filter((l) => l.startsWith("|"));
  // First line is header, second is separator — skip both
  const dataLines = lines.slice(2);
  return dataLines
    .map((line) => {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 2) return null;
      return { iri: stripBrackets(cells[0]), count: parseCount(cells[1]) };
    })
    .filter((r): r is SchemaRow => r !== null && r.iri !== "" && r.count > 0);
}

// ── Oxigraph backend ──────────────────────────────────────────────────────────

function runOxigraphQuery(storeName: string, sparql: string): string {
  const dir = defaultStoreDir();
  mkdirSync(dir, { recursive: true });
  const storePath = resolveStorePath(storeName, dir);
  const store = openStore(storePath);
  const result = store.query(sparql);
  if (Symbol.iterator in (result as any)) {
    return serializeSelect(result as Iterable<Map<string, any>>);
  }
  return String(result);
}

export async function overviewFromStore(storeName: string): Promise<SchemaOverview> {
  const typesRaw = runOxigraphQuery(storeName, TYPES_QUERY);
  const predsRaw = runOxigraphQuery(storeName, PREDICATES_QUERY);
  return {
    types: parseMarkdownTable(typesRaw, "type", "count"),
    predicates: parseMarkdownTable(predsRaw, "predicate", "count"),
  };
}

// ── Comunica (files) backend ──────────────────────────────────────────────────

/** Parse a SPARQL JSON result (application/sparql-results+json) into rows. */
export function parseSparqlJson(json: string, varName: string): SchemaRow[] {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const bindings: any[] = parsed?.results?.bindings ?? [];
  return bindings
    .map((b) => ({
      iri: b[varName]?.value ?? "",
      count: parseInt(b["count"]?.value ?? "0", 10),
    }))
    .filter((r) => r.iri !== "" && r.count > 0);
}

export async function overviewFromFiles(
  sources: string[],
  binary: string,
  cwd: string
): Promise<SchemaOverview> {
  const [typesRaw, predsRaw] = await Promise.all([
    runQuery(binary, buildArgs(sources, TYPES_QUERY, "json"), cwd),
    runQuery(binary, buildArgs(sources, PREDICATES_QUERY, "json"), cwd),
  ]);
  return {
    types: parseSparqlJson(typesRaw.output, "type"),
    predicates: parseSparqlJson(predsRaw.output, "predicate"),
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Shorten well-known namespace prefixes for readable output. */
const PREFIXES: Array<[string, string]> = [
  ["http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf:"],
  ["http://www.w3.org/2000/01/rdf-schema#", "rdfs:"],
  ["http://www.w3.org/2002/07/owl#", "owl:"],
  ["https://schema.org/", "schema:"],
  ["http://schema.org/", "schema:"],
  ["http://www.w3.org/2004/02/skos/core#", "skos:"],
  ["http://www.w3.org/2006/vcard/ns#", "vcard:"],
  ["http://www.w3.org/ns/prov#", "prov:"],
  ["http://purl.org/dc/terms/", "dct:"],
  ["http://purl.org/dc/elements/1.1/", "dc:"],
  ["http://www.w3.org/2001/XMLSchema#", "xsd:"],
  ["http://www.w3.org/2002/12/cal/ical#", "ical:"],
  ["http://xmlns.com/foaf/0.1/", "foaf:"],
  ["http://www.wikidata.org/prop/direct/", "wdt:"],
  ["http://www.wikidata.org/entity/", "wd:"],
  ["urn:pi-kit:linked-data:rdf-memory:", "mem:"],
];

export function shorten(iri: string): string {
  for (const [ns, prefix] of PREFIXES) {
    if (iri.startsWith(ns)) return prefix + iri.slice(ns.length);
  }
  return iri;
}

function tableRows(rows: SchemaRow[]): string {
  if (rows.length === 0) return "_none_";
  const lines = ["| IRI | Count |", "| --- | --- |"];
  for (const r of rows) {
    lines.push(`| \`${shorten(r.iri)}\` | ${r.count} |`);
  }
  return lines.join("\n");
}

export function formatOverview(label: string, overview: SchemaOverview): string {
  const parts: string[] = [`### ${label}`];
  parts.push("**Types**");
  parts.push(tableRows(overview.types));
  parts.push("**Predicates**");
  parts.push(tableRows(overview.predicates));
  return parts.join("\n\n");
}
