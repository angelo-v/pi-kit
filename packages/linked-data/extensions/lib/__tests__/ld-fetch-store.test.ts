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

  class MockFetcher {
    store: any;

    constructor(store: any) {
      this.store = store;
    }

    async load(uri: string) {
      if (mockFetchBehaviour === "http-error") {
        throw new Error(`HTTP 404: Not Found fetching <${uri}>`);
      }
      const body = TURTLE_FIXTURE;
      const contentType = "text/turtle";
      // Use rdflib's real parse() so the store is populated exactly as in prod
      real.parse(body, this.store, uri, contentType);
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

  it("rejects with a meaningful error message when the fetch fails", async () => {
    mockFetchBehaviour = "http-error";

    await expect(ldFetch(EXAMPLE_URI, storeDir)).rejects.toThrow(
      /HTTP 404.*Not Found/i
    );
  });
});
