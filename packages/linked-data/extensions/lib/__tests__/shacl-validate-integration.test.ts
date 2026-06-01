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

// ── Relative IRI isolation (regression: baseIRI fix) ────────────────────────

describe("integration: relative IRI isolation across files", () => {
  it("reports violations for a file whose <#it> is missing required properties, even when another file's <#it> supplies them", async () => {
    const result = await validateShacl({
      dataFiles:   [F("relative-iri-a.ttl"), F("relative-iri-b.ttl")],
      shapesFiles: [F("relative-iri.shapes.ttl")],
    });
    // file-a is missing schema:name and schema:actionStatus → must NOT conform
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("violation focus node belongs to file-a, not file-b", async () => {
    const result = await validateShacl({
      dataFiles:   [F("relative-iri-a.ttl"), F("relative-iri-b.ttl")],
      shapesFiles: [F("relative-iri.shapes.ttl")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    // Each <#it> must resolve to the file-scoped IRI (file:///…/relative-iri-a.ttl#it)
    expect(focusNodes.some((fn) => fn.includes("relative-iri-a.ttl"))).toBe(true);
  });

  it("file-b's <#it> node is not a violation focus node", async () => {
    const result = await validateShacl({
      dataFiles:   [F("relative-iri-a.ttl"), F("relative-iri-b.ttl")],
      shapesFiles: [F("relative-iri.shapes.ttl")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("relative-iri-b.ttl"))).toBe(false);
  });

  it("does not report spurious maxCount violations caused by merged nodes", async () => {
    const result = await validateShacl({
      dataFiles:   [F("relative-iri-a.ttl"), F("relative-iri-b.ttl")],
      shapesFiles: [F("relative-iri.shapes.ttl")],
    });
    // Without the fix, both files' properties pile up on one node, causing
    // maxCount=1 violations. With the fix there must be none.
    const maxCountViolations = result.violations.filter((v) =>
      v.message.toLowerCase().includes("more than 1")
    );
    expect(maxCountViolations).toHaveLength(0);
  });
});

// ── N3 rules ─────────────────────────────────────────────────────────────────

describe("integration: N3 rules", () => {
  it("infers ex:Product from ex:Widget so a Widget-with-label conforms to ProductShape", async () => {
    // n3-rules.n3: { ?x a ex:Widget } => { ?x a ex:Product }
    // n3-rules.data.ttl: thing1 is a Widget WITH a label, thing2 is already a Product.
    // Without rules: ProductShape has only thing2 as a target (thing1 is never a Product).
    // With rules: thing1 also becomes a Product; since it has a label, result still conforms.
    // The meaningful assertion is that thing1 is NOT reported as a violation focus node
    // (it would be if rules ran but the label were missing, which is the next test).
    const result = await validateShacl({
      dataFiles:   [F("n3-rules.data.ttl")],
      shapesFiles: [F("n3-rules.shapes.ttl")],
      rulesFiles:  [F("n3-rules.rules.n3")],
    });
    expect(result.conforms).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("reports a violation when a Widget-turned-Product (via N3 rule) lacks a required label", async () => {
    // n3-rules-invalid.data.ttl: thing3 is a Widget with NO label.
    // Without rules: ProductShape has no targets → vacuously conforms.
    // With rules:    thing3 becomes a Product → violates sh:minCount 1 on rdfs:label.
    const result = await validateShacl({
      dataFiles:   [F("n3-rules-invalid.data.ttl")],
      shapesFiles: [F("n3-rules.shapes.ttl")],
      rulesFiles:  [F("n3-rules.rules.n3")],
    });
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("violation focus node is the Widget-turned-Product that lacks a label", async () => {
    const result = await validateShacl({
      dataFiles:   [F("n3-rules-invalid.data.ttl")],
      shapesFiles: [F("n3-rules.shapes.ttl")],
      rulesFiles:  [F("n3-rules.rules.n3")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("thing3"))).toBe(true);
  });

  it("omitting rulesFiles still works for plain Turtle data with no rules", async () => {
    const result = await validateShacl({
      dataFiles:   [F("books.ttl")],
      shapesFiles: [F("shacl-core.shapes.ttl")],
    });
    expect(result.conforms).toBe(true);
  });
});

// ── N3 rules: relative URI / baseIRI regression ─────────────────────────────

describe("integration: N3 rules with relative URIs (baseIRI regression)", () => {
  // Fixtures use a relative prefix </types.ttl#> in both the rules and data
  // files. Without baseIRI on the N3 parser the prefix expands to a bare
  // path string instead of a file:// IRI, so the rule antecedent never
  // matches any data triple and inference is a no-op.

  it("reports a violation when a rule using relative URIs infers a class whose instance lacks a required property", async () => {
    // n3-relative-baseiri.rules.n3 : { ?x a :Fruit } => { ?x a :Food }
    // n3-relative-baseiri.data.ttl : item1 a :Fruit  (no rdfs:label)
    // n3-relative-baseiri.shapes.ttl: every :Food must have rdfs:label
    //
    // Without the fix (no baseIRI on the N3 parser):
    //   - rule URIs stay as bare path strings → rule never matches → no inference
    //   - item1 never becomes :Food → no SHACL target → vacuously conforms
    // With the fix:
    //   - rule URIs resolve correctly → item1 becomes :Food → violation reported
    const result = await validateShacl({
      dataFiles:   [F("n3-relative-baseiri.data.ttl")],
      shapesFiles: [F("n3-relative-baseiri.shapes.ttl")],
      rulesFiles:  [F("n3-relative-baseiri.rules.n3")],
    });
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("violation focus node is the item that was inferred a :Food via the relative-URI rule", async () => {
    const result = await validateShacl({
      dataFiles:   [F("n3-relative-baseiri.data.ttl")],
      shapesFiles: [F("n3-relative-baseiri.shapes.ttl")],
      rulesFiles:  [F("n3-relative-baseiri.rules.n3")],
    });
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("item1"))).toBe(true);
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
