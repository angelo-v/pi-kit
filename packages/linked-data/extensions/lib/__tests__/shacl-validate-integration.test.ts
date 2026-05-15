/**
 * Integration tests for shacl-validate.ts
 *
 * Unlike the unit tests, these tests use real fixture files on disk and the
 * default fs adapter — no mocks. They exercise the full validation pipeline
 * end-to-end, including SHACL Core, sh:SPARQLTarget, and sh:sparql constraints.
 */

import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateShacl } from "../shacl-validate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...parts: string[]) => join(__dirname, "fixtures", ...parts);

// ── SHACL Core ────────────────────────────────────────────────────────────────

describe("integration: SHACL Core", () => {
  it("conforms: books.ttl satisfies the book/author shape", async () => {
    const result = await validateShacl({
      dataFiles:   [F("books.ttl")],
      shapesFiles: [F("shacl-core.shapes.ttl")],
    });
    expect(result.conforms).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("does not conform: missing label and missing author are reported", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-core-invalid.data.ttl")],
      shapesFiles: [F("shacl-core.shapes.ttl")],
    });
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("violation for missing author points to the correct focus node", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-core-invalid.data.ttl")],
      shapesFiles: [F("shacl-core.shapes.ttl")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    // Book1 is missing its author
    expect(focusNodes.some((fn) => fn.includes("Book1"))).toBe(true);
  });

  it("violation for missing label points to the correct focus node", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-core-invalid.data.ttl")],
      shapesFiles: [F("shacl-core.shapes.ttl")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    // Book2 is missing its rdfs:label
    expect(focusNodes.some((fn) => fn.includes("Book2"))).toBe(true);
  });

  it("violation message contains the custom sh:message text", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-core-invalid.data.ttl")],
      shapesFiles: [F("shacl-core.shapes.ttl")],
    });
    const messages = result.violations.map((v) => v.message);
    expect(messages.some((m) => m.includes("rdfs:label") || m.includes("author"))).toBe(true);
  });

  it("all violations have severity 'Violation'", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-core-invalid.data.ttl")],
      shapesFiles: [F("shacl-core.shapes.ttl")],
    });
    for (const v of result.violations) {
      expect(v.severity).toBe("Violation");
    }
  });
});

// ── sh:SPARQLTarget ───────────────────────────────────────────────────────────

describe("integration: sh:SPARQLTarget", () => {
  it("does not conform: published book without isbn triggers violation", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-target-invalid.data.ttl")],
      shapesFiles: [F("shacl-sparql-target.shapes.ttl")],
    });
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("violation focus node is the published book missing isbn", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-target-invalid.data.ttl")],
      shapesFiles: [F("shacl-sparql-target.shapes.ttl")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("book1"))).toBe(true);
  });

  it("non-published book is excluded from focus nodes even without isbn", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-target-invalid.data.ttl")],
      shapesFiles: [F("shacl-sparql-target.shapes.ttl")],
    });
    // book3 is not published → SPARQLTarget must not select it
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("book3"))).toBe(false);
  });

  it("published book with isbn is not a violation focus node", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-target-invalid.data.ttl")],
      shapesFiles: [F("shacl-sparql-target.shapes.ttl")],
    });
    // book2 is published and has an isbn → no violation for it
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("book2"))).toBe(false);
  });

  it("conforms: all published books have an isbn", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-target-valid.data.ttl")],
      shapesFiles: [F("shacl-sparql-target.shapes.ttl")],
    });
    expect(result.conforms).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ── sh:sparql constraint ──────────────────────────────────────────────────────

describe("integration: sh:sparql constraint", () => {
  it("does not conform: duplicate isbn triggers violation", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-constraint-invalid.data.ttl")],
      shapesFiles: [F("shacl-sparql-constraint.shapes.ttl")],
    });
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("both books with the duplicate isbn appear as focus nodes", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-constraint-invalid.data.ttl")],
      shapesFiles: [F("shacl-sparql-constraint.shapes.ttl")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("book1"))).toBe(true);
    expect(focusNodes.some((fn) => fn.includes("book2"))).toBe(true);
  });

  it("violation carries the custom sh:message", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-constraint-invalid.data.ttl")],
      shapesFiles: [F("shacl-sparql-constraint.shapes.ttl")],
    });
    expect(result.violations[0].message).toContain("unique");
  });

  it("conforms: books with distinct isbns pass the uniqueness constraint", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-sparql-constraint-valid.data.ttl")],
      shapesFiles: [F("shacl-sparql-constraint.shapes.ttl")],
    });
    expect(result.conforms).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
