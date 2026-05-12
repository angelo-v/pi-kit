import { describe, it, expect } from "vitest";
import { MIME, buildArgs } from "../format.js";
import type { OutputFormat } from "../format.js";

describe("MIME", () => {
  it("maps table to the string 'table'", () => {
    expect(MIME.table).toBe("table");
  });

  it("maps json to the SPARQL results JSON MIME type", () => {
    expect(MIME.json).toBe("application/sparql-results+json");
  });

  it("maps csv to text/csv", () => {
    expect(MIME.csv).toBe("text/csv");
  });

  it("maps turtle to text/turtle", () => {
    expect(MIME.turtle).toBe("text/turtle");
  });
});

describe("buildArgs", () => {
  const sources = ["file:///data/a.ttl", "file:///data/b.ttl"];
  const query = "SELECT * WHERE { ?s ?p ?o }";

  it("places sources before -q and -t flags", () => {
    const args = buildArgs(sources, query, "table");
    expect(args[0]).toBe("file:///data/a.ttl");
    expect(args[1]).toBe("file:///data/b.ttl");
  });

  it("includes -q followed by the query string", () => {
    const args = buildArgs(sources, query, "table");
    const qi = args.indexOf("-q");
    expect(qi).toBeGreaterThan(-1);
    expect(args[qi + 1]).toBe(query);
  });

  it("includes -t followed by the correct MIME type", () => {
    const formats: OutputFormat[] = ["table", "json", "csv", "turtle"];
    for (const fmt of formats) {
      const args = buildArgs(sources, query, fmt);
      const ti = args.indexOf("-t");
      expect(ti).toBeGreaterThan(-1);
      expect(args[ti + 1]).toBe(MIME[fmt]);
    }
  });

  it("defaults to table format when format is omitted", () => {
    const args = buildArgs(sources, query);
    const ti = args.indexOf("-t");
    expect(args[ti + 1]).toBe(MIME.table);
  });

  it("produces the correct total argument count", () => {
    // sources.length + "-q" + query + "-t" + mimeType = sources.length + 4
    const args = buildArgs(sources, query, "json");
    expect(args).toHaveLength(sources.length + 4);
  });

  it("works with a single source", () => {
    const args = buildArgs(["file:///single.ttl"], query, "csv");
    expect(args[0]).toBe("file:///single.ttl");
    expect(args).toHaveLength(5);
  });
});
