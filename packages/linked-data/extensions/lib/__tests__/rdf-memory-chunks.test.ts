/**
 * Unit tests for rdf-memory-chunks.ts
 *
 * All helpers are pure functions — no mocking required.
 */

import { describe, it, expect } from "vitest";
import {
  MEM_NS,
  META_GRAPH,
  CHUNK_BASE,
  STANDARD_PREFIXES,
  wrapFactsInGraph,
  escapeSparqlString,
  buildMetaUpdate,
  newChunkId,
  nowIso,
} from "../rdf-memory-chunks.js";

// ── constants ─────────────────────────────────────────────────────────────────

describe("MEM_NS", () => {
  it("starts with urn:", () => {
    expect(MEM_NS).toMatch(/^urn:/);
  });
});

describe("META_GRAPH", () => {
  it("is within MEM_NS", () => {
    expect(META_GRAPH.startsWith(MEM_NS)).toBe(true);
  });
});

describe("CHUNK_BASE", () => {
  it("is within MEM_NS", () => {
    expect(CHUNK_BASE.startsWith(MEM_NS)).toBe(true);
  });

  it("differs from META_GRAPH", () => {
    expect(CHUNK_BASE).not.toBe(META_GRAPH);
  });
});

describe("STANDARD_PREFIXES", () => {
  it.each([
    "mem:",
    "prov:",
    "xsd:",
    "dct:",
    "schema:",
    "rdf:",
    "rdfs:",
    "owl:",
    "foaf:",
    "skos:",
    "vcard:",
  ])("declares the '%s' prefix", (prefix) => {
    expect(STANDARD_PREFIXES).toContain(prefix);
  });

  it("uses SPARQL-style PREFIX declarations", () => {
    expect(STANDARD_PREFIXES).toMatch(/^PREFIX\s/);
  });
});

// ── wrapFactsInGraph ──────────────────────────────────────────────────────────

describe("wrapFactsInGraph", () => {
  const IRI = "urn:example:chunk-abc";
  const SIMPLE_FACTS = `ex:alice schema:name "Alice" .`;

  it("wraps facts in a named graph block with the given IRI", () => {
    const trig = wrapFactsInGraph(IRI, SIMPLE_FACTS);
    expect(trig).toContain(`<${IRI}> {`);
  });

  it("includes the fact body inside the graph block", () => {
    const trig = wrapFactsInGraph(IRI, SIMPLE_FACTS);
    expect(trig).toContain(`ex:alice schema:name "Alice" .`);
  });

  it("includes all standard prefixes", () => {
    const trig = wrapFactsInGraph(IRI, SIMPLE_FACTS);
    expect(trig).toContain("PREFIX mem:");
    expect(trig).toContain("PREFIX schema:");
  });

  it("hoists PREFIX lines from the facts body above the graph block", () => {
    const facts = `PREFIX ex: <http://example.org/>\nex:alice a ex:Person .`;
    const trig = wrapFactsInGraph(IRI, facts);
    const prefixIdx = trig.indexOf("PREFIX ex:");
    const graphIdx = trig.indexOf(`<${IRI}> {`);
    expect(prefixIdx).toBeGreaterThanOrEqual(0);
    expect(prefixIdx).toBeLessThan(graphIdx);
  });

  it("hoists @prefix declarations (Turtle-style) above the graph block", () => {
    const facts = `@prefix ex: <http://example.org/> .\nex:bob a ex:Person .`;
    const trig = wrapFactsInGraph(IRI, facts);
    const prefixIdx = trig.indexOf("@prefix ex:");
    const graphIdx = trig.indexOf(`<${IRI}> {`);
    expect(prefixIdx).toBeLessThan(graphIdx);
  });

  it("keeps body lines (non-prefix) inside the graph block", () => {
    const facts = `PREFIX ex: <http://example.org/>\nex:alice a ex:Person .`;
    const trig = wrapFactsInGraph(IRI, facts);
    const graphStart = trig.indexOf(`<${IRI}> {`);
    const graphEnd = trig.lastIndexOf("}");
    const inside = trig.slice(graphStart, graphEnd);
    expect(inside).toContain("ex:alice a ex:Person .");
  });

  it("does not duplicate body lines outside the graph block", () => {
    const trig = wrapFactsInGraph(IRI, SIMPLE_FACTS);
    const graphIdx = trig.indexOf(`<${IRI}> {`);
    const before = trig.slice(0, graphIdx);
    expect(before).not.toContain(`ex:alice`);
  });
});

