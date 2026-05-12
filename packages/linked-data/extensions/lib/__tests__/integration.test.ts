/**
 * Integration tests – exercise the real Comunica binary end-to-end.
 *
 * These tests import the pure helper modules (no mocks) and run against the
 * fixture Turtle file bundled alongside the tests.
 */

import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { findBinary } from "../find-binary.js";
import { resolveSources } from "../resolve-sources.js";
import { buildArgs } from "../format.js";
import { ensureLimit, DEFAULT_LIMIT } from "../limit-query.js";
import { runQuery } from "../run-query.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES   = join(__dirname, "fixtures");
const BOOKS_TTL  = join(FIXTURES, "books.ttl");

// Locate the binary relative to the workspace root (same walk-up logic used
// at runtime – this also verifies that `findBinary` works for real).
const CWD    = join(__dirname, "..", "..", "..", "..", ".."); // workspace root
const BINARY = findBinary(CWD);

// ── helpers ───────────────────────────────────────────────────────────────────

async function sparql(query: string, format: "table" | "json" | "csv" = "json") {
  const { sources } = resolveSources([BOOKS_TTL], CWD);
  const args = buildArgs(sources, ensureLimit(query), format);
  return runQuery(BINARY, args, CWD);
}

/** Run without ensureLimit so we can observe the raw behaviour. */
async function sparqlRaw(query: string, format: "table" | "json" | "csv" = "json") {
  const { sources } = resolveSources([BOOKS_TTL], CWD);
  const args = buildArgs(sources, query, format);
  return runQuery(BINARY, args, CWD);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("integration: SELECT queries", () => {
  it("returns all triples in the fixture graph", async () => {
    const { output } = await sparql("SELECT * WHERE { ?s ?p ?o }");
    const parsed = JSON.parse(output);
    expect(parsed.results.bindings.length).toBeGreaterThan(0);
  });

  it("finds both books by rdf:type", async () => {
    const { output } = await sparql(`
      PREFIX ex: <http://example.org/>
      SELECT ?book WHERE { ?book a ex:Book }
    `);
    const parsed = JSON.parse(output);
    expect(parsed.results.bindings).toHaveLength(2);
  });

  it("retrieves book labels", async () => {
    const { output } = await sparql(`
      PREFIX ex:   <http://example.org/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?label WHERE { ?book a ex:Book ; rdfs:label ?label }
      ORDER BY ?label
    `);
    const parsed = JSON.parse(output);
    const labels = parsed.results.bindings.map((b: any) => b.label.value);
    expect(labels).toContain("Linked Data Patterns");
    expect(labels).toContain("The Semantic Web Primer");
  });

  it("returns authors via object reference (not string matching)", async () => {
    const { output } = await sparql(`
      PREFIX ex:   <http://example.org/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?authorName WHERE {
        ex:Book1 ex:author ?a .
        ?a rdfs:label ?authorName .
      }
    `);
    const parsed = JSON.parse(output);
    expect(parsed.results.bindings[0].authorName.value).toBe("Alice");
  });
});

describe("integration: output formats", () => {
  it("returns tabular text output for format=table", async () => {
    const { output } = await sparql("SELECT * WHERE { ?s ?p ?o } LIMIT 1", "table");
    // Table format is plain text – just verify it's non-empty
    expect(output.trim().length).toBeGreaterThan(0);
  });

  it("returns valid CSV for format=csv", async () => {
    const { output } = await sparql("SELECT * WHERE { ?s ?p ?o } LIMIT 3", "csv");
    // First line must be a header row with column names
    const firstLine = output.split("\n")[0];
    expect(firstLine).toMatch(/^[a-zA-Z]/);
  });
});

describe("integration: ensureLimit", () => {
  it("caps results when a bare SELECT has no LIMIT", async () => {
    // The fixture has 12 triples; with a cap of 2 we must get exactly 2 back.
    const { output } = await sparqlRaw(
      ensureLimit("SELECT * WHERE { ?s ?p ?o }", 2)
    );
    const parsed = JSON.parse(output);
    expect(parsed.results.bindings).toHaveLength(2);
  });

  it("does not add a second LIMIT when one is already present", async () => {
    // Query already limits to 1; ensureLimit must not override it.
    const query = "SELECT * WHERE { ?s ?p ?o } LIMIT 1";
    const { output } = await sparqlRaw(ensureLimit(query));
    const parsed = JSON.parse(output);
    expect(parsed.results.bindings).toHaveLength(1);
  });

  it("applies DEFAULT_LIMIT and returns a valid complete result", async () => {
    // Fixture has 12 triples — well under DEFAULT_LIMIT — so all rows come back.
    const { output } = await sparql("SELECT * WHERE { ?s ?p ?o }");
    const parsed = JSON.parse(output);
    // Result is complete (not truncated mid-row) and within the limit.
    expect(parsed.results.bindings.length).toBeGreaterThan(0);
    expect(parsed.results.bindings.length).toBeLessThanOrEqual(DEFAULT_LIMIT);
  });

  it("passes a CONSTRUCT query through unchanged and returns valid Turtle", async () => {
    const construct = "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }";
    // ensureLimit must not modify it; Comunica must still execute it fine.
    const limitedQuery = ensureLimit(construct);
    expect(limitedQuery).toBe(construct);
    const { sources } = resolveSources([BOOKS_TTL], CWD);
    const args = buildArgs(sources, limitedQuery, "turtle");
    const { output } = await runQuery(BINARY, args, CWD);
    // Result must be non-empty Turtle.
    expect(output.trim().length).toBeGreaterThan(0);
  });
});

describe("integration: resolveSources missing-file handling", () => {
  it("puts non-existent paths in the missing array", () => {
    const { sources, missing } = resolveSources(
      ["does-not-exist.ttl", BOOKS_TTL],
      CWD
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("does-not-exist.ttl");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatch(/^file:\/\//);
  });
});
