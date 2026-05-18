/**
 * Tests for ld-fetch-store.ts
 *
 * The HTTP boundary (rdflib's Fetcher._fetch) is mocked so tests run fast
 * and offline. All Oxigraph storage logic runs for real against a temp
 * directory, so the tests verify true end-to-end behaviour.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ldFetch, FETCHED_DATA_STORE } from "../ld-fetch-store.js";
import { openStore, resolveStorePath } from "../oxigraph-store.js";
import { CHUNK_BASE, META_GRAPH, MEM_NS } from "../rdf-memory-chunks.js";

// ── Fixture ──────────────────────────────────────────────────────────────────

const EXAMPLE_URI = "http://example.org/vocab";
const TURTLE_FIXTURE = `
  @prefix ex: <http://example.org/> .
  ex:Cat  a ex:Class .
  ex:Dog  a ex:Class .
  ex:name a ex:Property .
`;

// ── Mock ─────────────────────────────────────────────────────────────────────

/** Swap this out per-test to simulate fetch failures. */
let mockFetchBehaviour: "success" | "http-error" | "parse-error" = "success";

vi.mock("../rdflib-import.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../rdflib-import.js")>();

  const LINK_NS  = "http://www.w3.org/2007/ont/link#";
  const HTTP_NS  = "http://www.w3.org/2007/ont/http#";
  const HTTPH_NS = "http://www.w3.org/2007/ont/httph#";

  class MockFetcher {
    store: any;
    appNode: any;

    constructor(store: any) {
      this.store = store;
      this.appNode = store.sym("chrome://TheCurrentSession");
    }

    async load(uri: string) {
      if (mockFetchBehaviour === "http-error") {
        throw new Error(`HTTP 404: Not Found fetching <${uri}>`);
      }
      const body = TURTLE_FIXTURE;
      const contentType = "text/turtle";
      // Use rdflib's real parse() so the store is populated exactly as in prod
      real.parse(body, this.store, uri, contentType);

      // Mirror what the real Fetcher writes into chrome://TheCurrentSession
      const sym = (iri: string) => this.store.sym(iri);
      const lit = (v: string) => this.store.rdfFactory.literal(v);
      const req  = this.store.bnode();
      const resp = this.store.bnode();
      this.store.add(req,  sym(LINK_NS  + "requestedURI"),  lit(uri),         this.appNode);
      this.store.add(req,  sym(LINK_NS  + "response"),      resp,             this.appNode);
      this.store.add(resp, sym(HTTP_NS  + "status"),        lit("200"),       this.appNode);
      this.store.add(resp, sym(HTTPH_NS + "content-type"),  lit(contentType), this.appNode);

      return {
        status: 200,
        headers: new Headers({ "content-type": contentType }),
        responseText: body,
      };
    }
  }

  return { ...real, Fetcher: MockFetcher };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

let storeDir: string;

beforeEach(() => {
  storeDir = mkdtempSync(join(tmpdir(), "ld-fetch-test-"));
  mockFetchBehaviour = "success";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ldFetch", () => {
  it("returns a result with the fetched URI and a non-zero triple count", async () => {
    const result = await ldFetch(EXAMPLE_URI, storeDir);

    expect(result.uri).toBe(EXAMPLE_URI);
    expect(result.tripleCount).toBeGreaterThan(0);
  });

  it("stores triples in the fetched-data store under GRAPH <uri>", async () => {
    await ldFetch(EXAMPLE_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);
    const results = oxiStore.query(
      `SELECT ?s ?p ?o WHERE { GRAPH <${EXAMPLE_URI}> { ?s ?p ?o } }`
    );
    const bindings = [...results];

    expect(bindings.length).toBeGreaterThan(0);
  });

  it("replaces the existing graph when the same URI is fetched again", async () => {
    // First fetch — populates the graph
    const first = await ldFetch(EXAMPLE_URI, storeDir);

    // Second fetch — should replace, not append
    const second = await ldFetch(EXAMPLE_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);
    const results = oxiStore.query(
      `SELECT ?s ?p ?o WHERE { GRAPH <${EXAMPLE_URI}> { ?s ?p ?o } }`
    );
    const bindings = [...results];

    // Triple count must match a single fetch, not double
    expect(bindings.length).toBe(first.tripleCount);
    expect(second.tripleCount).toBe(first.tripleCount);
  });

  it("stores fetch metadata in a chunk graph (same shape as rdf_memory_record)", async () => {
    await ldFetch(EXAMPLE_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);

    // mem:meta must have exactly one chunk entry whose subject is a chunk IRI
    // and which points back to the document URI via mem:fetchedFrom
    const metaRows = [...oxiStore.query(
      `PREFIX mem: <${MEM_NS}>
       SELECT ?chunk ?recordedAt WHERE {
         GRAPH <${META_GRAPH}> {
           ?chunk mem:fetchedFrom <${EXAMPLE_URI}> ;
                  mem:recordedAt  ?recordedAt .
         }
       }`
    )];
    expect(metaRows).toHaveLength(1);
    const chunkIri = metaRows[0].get("chunk")?.value ?? "";
    expect(chunkIri).toMatch(new RegExp(`^${CHUNK_BASE}`));

    // The chunk graph holds the rdflib session triples
    const sessionRows = [...oxiStore.query(
      `SELECT ?requestedURI ?status ?contentType WHERE {
         GRAPH <${chunkIri}> {
           ?req <http://www.w3.org/2007/ont/link#requestedURI> ?requestedURI ;
                <http://www.w3.org/2007/ont/link#response>     ?resp .
           ?resp <http://www.w3.org/2007/ont/http#status>        ?status ;
                 <http://www.w3.org/2007/ont/httph#content-type> ?contentType .
         }
       }`
    )];
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].get("requestedURI")?.value).toBe(EXAMPLE_URI);
    expect(sessionRows[0].get("status")?.value).toBe("200");
    expect(sessionRows[0].get("contentType")?.value).toBe("text/turtle");

    // chrome://TheCurrentSession must never reach Oxigraph
    const rawSession = [...oxiStore.query(
      `SELECT ?s WHERE { GRAPH <chrome://TheCurrentSession> { ?s ?p ?o } } LIMIT 1`
    )];
    expect(rawSession).toHaveLength(0);
  });

  it("re-fetch creates a fresh chunk and removes the old one", async () => {
    await ldFetch(EXAMPLE_URI, storeDir);
    await ldFetch(EXAMPLE_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);

    // Exactly one chunk for this URI in mem:meta (old one was replaced)
    const metaRows = [...oxiStore.query(
      `PREFIX mem: <${MEM_NS}>
       SELECT ?chunk WHERE {
         GRAPH <${META_GRAPH}> { ?chunk mem:fetchedFrom <${EXAMPLE_URI}> . }
       }`
    )];
    expect(metaRows).toHaveLength(1);

    // That one chunk graph has exactly one request node
    const chunkIri = metaRows[0].get("chunk")?.value ?? "";
    const reqRows = [...oxiStore.query(
      `SELECT ?uri WHERE {
         GRAPH <${chunkIri}> {
           ?req <http://www.w3.org/2007/ont/link#requestedURI> ?uri .
         }
       }`
    )];
    expect(reqRows).toHaveLength(1);
  });

  it("rejects with a meaningful error message when the fetch fails", async () => {
    mockFetchBehaviour = "http-error";

    await expect(ldFetch(EXAMPLE_URI, storeDir)).rejects.toThrow(
      /HTTP 404.*Not Found/i
    );
  });
});
