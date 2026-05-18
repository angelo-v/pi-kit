import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  storeNameForEndpoint,
  metaGraphIri,
  buildQueryMetaUpdate,
  cacheEndpointResult,
  type CacheStoreAdapter,
} from "../endpoint-cache.js";

// ── storeNameForEndpoint ─────────────────────────────────────────────────────

describe("storeNameForEndpoint", () => {
  it("extracts the hostname from a Wikidata URL", () => {
    expect(storeNameForEndpoint("https://query.wikidata.org/sparql")).toBe(
      "query.wikidata.org"
    );
  });

  it("extracts the hostname from a DBpedia URL", () => {
    expect(storeNameForEndpoint("https://dbpedia.org/sparql")).toBe("dbpedia.org");
  });

  it("extracts the hostname from an http URL", () => {
    expect(storeNameForEndpoint("http://localhost:8080/sparql")).toBe("localhost");
  });

  it("falls back to a sanitised string for an invalid URL", () => {
    const result = storeNameForEndpoint("not-a-url");
    expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
  });
});

// ── metaGraphIri ─────────────────────────────────────────────────────────────

describe("metaGraphIri", () => {
  it("appends #queries to the endpoint URL", () => {
    expect(metaGraphIri("https://query.wikidata.org/sparql")).toBe(
      "https://query.wikidata.org/sparql#queries"
    );
  });

  it("does not double-append the fragment", () => {
    const iri = metaGraphIri("https://example.org/sparql");
    expect(iri.match(/#queries/g)?.length).toBe(1);
  });
});

// ── buildQueryMetaUpdate ─────────────────────────────────────────────────────

describe("buildQueryMetaUpdate", () => {
  const ENDPOINT = "https://query.wikidata.org/sparql";
  const STORE   = "query.wikidata.org"; // derived hostname
  const QUERY   = "SELECT ?s WHERE { ?s ?p ?o }";
  const AT      = "2026-05-16T12:00:00Z";
  const SEQ     = "test-seq-1";
  const NS      = "urn:pi-kit:linked-data:endpoint-cache:";

  it("is a valid SPARQL UPDATE (starts with PREFIX or INSERT)", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql.trim()).toMatch(/^(PREFIX|INSERT)/i);
  });

  it("targets the correct meta graph", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain(metaGraphIri(ENDPOINT));
  });

  it("contains the endpoint IRI", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain(`<${ENDPOINT}>`);
  });

  it("uses a named exec IRI (not a blank node)", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain(`<${NS}exec/${STORE}/${SEQ}>`);
    expect(sparql).not.toContain("_:");
  });

  it("uses a named result IRI", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain(`<${NS}result/${STORE}/${SEQ}>`);
  });

  it("links exec to result via ec:hasResult", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain(`<${NS}hasResult>`);
  });

  it("uses ec:queryText (not ec:query)", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain(`<${NS}queryText>`);
    expect(sparql).not.toMatch(/<urn:pi-kit:linked-data:endpoint-cache:query>/);
  });

  it("uses ec:resultText on the QueryResult node", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, "| col |\n| val |", SEQ);
    expect(sparql).toContain(`<${NS}resultText>`);
    expect(sparql).not.toMatch(/<urn:pi-kit:linked-data:endpoint-cache:result>/);
  });

  it("contains the query text", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain("SELECT ?s WHERE");
  });

  it("contains the executedAt timestamp", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, SEQ);
    expect(sparql).toContain(AT);
  });

  it("includes the result text when provided", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, "| col |\n| val |", SEQ);
    expect(sparql).toContain("col");
  });

  it("still emits a QueryResult node when result is empty", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, "", SEQ);
    expect(sparql).toContain(`<${NS}QueryResult>`);
    // but no resultText literal
    expect(sparql).not.toContain(`<${NS}resultText>`);
  });

  it("escapes double quotes in the query", () => {
    const sparql = buildQueryMetaUpdate(ENDPOINT, `SELECT WHERE { FILTER(?x = "hi") }`, AT, undefined, SEQ);
    // The inner double-quote must be escaped as \" in the SPARQL string literal
    expect(sparql).toContain('\\"hi\\"');
  });

  it("uses seq suffix in exec IRI for stable, collision-free IRIs", () => {
    const s1 = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, "seq-a");
    const s2 = buildQueryMetaUpdate(ENDPOINT, QUERY, AT, undefined, "seq-b");
    expect(s1).toContain("exec/query.wikidata.org/seq-a");
    expect(s2).toContain("exec/query.wikidata.org/seq-b");
  });
});

// ── cacheEndpointResult ──────────────────────────────────────────────────────

describe("cacheEndpointResult", () => {
  let updates: string[];
  let flushed: string[];
  let mockStore: { update: (s: string) => void };
  let adapter: CacheStoreAdapter;

  beforeEach(() => {
    updates = [];
    flushed = [];
    mockStore = { update: (s: string) => updates.push(s) };
    adapter = {
      open: (_path: string) => mockStore,
      flush: (path: string) => flushed.push(path),
      resolvePath: (name: string, base: string) => `${base}/${name}`,
      baseDir: () => "/tmp/rdf-memory",
      mkdirSync: vi.fn(),
    };
  });

  it("calls update with a SPARQL INSERT containing named exec + result IRIs", async () => {
    await cacheEndpointResult({
      query: "SELECT ?s WHERE { ?s ?p ?o }",
      endpointUrl: "https://query.wikidata.org/sparql",
      result: "| s |\n| wd:Q42 |",
      adapter,
    });
    expect(updates.length).toBe(1);
    expect(updates[0]).toContain("INSERT DATA");
    expect(updates[0]).toContain("exec/query.wikidata.org/");
    expect(updates[0]).toContain("result/query.wikidata.org/");
    expect(updates[0]).not.toContain("_:"); // no blank nodes
  });

  it("flushes the store after updating", async () => {
    await cacheEndpointResult({
      query: "SELECT ?s WHERE { ?s ?p ?o }",
      endpointUrl: "https://dbpedia.org/sparql",
      result: "result",
      adapter,
    });
    expect(flushed.length).toBe(1);
  });

  it("resolves the store path using the endpoint hostname", async () => {
    await cacheEndpointResult({
      query: "SELECT ?s WHERE { ?s ?p ?o }",
      endpointUrl: "https://dbpedia.org/sparql",
      result: "result",
      adapter,
    });
    expect(flushed[0]).toContain("dbpedia.org");
  });

  it("stores query text in the meta graph update", async () => {
    const query = "SELECT ?city WHERE { ?city wdt:P31 wd:Q515 }";
    await cacheEndpointResult({
      query,
      endpointUrl: "https://query.wikidata.org/sparql",
      result: "table",
      adapter,
    });
    expect(updates[0]).toContain("SELECT ?city WHERE");
  });

  it("swallows errors silently", async () => {
    const brokenAdapter: CacheStoreAdapter = {
      ...adapter,
      open: () => { throw new Error("disk full"); },
    };
    // Must not throw
    await expect(
      cacheEndpointResult({
        query: "SELECT ?s WHERE { ?s ?p ?o }",
        endpointUrl: "https://query.wikidata.org/sparql",
        result: "result",
        adapter: brokenAdapter,
      })
    ).resolves.toBeUndefined();
  });
});
