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

import {type Term} from "oxigraph";
import {flushStore, openStore, resolveStorePath} from "./oxigraph-store.js";
import {Fetcher, graph, serialize} from "./rdflib-import.js";
import {CHUNK_BASE, MEM_NS, META_GRAPH, newChunkId, nowIso} from "./rdf-memory-chunks.js";

function getContentType(response: unknown): string {
  const headers = (response as any)?.headers;
  return headers?.get?.("content-type") ?? "application/octet-stream";
}

export const FETCHED_DATA_STORE = "fetched-data";

export interface FetchResult {
  /** The URI originally requested (may contain a fragment). */
  uri: string;
  /**
   * The document URI used for the HTTP request — always the URI without any
   * `#fragment`. For hash-less URIs this equals `uri`.
   */
  documentUri: string;
  /** Content-Type returned by the server, e.g. "text/turtle". */
  format: string;
  /** Number of triples stored in GRAPH <documentUri> (excludes rdflib metadata). */
  tripleCount: number;
  /**
   * Named graph IRI where the triples are stored. This is always the
   * *document* URI (no fragment), because that is where the server's response
   * body lives in the RDF data model.
   */
  graphIri: string;
  /** ISO 8601 timestamp of when the fetch was recorded. */
  recordedAt: string;
  /**
   * True when the requested URI contained a `#fragment`. The fragment
   * identifies a resource described *within* the document; its triples are
   * in GRAPH <documentUri> alongside the rest of the document.
   */
  isHashUri: boolean;
}

/**
 * Fetch a Linked Data URI, parse it, and store the quads in the
 * "fetched-data" Oxigraph store under GRAPH <uri>.
 *
 * @param uri      HTTP/HTTPS URI to dereference.
 * @param storeDir Base directory for Oxigraph stores (injected for testability).
 */
export async function ldFetch(uri: string, storeDir: string): Promise<FetchResult> {
  // Separate the document URI (used for HTTP) from any fragment identifier.
  // The RDF data model stores triples under the document URI — the fragment
  // merely identifies a resource *described within* that document.
  const hashIndex = uri.indexOf("#");
  const documentUri = hashIndex === -1 ? uri : uri.slice(0, hashIndex);
  const isHashUri = hashIndex !== -1;

  // 1. Fetch + parse via rdflib (imported via ./rdflib-import.ts — see that
  // module for an explanation of why it exists).
  const store = graph();
  const fetcher = new Fetcher(store, {});
  const response = await fetcher.load(uri);

  const format = getContentType(response);

  // 2. Collect only the quads that belong to the document graph.
  //    rdflib stores the parsed triples under the document URI (no fragment).
  const docQuads = store.statements.filter((st: any) => st.graph.value === documentUri);
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
  const prevChunks = oxiStore.query(
    `PREFIX mem: <${MEM_NS}>
     SELECT ?chunk WHERE { GRAPH <${META_GRAPH}> { ?chunk mem:fetchedFrom <${documentUri}> . } }`
  ) as Map<string, Term>[];
  for (const row of prevChunks) {
    const g = row.get("chunk")?.value;
    if (g) oxiStore.update(`CLEAR SILENT GRAPH <${g}>`);
  }
  // Clear the old mem:meta entry and the document graph
  oxiStore.update(
    `PREFIX mem: <${MEM_NS}>
     DELETE { GRAPH <${META_GRAPH}> { ?chunk ?p ?o . } }
     WHERE  { GRAPH <${META_GRAPH}> { ?chunk mem:fetchedFrom <${documentUri}> ; ?p ?o . } }`
  );
  oxiStore.update(`CLEAR SILENT GRAPH <${documentUri}>`);

  if (nquads.trim().length > 0) {
    oxiStore.load(nquads, { format: "application/n-quads" });
  }

  // 6. Register chunk in mem:meta — same shape as rdf_memory_record.
  //    Always index by the document URI so re-fetch cleanup works for both
  //    plain and hash URIs pointing at the same document.
  const recordedAt = nowIso();
  oxiStore.update(
    `PREFIX mem: <${MEM_NS}>
     PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
     INSERT DATA {
       GRAPH <${META_GRAPH}> {
         <${chunkIri}> mem:fetchedFrom <${documentUri}> ;
                       mem:recordedAt  "${recordedAt}"^^xsd:dateTime .
       }
     }`
  );

  flushStore(storePath);

  return { uri, documentUri, format, tripleCount, graphIri: documentUri, recordedAt, isHashUri };
}
