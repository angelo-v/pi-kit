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
import { CHUNK_BASE, newChunkId, META_GRAPH, MEM_NS, nowIso } from "./rdf-memory-chunks.js";

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
  /** Named graph IRI for the document — equals `uri`. */
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

  // 3. Remap chrome://TheCurrentSession quads into a fresh chunk-IRI graph.
  //    chrome://TheCurrentSession is rdflib's singleton — storing it directly
  //    would clobber the same graph on every fetch. We move those quads into
  //    a new mem:chunk-{id} graph so the shape is identical to rdf_memory_record:
  //    chunk IRI = named graph = mem:meta subject, mem:fetchedFrom → document URI.
  const SESSION_GRAPH = "chrome://TheCurrentSession";
  const chunkIri = CHUNK_BASE + newChunkId();
  const chunkNode = store.sym(chunkIri);
  const sessionStatements = store.statements.filter((st: any) => st.graph.value === SESSION_GRAPH);
  for (const st of sessionStatements) {
    store.add(st.subject, st.predicate, st.object, chunkNode);
    store.remove(st);
  }

  // 4. Serialize all graphs (doc graph + chunk meta graph) to N-Quads.
  const nquads = await new Promise<string>((resolve, reject) => {
    serialize(null, store, null, "application/n-quads", (err: any, result: string) => {
      if (err) reject(err);
      else resolve(result ?? "");
    });
  });

  // 5. Load into Oxigraph, replacing any prior graphs for this URI.
  const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
  const oxiStore = openStore(storePath);

  // Find and clear the previous chunk graph for this document URI (if any)
  const prevChunks = [...oxiStore.query(
    `PREFIX mem: <${MEM_NS}>
     SELECT ?chunk WHERE { GRAPH <${META_GRAPH}> { ?chunk mem:fetchedFrom <${uri}> . } }`
  )];
  for (const row of prevChunks) {
    const g = (row as any).get("chunk")?.value;
    if (g) oxiStore.update(`CLEAR SILENT GRAPH <${g}>`);
  }
  // Clear the old mem:meta entry and the document graph
  oxiStore.update(
    `PREFIX mem: <${MEM_NS}>
     DELETE { GRAPH <${META_GRAPH}> { ?chunk ?p ?o . } }
     WHERE  { GRAPH <${META_GRAPH}> { ?chunk mem:fetchedFrom <${uri}> ; ?p ?o . } }`
  );
  oxiStore.update(`CLEAR SILENT GRAPH <${uri}>`);

  if (nquads.trim().length > 0) {
    oxiStore.load(nquads, { format: "application/n-quads" });
  }

  // 6. Register chunk in mem:meta — same shape as rdf_memory_record.
  const recordedAt = nowIso();
  oxiStore.update(
    `PREFIX mem: <${MEM_NS}>
     PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
     INSERT DATA {
       GRAPH <${META_GRAPH}> {
         <${chunkIri}> mem:fetchedFrom <${uri}> ;
                       mem:recordedAt  "${recordedAt}"^^xsd:dateTime .
       }
     }`
  );

  flushStore(storePath);

  return { uri, format, tripleCount, graphIri: uri, recordedAt };
}
