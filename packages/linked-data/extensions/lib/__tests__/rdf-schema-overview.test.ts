import { describe, it, expect } from "vitest";
import {
  parseMarkdownTable,
  parseSparqlJson,
  shorten,
  formatOverview,
  TYPES_QUERY,
  PREDICATES_QUERY,
  type SchemaOverview,
} from "../rdf-schema-overview.js";

// ── parseMarkdownTable ────────────────────────────────────────────────────────

describe("parseMarkdownTable", () => {
  const sampleTable = [
    "| type | count |",
    "| --- | --- |",
    '| <https://schema.org/Person> | "3"^^<http://www.w3.org/2001/XMLSchema#integer> |',
    '| <https://schema.org/Event> | "1"^^<http://www.w3.org/2001/XMLSchema#integer> |',
  ].join("\n");

  it("parses type and count from a markdown table", () => {
    const rows = parseMarkdownTable(sampleTable, "type", "count");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ iri: "https://schema.org/Person", count: 3 });
    expect(rows[1]).toEqual({ iri: "https://schema.org/Event", count: 1 });
  });

  it("returns empty array for a table with no data rows", () => {
    const empty = "| type | count |\n| --- | --- |";
    expect(parseMarkdownTable(empty, "type", "count")).toHaveLength(0);
  });

  it("strips angle brackets from IRIs", () => {
    const table = "| pred | count |\n| --- | --- |\n| <http://ex.org/p> | \"2\" |";
    const rows = parseMarkdownTable(table, "pred", "count");
    expect(rows[0].iri).toBe("http://ex.org/p");
  });

  it("ignores rows with count zero", () => {
    const table = "| type | count |\n| --- | --- |\n| <http://ex.org/T> | \"0\" |";
    expect(parseMarkdownTable(table, "type", "count")).toHaveLength(0);
  });

  it("handles plain integer count values (no xsd annotation)", () => {
    const table = "| type | count |\n| --- | --- |\n| <http://ex.org/T> | 7 |";
    const rows = parseMarkdownTable(table, "type", "count");
    expect(rows[0].count).toBe(7);
  });
});

// ── shorten ───────────────────────────────────────────────────────────────────

describe("shorten", () => {
  it("abbreviates schema.org IRIs", () => {
    expect(shorten("https://schema.org/Person")).toBe("schema:Person");
  });

  it("abbreviates rdf: IRIs", () => {
    expect(shorten("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")).toBe("rdf:type");
  });

  it("abbreviates mem: IRIs", () => {
    expect(shorten("urn:pi-kit:linked-data:rdf-memory:source")).toBe("mem:source");
  });

  it("returns unknown IRIs unchanged", () => {
    expect(shorten("http://unknown.example.org/foo")).toBe(
      "http://unknown.example.org/foo"
    );
  });
});

// ── formatOverview ────────────────────────────────────────────────────────────

describe("formatOverview", () => {
  const overview: SchemaOverview = {
    types: [{ iri: "https://schema.org/Person", count: 5 }],
    predicates: [{ iri: "https://schema.org/name", count: 10 }],
  };

  it("includes the label as a heading", () => {
    const out = formatOverview("my-store", overview);
    expect(out).toContain("### my-store");
  });

  it("renders type rows with shortened IRIs", () => {
    const out = formatOverview("s", overview);
    expect(out).toContain("`schema:Person`");
    expect(out).toContain("5");
  });

  it("renders predicate rows with shortened IRIs", () => {
    const out = formatOverview("s", overview);
    expect(out).toContain("`schema:name`");
    expect(out).toContain("10");
  });

  it("shows _none_ when there are no types", () => {
    const out = formatOverview("s", { types: [], predicates: overview.predicates });
    expect(out).toContain("_none_");
  });
});

// ── query strings ─────────────────────────────────────────────────────────────

describe("SPARQL query strings", () => {
  it("TYPES_QUERY references rdf:type and GRAPH", () => {
    expect(TYPES_QUERY).toContain("a ?type");
    expect(TYPES_QUERY).toContain("GRAPH");
  });

  it("PREDICATES_QUERY references ?predicate and GRAPH", () => {
    expect(PREDICATES_QUERY).toContain("?predicate");
    expect(PREDICATES_QUERY).toContain("GRAPH");
  });
});

// ── parseSparqlJson ───────────────────────────────────────────────────────────

describe("parseSparqlJson", () => {
  const sampleJson = JSON.stringify({
    results: {
      bindings: [
        { type: { value: "https://schema.org/Person" }, count: { value: "3" } },
        { type: { value: "https://schema.org/Event" },  count: { value: "1" } },
      ],
    },
  });

  it("parses type and count from a SPARQL JSON result", () => {
    const rows = parseSparqlJson(sampleJson, "type");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ iri: "https://schema.org/Person", count: 3 });
    expect(rows[1]).toEqual({ iri: "https://schema.org/Event",  count: 1 });
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseSparqlJson("not json", "type")).toHaveLength(0);
  });

  it("returns empty array when bindings are missing", () => {
    expect(parseSparqlJson(JSON.stringify({}), "type")).toHaveLength(0);
  });

  it("filters out rows with count zero", () => {
    const json = JSON.stringify({
      results: { bindings: [{ type: { value: "http://ex.org/T" }, count: { value: "0" } }] },
    });
    expect(parseSparqlJson(json, "type")).toHaveLength(0);
  });

  it("filters out rows with empty IRI", () => {
    const json = JSON.stringify({
      results: { bindings: [{ type: { value: "" }, count: { value: "5" } }] },
    });
    expect(parseSparqlJson(json, "type")).toHaveLength(0);
  });
});
