/**
 * Unit tests for the Wikidata prefix injection helper exported from
 * sparql-query-endpoint.ts.
 */

import { describe, it, expect } from "vitest";
import {
  injectWikidataPrefixes,
  WIKIDATA_PREFIXES,
  WIKIDATA_ENDPOINT,
} from "../wikidata.js";
import { validateEndpointUrl } from "../validate-endpoint.js";

describe("WIKIDATA_ENDPOINT", () => {
  it("points to the Wikidata Query Service", () => {
    expect(WIKIDATA_ENDPOINT).toBe("https://query.wikidata.org/sparql");
  });
});

describe("WIKIDATA_PREFIXES", () => {
  it("includes wd: prefix", () => {
    expect(WIKIDATA_PREFIXES).toContain("PREFIX wd:");
  });

  it("includes wdt: prefix", () => {
    expect(WIKIDATA_PREFIXES).toContain("PREFIX wdt:");
  });

  it("includes wikibase: prefix", () => {
    expect(WIKIDATA_PREFIXES).toContain("PREFIX wikibase:");
  });

  it("includes bd: prefix for Blazegraph label service", () => {
    expect(WIKIDATA_PREFIXES).toContain("PREFIX bd:");
  });
});

describe("injectWikidataPrefixes", () => {
  it("prepends all standard prefixes when query has none", () => {
    const query = "SELECT ?s WHERE { ?s ?p ?o }";
    const result = injectWikidataPrefixes(query);

    expect(result).toContain("PREFIX wd:");
    expect(result).toContain("PREFIX wdt:");
    expect(result).toContain("PREFIX wikibase:");
    expect(result).toContain("PREFIX bd:");
    expect(result).toContain(query);
  });

  it("places prefixes before the query body", () => {
    const query = "SELECT ?s WHERE { ?s ?p ?o }";
    const result = injectWikidataPrefixes(query);
    const prefixEnd = result.lastIndexOf("PREFIX");
    const queryStart = result.indexOf("SELECT");

    expect(prefixEnd).toBeLessThan(queryStart);
  });

  it("does not duplicate a prefix already declared in the query", () => {
    const query = "PREFIX wd: <http://www.wikidata.org/entity/>\nSELECT ?s WHERE { wd:Q64 ?p ?o }";
    const result = injectWikidataPrefixes(query);

    // Count occurrences of "PREFIX wd:"
    const matches = result.match(/PREFIX\s+wd:/gi) ?? [];
    expect(matches.length).toBe(1);
  });

  it("still injects missing prefixes even when some are already declared", () => {
    const query = "PREFIX wd: <http://www.wikidata.org/entity/>\nSELECT ?s WHERE { wd:Q64 ?p ?o }";
    const result = injectWikidataPrefixes(query);

    // wdt: was not in the query, so it must be injected
    expect(result).toContain("PREFIX wdt:");
  });

  it("returns the query unchanged when all prefixes are already present", () => {
    // Build a query that already declares every prefix
    const allPrefixes = WIKIDATA_PREFIXES;
    const query = allPrefixes + "SELECT ?s WHERE { ?s ?p ?o }";
    const result = injectWikidataPrefixes(query);

    // Should equal the input exactly (no extra lines added)
    expect(result).toBe(query);
  });

  it("does not add an empty prefix block when nothing needs injecting", () => {
    const allPrefixes = WIKIDATA_PREFIXES;
    const query = allPrefixes + "SELECT ?s WHERE { ?s ?p ?o }";
    const result = injectWikidataPrefixes(query);

    // No double newline before SELECT that would indicate an empty injected block
    expect(result.split("PREFIX wd:").length).toBe(2); // exactly one
  });

  it("handles a CONSTRUCT query without altering its structure", () => {
    const query = "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }";
    const result = injectWikidataPrefixes(query);

    expect(result).toContain("CONSTRUCT");
    expect(result).toContain("PREFIX wd:");
  });
});

// ── validateEndpointUrl ────────────────────────────────────────────────────

describe("validateEndpointUrl", () => {
  it("returns null for a valid https URL", () => {
    expect(validateEndpointUrl("https://query.wikidata.org/sparql")).toBeNull();
  });

  it("returns null for a valid http URL", () => {
    expect(validateEndpointUrl("http://dbpedia.org/sparql")).toBeNull();
  });

  it("rejects a non-URL string", () => {
    expect(validateEndpointUrl("not a url")).toMatch(/Invalid endpoint URL/);
  });

  it("rejects a file:// URL", () => {
    expect(validateEndpointUrl("file:///etc/passwd")).toMatch(/http or https/);
  });

  it("rejects a javascript: URL", () => {
    expect(validateEndpointUrl("javascript:alert(1)")).toMatch(/http or https/);
  });

  it("rejects an ftp:// URL", () => {
    expect(validateEndpointUrl("ftp://example.com/sparql")).toMatch(/http or https/);
  });

  it("rejects an empty string", () => {
    expect(validateEndpointUrl("")).toMatch(/Invalid endpoint URL/);
  });

  it("accepts a URL with an embedded newline (Node strips it; execFile array args prevent shell injection)", () => {
    // Node's URL parser silently strips newline control characters, yielding a
    // valid https: URL. Because the endpoint is passed to execFile as an array
    // element (not a shell string), the stripped newline poses no injection
    // risk. The validator therefore returns null (no error).
    expect(validateEndpointUrl("https://example.com/sparql\nnefarious-arg")).toBeNull();
  });

  it("accepts an http URL pointing at an internal host (SSRF is a network-layer concern)", () => {
    // The validator enforces protocol only; blocking internal IPs is left to
    // network policy. Document that this is intentional.
    expect(validateEndpointUrl("http://localhost:8080/sparql")).toBeNull();
  });
});