// ── escapeSparqlString ────────────────────────────────────────────────────────

describe("escapeSparqlString", () => {
  it("escapes double quotes", () => {
    expect(escapeSparqlString(`say "hello"`)).toBe(`say \\"hello\\"`);
  });

  it("escapes backslashes before quotes", () => {
    expect(escapeSparqlString(`a\\b`)).toBe(`a\\\\b`);
  });

  it("escapes newlines", () => {
    expect(escapeSparqlString("line1\nline2")).toBe("line1\\nline2");
  });

  it("returns plain strings unchanged", () => {
    expect(escapeSparqlString("hello world")).toBe("hello world");
  });
});

// ── buildMetaUpdate ───────────────────────────────────────────────────────────

describe("buildMetaUpdate", () => {
  const CHUNK = "urn:example:chunk-001";
  const TS = "2024-01-01T00:00:00Z";
  const SRC = "User stated";

  it("produces a SPARQL INSERT DATA statement", () => {
    const q = buildMetaUpdate(CHUNK, TS, SRC, undefined);
    expect(q).toMatch(/INSERT DATA/i);
  });

  it("targets the META_GRAPH", () => {
    const q = buildMetaUpdate(CHUNK, TS, SRC, undefined);
    expect(q).toContain(`<${META_GRAPH}>`);
  });

  it("references the chunk IRI", () => {
    const q = buildMetaUpdate(CHUNK, TS, SRC, undefined);
    expect(q).toContain(`<${CHUNK}>`);
  });

  it("inserts the recordedAt datetime", () => {
    const q = buildMetaUpdate(CHUNK, TS, SRC, undefined);
    expect(q).toContain(TS);
  });

  it("inserts the source string", () => {
    const q = buildMetaUpdate(CHUNK, TS, SRC, undefined);
    expect(q).toContain(SRC);
  });

  it("includes a dct:subject triple when topic is provided", () => {
    const q = buildMetaUpdate(CHUNK, TS, SRC, "people");
    expect(q).toContain("people");
    expect(q).toContain("http://purl.org/dc/terms/subject");
  });

  it("omits the dct:subject triple when topic is undefined", () => {
    const q = buildMetaUpdate(CHUNK, TS, SRC, undefined);
    expect(q).not.toContain("dct:subject");
  });

  it("escapes double-quotes in the source string", () => {
    const q = buildMetaUpdate(CHUNK, TS, `source with "quotes"`, undefined);
    expect(q).toContain('\\"quotes\\"');
  });

  it("escapes newlines in the source string", () => {
    const q = buildMetaUpdate(CHUNK, TS, "line1\nline2", undefined);
    expect(q).toContain("\\n");
  });
});

// ── newChunkId ────────────────────────────────────────────────────────────────

describe("newChunkId", () => {
  it("returns a non-empty string", () => {
    expect(newChunkId().length).toBeGreaterThan(0);
  });

  it("returns only hex characters", () => {
    expect(newChunkId()).toMatch(/^[0-9a-f]+$/);
  });

  it("returns unique values on each call", () => {
    const ids = new Set(Array.from({ length: 50 }, newChunkId));
    expect(ids.size).toBe(50);
  });

  it("returns exactly 12 characters", () => {
    expect(newChunkId()).toHaveLength(12);
  });
});

// ── nowIso ────────────────────────────────────────────────────────────────────

describe("nowIso", () => {
  it("returns a string matching xsd:dateTime format", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("does not include milliseconds", () => {
    expect(nowIso()).not.toContain(".");
  });

  it("ends with Z (UTC)", () => {
    expect(nowIso().endsWith("Z")).toBe(true);
  });

  it("returns a time close to now", () => {
    const before = Date.now();
    const iso = nowIso();
    const after = Date.now();
    const parsed = new Date(iso).getTime();
    // Allow 1-second rounding
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });
});
