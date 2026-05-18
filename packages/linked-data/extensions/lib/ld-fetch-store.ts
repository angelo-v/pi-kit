/**
 * ld-fetch-store.ts
 *
 * Core logic for the ld_fetch tool.
 *
 * Fetches a Linked Data URI via rdflib's Fetcher (which handles content
 * negotiation, format detection, redirect following, and metadata triples),
 * then loads the resulting quads into the Oxigraph "fetched-data" store
 * under GRAPH <uri>.
 *
 * The HTTP boundary lives entirely inside rdflib's Fetcher._fetch, which is
 * replaceable in tests.
 */

import { openStore, flushStore, resolveStorePath } from "./oxigraph-store.js";
import { graph, Fetcher, serialize } from "./rdflib-import.js";

function getContentType(response: unknown): string {
  const headers = (response as any)?.headers;
  return headers?.get?.("content-type") ?? "application/octet-stream";
}

export const FETCHED_DATA_STORE = "fetched-data";

export interface FetchResult {
  /** Effective URI (after any redirects). */
  uri: string;
  /** Content-Type returned by the server, e.g. "text/turtle". */
  format: string;
  /** Number of triples stored in GRAPH <uri> (excludes rdflib metadata). */
  tripleCount: number;
  /** Named graph IRI — equals `uri`. */
  graphIri: string;
  /** ISO 8601 timestamp of when the fetch was recorded. */
  recordedAt: string;
}

/**
 * Fetch a Linked Data URI, parse it, and store the quads in the
 * "fetched-data" Oxigraph store under GRAPH <uri>.
 *
 * @param uri      HTTP/HTTPS URI to dereference.
 * @param storeDir Base directory for Oxigraph stores (injected for testability).
 */
export async function ldFetch(uri: string, storeDir: string): Promise<FetchResult> {
  // 1. Fetch + parse via rdflib (imported via ./rdflib-import.ts — see that
  // module for an explanation of why it exists).
  const store = graph();
  const fetcher = new Fetcher(store, {});
  const response = await fetcher.load(uri);

  const format = getContentType(response);

  // 2. Collect only the quads that belong to the document graph (= uri)
  const docQuads = store.statements.filter((st: any) => st.graph.value === uri);
  const tripleCount = docQuads.length;

  // 3. Serialize those quads to N-Quads for Oxigraph
  const nquads = await new Promise<string>((resolve, reject) => {
    const docNode = store.sym(uri);
    serialize(docNode, store, uri, "application/n-quads", (err: any, result: string) => {
      if (err) reject(err);
      else resolve(result ?? "");
    });
  });

  // 4. Load into Oxigraph, replacing any prior graph for this URI
  const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
  const oxiStore = openStore(storePath);

  // Clear the old graph so re-fetches are idempotent
  oxiStore.update(`CLEAR SILENT GRAPH <${uri}>`);
  if (nquads.trim().length > 0) {
    oxiStore.load(nquads, { format: "application/n-quads" });
  }

  flushStore(storePath);

  const recordedAt = new Date().toISOString();

  return { uri, format, tripleCount, graphIri: uri, recordedAt };
}
