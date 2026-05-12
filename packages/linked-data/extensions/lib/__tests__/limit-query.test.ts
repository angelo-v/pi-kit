import { describe, it, expect } from "vitest";
import { ensureLimit, DEFAULT_LIMIT } from "../limit-query.js";

const SELECT = "SELECT ?s ?p ?o WHERE { ?s ?p ?o }";
const ASK    = "ASK { ?s ?p ?o }";

describe("ensureLimit", () => {
  it("appends LIMIT to a bare SELECT query", () => {
    const result = ensureLimit(SELECT);
    expect(result).toMatch(/LIMIT \d+$/);
  });

  it("uses DEFAULT_LIMIT when no limit argument is given", () => {
    const result = ensureLimit(SELECT);
    expect(result).toContain(`LIMIT ${DEFAULT_LIMIT}`);
  });

  it("uses a custom limit when provided", () => {
    const result = ensureLimit(SELECT, 100);
    expect(result).toContain("LIMIT 100");
  });

  it("does not add a second LIMIT if one already exists", () => {
    const query = `${SELECT}\nLIMIT 10`;
    const result = ensureLimit(query);
    const matches = result.match(/LIMIT/gi) ?? [];
    expect(matches).toHaveLength(1);
    expect(result).toContain("LIMIT 10");
  });

  it("preserves an existing LIMIT regardless of case", () => {
    const query = `${SELECT}\nlimit 25`;
    const result = ensureLimit(query);
    expect(result).toContain("limit 25");
    expect((result.match(/limit/gi) ?? []).length).toBe(1);
  });

  it("appends LIMIT to an ASK query", () => {
    const result = ensureLimit(ASK);
    expect(result).toContain(`LIMIT ${DEFAULT_LIMIT}`);
  });

  it("does not modify a CONSTRUCT query", () => {
    const query = "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }";
    expect(ensureLimit(query)).toBe(query);
  });

  it("does not modify a DESCRIBE query", () => {
    const query = "DESCRIBE <https://example.org/Thing>";
    expect(ensureLimit(query)).toBe(query);
  });

  it("is case-insensitive for CONSTRUCT", () => {
    const query = "construct { ?s ?p ?o } WHERE { ?s ?p ?o }";
    expect(ensureLimit(query)).toBe(query);
  });

  it("is case-insensitive for DESCRIBE", () => {
    const query = "describe <https://example.org/Thing>";
    expect(ensureLimit(query)).toBe(query);
  });

  it("trims trailing whitespace before appending", () => {
    const result = ensureLimit(`${SELECT}   `);
    expect(result).toMatch(/\}\nLIMIT \d+$/);
  });
});
