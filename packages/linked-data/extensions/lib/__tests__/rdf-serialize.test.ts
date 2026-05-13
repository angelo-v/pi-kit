import { describe, it, expect } from "vitest";
import { parseTurtle } from "../rdf-parse.js";
import { serialize } from "../rdf-serialize.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_TTL = `
  @prefix ex:   <http://example.org/> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

  ex:alice a ex:Person ;
           rdfs:label "Alice" .
`;

async function parseBase() {
  return parseTurtle(BASE_TTL);
}

// ── Turtle output ─────────────────────────────────────────────────────────────

describe("serialize → turtle", () => {
  it("produces output containing the subject (prefixed or full IRI)", async () => {
    const { quads, prefixes } = await parseBase();
    const out = await serialize(quads, "turtle", prefixes);
    // n3 Writer uses prefixed names when prefixes are provided
    expect(out).toMatch(/ex:alice|http:\/\/example\.org\/alice/);
  });

  it("includes prefix declarations when prefixes are provided", async () => {
    const { quads, prefixes } = await parseBase();
    const out = await serialize(quads, "turtle", prefixes);
    expect(out).toMatch(/@prefix ex:/);
  });

  it("omits prefix declarations when no prefixes are passed", async () => {
    const { quads } = await parseBase();
    const out = await serialize(quads, "turtle");
    expect(out).not.toMatch(/@prefix/);
  });
});

// ── N-Triples output ──────────────────────────────────────────────────────────

describe("serialize → ntriples", () => {
  it("produces one line per triple", async () => {
    const { quads } = await parseBase();
    const out = await serialize(quads, "ntriples");
    const lines = out.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(quads.length);
  });

  it("wraps IRIs in angle brackets", async () => {
    const { quads } = await parseBase();
    const out = await serialize(quads, "ntriples");
    expect(out).toContain("<http://example.org/alice>");
  });

  it("does not include prefix declarations", async () => {
    const { quads, prefixes } = await parseBase();
    const out = await serialize(quads, "ntriples", prefixes);
    expect(out).not.toMatch(/@prefix/);
  });
});

// ── N-Quads output ────────────────────────────────────────────────────────────

describe("serialize → nquads", () => {
  it("produces one line per triple", async () => {
    const { quads } = await parseBase();
    const out = await serialize(quads, "nquads");
    const lines = out.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(quads.length);
  });
});

// ── JSON-LD output ────────────────────────────────────────────────────────────

describe("serialize → jsonld", () => {
  it("produces valid JSON", async () => {
    const { quads } = await parseBase();
    const out = await serialize(quads, "jsonld");
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("produces a JSON-LD document containing @id and @type", async () => {
    const { quads } = await parseBase();
    const doc = JSON.parse(await serialize(quads, "jsonld"));
    // jsonld.compact with an empty context produces a flat object with @id / @type
    expect(doc).toHaveProperty("@id");
    expect(doc).toHaveProperty("@type");
  });

  it("round-trips the subject IRI into the JSON-LD output", async () => {
    const { quads } = await parseBase();
    const out = await serialize(quads, "jsonld");
    expect(out).toContain("http://example.org/alice");
  });
});

// ── Literal escaping ──────────────────────────────────────────────────────────

describe("serialize: literal value escaping", () => {
  it("handles literals with double quotes", async () => {
    const ttl = `@prefix ex: <http://example.org/> . ex:s ex:p "say \\"hello\\"" .`;
    const { quads } = await parseTurtle(ttl);
    // Should not throw during serialisation
    const out = await serialize(quads, "ntriples");
    expect(out).toContain("hello");
  });

  it("handles literals with newlines", async () => {
    const ttl = `@prefix ex: <http://example.org/> . ex:s ex:p """line1\nline2""" .`;
    const { quads } = await parseTurtle(ttl);
    const out = await serialize(quads, "ntriples");
    expect(out).toContain("line1");
    expect(out).toContain("line2");
  });

  it("handles language-tagged literals", async () => {
    const ttl = `@prefix ex: <http://example.org/> . ex:s ex:p "Hola"@es .`;
    const { quads } = await parseTurtle(ttl);
    const out = await serialize(quads, "ntriples");
    expect(out).toContain("@es");
  });
});
