/**
 * Auto-cache helper for remote SPARQL endpoint queries.
 *
 * After a successful query against any SPARQL endpoint, the results and the
 * executed query text are persisted to a dedicated RDF memory store so they
 * survive across sessions and carry full quad-level provenance.
 *
 * Data model (per ADR-0004):
 *   - One Oxigraph store per endpoint, named after the endpoint hostname
 *     (e.g. "query.wikidata.org" for https://query.wikidata.org/sparql).
 *   - A named graph (<endpointUrl>#queries) holds QueryExecution and
 *     QueryResult nodes — both are first-class named-IRI nodes so they
 *     appear as visible, addressable nodes in graph visualisations.
 *   - Each QueryExecution has a stable IRI:
 *       urn:pi-kit:linked-data:endpoint-cache:exec/<storeName>/<n>
 *     and links to its result via ec:hasResult:
 *       urn:pi-kit:linked-data:endpoint-cache:result/<storeName>/<n>
 *   - QueryExecution carries: ec:endpoint, ec:executedAt, ec:queryText.
 *   - QueryResult carries: ec:resultText.
 *   - All inserts use SPARQL UPDATE so the store stays consistent.
 *
 * The cache is best-effort: failures are silently discarded so they never
 * affect the query result returned to the LLM.
 */

import { nowIso, escapeSparqlString } from "./rdf-memory-chunks.js";
import { resolveStorePath, openStore, flushStore, defaultStoreDir } from "./oxigraph-store.js";
import { mkdirSync } from "node:fs";

// ── Store-name derivation ────────────────────────────────────────────────────

/**
 * Derive a stable, human-readable store name from an endpoint URL.
 *
 * Examples:
 *   "https://query.wikidata.org/sparql"  → "query.wikidata.org"
 *   "https://dbpedia.org/sparql"         → "dbpedia.org"
 *   "http://localhost:8080/sparql"        → "localhost"
 *
 * Falls back to the full URL (with slashes replaced) if URL parsing fails.
 */
export function storeNameForEndpoint(endpointUrl: string): string {
  try {
    const { hostname } = new URL(endpointUrl);
    return hostname;
  } catch {
    return endpointUrl.replace(/[^a-zA-Z0-9._-]/g, "_");
  }
}

// ── TriG / SPARQL UPDATE builders ────────────────────────────────────────────

/** IRI of the named graph that holds query metadata for an endpoint. */
export function metaGraphIri(endpointUrl: string): string {
  return endpointUrl.replace(/\/?$/, "") + "#queries";
}

/**
 * Build a SPARQL UPDATE that records one query execution in the meta graph
 * using the named-node data model from ADR-0004.
 *
 * Both the query and the result become first-class named-IRI nodes so they
 * appear as distinct, addressable nodes in graph visualisations:
 *
 *   <ec:exec/{storeName}/{seq}>  a ec:QueryExecution
 *     ec:endpoint    <endpointUrl>
 *     ec:executedAt  "…"^^xsd:dateTime
 *     ec:queryText   "SELECT …"
 *     ec:hasResult   <ec:result/{storeName}/{seq}>
 *
 *   <ec:result/{storeName}/{seq}>  a ec:QueryResult
 *     ec:resultText  "| col | …"   (omitted when empty)
 */
export function buildQueryMetaUpdate(
  endpointUrl: string,
  query: string,
  executedAt: string,
  result?: string,
  /** Sequence suffix appended to the exec/result IRIs (defaults to Date.now()). */
  seq: string | number = Date.now()
): string {
  const NS = "urn:pi-kit:linked-data:endpoint-cache:";
  const storeName = storeNameForEndpoint(endpointUrl);
  const metaGraph = metaGraphIri(endpointUrl);
  const esc = escapeSparqlString;

  const execIri   = `${NS}exec/${storeName}/${seq}`;
  const resultIri = `${NS}result/${storeName}/${seq}`;

  const hasResultLine = `\n      <${NS}hasResult> <${resultIri}> .`;

  const resultBlock =
    result && result.trim().length > 0
      ? `\n    <${resultIri}> a <${NS}QueryResult> ;\n` +
        `      <${NS}resultText> "${esc(result)}" .`
      : `\n    <${resultIri}> a <${NS}QueryResult> .`;

  return (
    `PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n` +
    `INSERT DATA {\n` +
    `  GRAPH <${metaGraph}> {\n` +
    `    <${execIri}> a <${NS}QueryExecution> ;\n` +
    `      <${NS}endpoint>   <${endpointUrl}> ;\n` +
    `      <${NS}executedAt> "${executedAt}"^^xsd:dateTime ;\n` +
    `      <${NS}queryText>  "${esc(query)}" ;${hasResultLine}` +
    `${resultBlock}\n` +
    `  }\n` +
    `}`
  );
}

// ── Adapter interface ────────────────────────────────────────────────────────

/**
 * Minimal adapter for store I/O — injected so tests can swap it out without
 * touching the real filesystem or Oxigraph.
 */
export interface CacheStoreAdapter {
  open(storePath: string): { update(sparql: string): void };
  flush(storePath: string): void;
  resolvePath(name: string, baseDir: string): string;
  baseDir(): string;
  mkdirSync(dir: string): void;
}

/** Production adapter backed by the real Oxigraph store manager. */
export const defaultAdapter: CacheStoreAdapter = {
  open: openStore,
  flush: flushStore,
  resolvePath: resolveStorePath,
  baseDir: defaultStoreDir,
  mkdirSync: (dir) => mkdirSync(dir, { recursive: true }),
};

// ── Public API ───────────────────────────────────────────────────────────────

export interface CacheOptions {
  /** The SPARQL query exactly as sent to the endpoint (after prefix injection). */
  query: string;
  /** The endpoint URL (used as store name key and as named-graph IRI). */
  endpointUrl: string;
  /** The textual result returned to the LLM (table, JSON, etc.). */
  result: string;
  /** Injectable adapter — defaults to the real Oxigraph-backed implementation. */
  adapter?: CacheStoreAdapter;
}

/**
 * Persist a successful SPARQL endpoint query result to the per-endpoint store.
 *
 * - Store name  = `storeNameForEndpoint(endpointUrl)`
 * - Meta graph  = `<endpointUrl>#queries`
 * - Executed-at = current UTC datetime (stamped here, not by the caller)
 *
 * Silently swallows all errors so caching never disrupts query results.
 */
export async function cacheEndpointResult(options: CacheOptions): Promise<void> {
  const { query, endpointUrl, result, adapter = defaultAdapter } = options;

  try {
    const baseDir = adapter.baseDir();
    adapter.mkdirSync(baseDir);

    const storeName = storeNameForEndpoint(endpointUrl);
    const storePath = adapter.resolvePath(storeName, baseDir);

    const store = adapter.open(storePath);
    const executedAt = nowIso();

    // Record the query + result in the meta graph
    store.update(buildQueryMetaUpdate(endpointUrl, query, executedAt, result));

    adapter.flush(storePath);
  } catch {
    // Best-effort: never surface caching errors to the caller.
  }
}
