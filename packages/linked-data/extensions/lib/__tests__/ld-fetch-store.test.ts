/**
 * Tests for ld-fetch-store.ts
 *
 * The HTTP boundary (rdflib's Fetcher._fetch) is mocked so tests run fast
 * and offline. All Oxigraph storage logic runs for real against a temp
 * directory, so the tests verify true end-to-end behaviour.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, renameSync, existsSync, statSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "oxigraph";
import type { Term } from "oxigraph";
import { ldFetch, FETCHED_DATA_STORE } from "../ld-fetch-store.js";
import { openStore, resolveStorePath, flushStore } from "../oxigraph-store.js";
import { CHUNK_BASE, META_GRAPH, MEM_NS } from "../rdf-memory-chunks.js";

// ── Fixture ──────────────────────────────────────────────────────────────────

const EXAMPLE_URI = "http://example.org/vocab";
const HASH_URI     = "http://example.org/vocab#Cat";
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
      // Use the document URI (no fragment) as the graph base, mirroring what
      // the real Fetcher does: it strips the fragment before making the HTTP
      // request and stores triples under the document URI.
      const hashIndex = uri.indexOf("#");
      const documentUri = hashIndex === -1 ? uri : uri.slice(0, hashIndex);
      // Use rdflib's real parse() so the store is populated exactly as in prod
      real.parse(body, this.store, documentUri, contentType);

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
    const bindings = oxiStore.query(
      `SELECT ?s ?p ?o WHERE { GRAPH <${EXAMPLE_URI}> { ?s ?p ?o } }`
    ) as Map<string, Term>[];

    expect(bindings.length).toBeGreaterThan(0);
  });

  it("replaces the existing graph when the same URI is fetched again", async () => {
    // First fetch — populates the graph
    const first = await ldFetch(EXAMPLE_URI, storeDir);

    // Second fetch — should replace, not append
    const second = await ldFetch(EXAMPLE_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);
    const bindings = oxiStore.query(
      `SELECT ?s ?p ?o WHERE { GRAPH <${EXAMPLE_URI}> { ?s ?p ?o } }`
    ) as Map<string, Term>[];

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
    const metaRows = oxiStore.query(
      `PREFIX mem: <${MEM_NS}>
       SELECT ?chunk ?recordedAt WHERE {
         GRAPH <${META_GRAPH}> {
           ?chunk mem:fetchedFrom <${EXAMPLE_URI}> ;
                  mem:recordedAt  ?recordedAt .
         }
       }`
    ) as Map<string, Term>[];
    expect(metaRows).toHaveLength(1);
    const chunkIri = metaRows[0].get("chunk")?.value ?? "";
    expect(chunkIri).toMatch(new RegExp(`^${CHUNK_BASE}`));

    // The chunk graph holds the rdflib session triples
    const sessionRows = oxiStore.query(
      `SELECT ?requestedURI ?status ?contentType WHERE {
         GRAPH <${chunkIri}> {
           ?req <http://www.w3.org/2007/ont/link#requestedURI> ?requestedURI ;
                <http://www.w3.org/2007/ont/link#response>     ?resp .
           ?resp <http://www.w3.org/2007/ont/http#status>        ?status ;
                 <http://www.w3.org/2007/ont/httph#content-type> ?contentType .
         }
       }`
    ) as Map<string, Term>[];
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].get("requestedURI")?.value).toBe(EXAMPLE_URI);
    expect(sessionRows[0].get("status")?.value).toBe("200");
    expect(sessionRows[0].get("contentType")?.value).toBe("text/turtle");

    // chrome://TheCurrentSession must never reach Oxigraph
    const rawSession = oxiStore.query(
      `SELECT ?s WHERE { GRAPH <chrome://TheCurrentSession> { ?s ?p ?o } } LIMIT 1`
    ) as Map<string, Term>[];
    expect(rawSession).toHaveLength(0);
  });

  it("re-fetch creates a fresh chunk and removes the old one", async () => {
    await ldFetch(EXAMPLE_URI, storeDir);
    await ldFetch(EXAMPLE_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);

    // Exactly one chunk for this URI in mem:meta (old one was replaced)
    const metaRows = oxiStore.query(
      `PREFIX mem: <${MEM_NS}>
       SELECT ?chunk WHERE {
         GRAPH <${META_GRAPH}> { ?chunk mem:fetchedFrom <${EXAMPLE_URI}> . }
       }`
    ) as Map<string, Term>[];
    expect(metaRows).toHaveLength(1);

    // That one chunk graph has exactly one request node
    const chunkIri = metaRows[0].get("chunk")?.value ?? "";
    const reqRows = oxiStore.query(
      `SELECT ?uri WHERE {
         GRAPH <${chunkIri}> {
           ?req <http://www.w3.org/2007/ont/link#requestedURI> ?uri .
         }
       }`
    ) as Map<string, Term>[];
    expect(reqRows).toHaveLength(1);
  });

  it("rejects with a meaningful error message when the fetch fails", async () => {
    mockFetchBehaviour = "http-error";

    await expect(ldFetch(EXAMPLE_URI, storeDir)).rejects.toThrow(
      /HTTP 404.*Not Found/i
    );
  });
});

describe("ldFetch — hash URIs", () => {
  it("isHashUri is false for a plain URI", async () => {
    const result = await ldFetch(EXAMPLE_URI, storeDir);
    expect(result.isHashUri).toBe(false);
    expect(result.documentUri).toBe(EXAMPLE_URI);
    expect(result.graphIri).toBe(EXAMPLE_URI);
  });

  it("isHashUri is true for a hash URI", async () => {
    const result = await ldFetch(HASH_URI, storeDir);
    expect(result.isHashUri).toBe(true);
    expect(result.uri).toBe(HASH_URI);
    expect(result.documentUri).toBe(EXAMPLE_URI);
    expect(result.graphIri).toBe(EXAMPLE_URI);
  });

  it("stores triples under the document URI graph, not the hash URI graph", async () => {
    await ldFetch(HASH_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);

    // Triples must be in the document graph
    const docRows = oxiStore.query(
      `SELECT ?s WHERE { GRAPH <${EXAMPLE_URI}> { ?s ?p ?o } } LIMIT 1`
    ) as Map<string, Term>[];
    expect(docRows.length).toBeGreaterThan(0);

    // The hash URI graph must be empty
    const hashRows = oxiStore.query(
      `SELECT ?s WHERE { GRAPH <${HASH_URI}> { ?s ?p ?o } } LIMIT 1`
    ) as Map<string, Term>[];
    expect(hashRows).toHaveLength(0);
  });

  it("fetching hash URI and plain document URI share the same graph (idempotent)", async () => {
    const resultHash  = await ldFetch(HASH_URI, storeDir);
    const resultPlain = await ldFetch(EXAMPLE_URI, storeDir);

    expect(resultHash.graphIri).toBe(resultPlain.graphIri);
    expect(resultHash.tripleCount).toBe(resultPlain.tripleCount);
  });

  it("mem:meta is indexed by document URI for hash fetches", async () => {
    await ldFetch(HASH_URI, storeDir);

    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    const oxiStore = openStore(storePath);

    const rows = oxiStore.query(
      `PREFIX mem: <${MEM_NS}>
       SELECT ?chunk WHERE {
         GRAPH <${META_GRAPH}> { ?chunk mem:fetchedFrom <${EXAMPLE_URI}> . }
       }`
    ) as Map<string, Term>[];
    expect(rows).toHaveLength(1);
  });
});

// ── Cross-extension stale-cache regression ────────────────────────────────────

describe("openStore — cross-extension cache invalidation", () => {
  /**
   * Regression test for the ld_fetch ↔ rdf_memory_query stale-cache bug.
   *
   * Root cause: jiti (pi's extension loader) sets `moduleCache: false`, so
   * each extension file (`ld-fetch.ts`, `rdf-memory.ts`) gets its own
   * module-level registry Map. A store opened and cached by extension A is
   * invisible to extension B's registry.
   *
   * Fix: openStore compares the registry entry's `loadedMtime` against the
   * current mtime of `data.nq`. If the file has been updated by another
   * module context since the cached entry was loaded, the cache is discarded
   * and the store is reloaded from disk.
   *
   * We simulate two extension contexts by writing directly to disk with a
   * raw Oxigraph Store (bypassing the registry), then verifying that a
   * subsequent openStore() in our test registry picks up the new data.
   */
  it("reloads from disk when another module context has written newer data", () => {
    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    mkdirSync(storePath, { recursive: true });

    // Seed the registry with an empty store (simulates rdf_memory_stores
    // or a prior rdf_memory_query that opened the store before ld_fetch ran).
    const emptyStore = openStore(storePath);
    expect(emptyStore.size).toBe(0);

    // Simulate ld_fetch running in a SEPARATE module context:
    // write data directly to disk via a raw Store (no registry involvement).
    const externalStore = new Store();
    externalStore.load(
      `<http://example.org/Cat> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/Class> <${EXAMPLE_URI}> .`,
      { format: "application/n-quads" }
    );
    const nq = externalStore.dump({ format: "application/n-quads" });
    const dataFile = join(storePath, "data.nq");
    const tmpFile  = dataFile + ".tmp";
    writeFileSync(tmpFile, nq, "utf8");
    renameSync(tmpFile, dataFile);

    // Now ask OUR registry to open the same store. It must detect that
    // data.nq is newer than the cached entry and reload from disk.
    const refreshedStore = openStore(storePath);
    const bindings = refreshedStore.query(
      `SELECT ?s ?p ?o WHERE { GRAPH <${EXAMPLE_URI}> { ?s ?p ?o } }`
    ) as Map<string, Term>[];

    expect(bindings.length).toBeGreaterThan(0);
  });

  it("does NOT reload from disk after a flush performed by this registry", () => {
    const storePath = resolveStorePath(FETCHED_DATA_STORE, storeDir);
    mkdirSync(storePath, { recursive: true });

    // Write and flush via our registry.
    const store = openStore(storePath);
    store.load(
      `<http://example.org/Dog> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/Class> <${EXAMPLE_URI}> .`,
      { format: "application/n-quads" }
    );
    flushStore(storePath);

    // The store object returned by openStore must be the SAME instance
    // (no unnecessary reload after our own flush).
    const sameStore = openStore(storePath);
    expect(sameStore).toBe(store);
  });
});
