/**
 * Unit tests for shacl-validate.ts
 *
 * Filesystem I/O is injected via FsReadAdapter so no real files are read.
 * All test fixtures are inline Turtle strings.
 */

import { describe, it, expect } from "vitest";
import {
  validateShacl,
  formatValidationResult,
  type FsReadAdapter,
  type ValidationResult,
} from "../shacl-validate.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PERSON_SHAPE = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix ex:  <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:PersonShape
  a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [
    sh:path    ex:name ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
  ] .
`;

const VALID_PERSON = `
@prefix ex:  <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:alice a ex:Person ;
  ex:name "Alice"^^xsd:string .
`;

const MISSING_NAME_PERSON = `
@prefix ex: <http://example.org/> .

ex:bob a ex:Person .
`;

const EXTRA_SHAPE = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix ex:  <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:BookShape
  a sh:NodeShape ;
  sh:targetClass ex:Book ;
  sh:property [
    sh:path    ex:title ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
  ] .
`;

const MISSING_TITLE_BOOK = `
@prefix ex: <http://example.org/> .

ex:book1 a ex:Book .
`;

// ── Adapter helpers ───────────────────────────────────────────────────────────

function makeFs(files: Record<string, string>): FsReadAdapter {
  return {
    readFile: async (path) => {
      if (path in files) return files[path];
      throw new Error(`ENOENT: ${path}`);
    },
  };
}

// ── validateShacl: conforms ───────────────────────────────────────────────────

describe("validateShacl: conforms", () => {
  it("returns conforms=true when data satisfies the shape", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   VALID_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.conforms).toBe(true);
  });

  it("returns an empty violations array when data conforms", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   VALID_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations).toHaveLength(0);
  });
});

// ── validateShacl: violations ─────────────────────────────────────────────────

describe("validateShacl: violations", () => {
  it("returns conforms=false when a required property is missing", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   MISSING_NAME_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.conforms).toBe(false);
  });

  it("includes at least one violation when data does not conform", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   MISSING_NAME_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("includes the focus node IRI in the violation", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   MISSING_NAME_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations[0].focusNode).toContain("bob");
  });

  it("includes the violated property path in the violation", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   MISSING_NAME_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations[0].resultPath).toContain("name");
  });

  it("includes a non-empty message in the violation", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   MISSING_NAME_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations[0].message.length).toBeGreaterThan(0);
  });

  it("includes a severity label in the violation", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   MISSING_NAME_PERSON,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations[0].severity).toBe("Violation");
  });
});

// ── validateShacl: multiple files ─────────────────────────────────────────────

describe("validateShacl: multiple files", () => {
  it("merges multiple shapes files and catches violations from each", async () => {
    const fs = makeFs({
      "/person-shape.ttl": PERSON_SHAPE,
      "/book-shape.ttl":   EXTRA_SHAPE,
      "/data.ttl":         MISSING_NAME_PERSON + "\n" + MISSING_TITLE_BOOK,
    });
    const result = await validateShacl(
      {
        dataFiles:   ["/data.ttl"],
        shapesFiles: ["/person-shape.ttl", "/book-shape.ttl"],
      },
      fs
    );
    // Both person and book violations must be reported
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("merges multiple data files and validates them as one graph", async () => {
    const fs = makeFs({
      "/shapes.ttl":  PERSON_SHAPE,
      "/alice.ttl":   VALID_PERSON,
      "/bob.ttl":     MISSING_NAME_PERSON,
    });
    const result = await validateShacl(
      {
        dataFiles:   ["/alice.ttl", "/bob.ttl"],
        shapesFiles: ["/shapes.ttl"],
      },
      fs
    );
    // bob violates; alice conforms; overall non-conforming
    expect(result.conforms).toBe(false);
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("bob"))).toBe(true);
  });
});

// ── validateShacl: error handling ─────────────────────────────────────────────

describe("validateShacl: error handling", () => {
  it("rejects when a data file contains invalid Turtle", async () => {
    const fs = makeFs({
      "/shapes.ttl": PERSON_SHAPE,
      "/data.ttl":   "this is not valid turtle !!!",
    });
    await expect(
      validateShacl(
        { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
        fs
      )
    ).rejects.toThrow();
  });

  it("rejects when a shapes file contains invalid Turtle", async () => {
    const fs = makeFs({
      "/shapes.ttl": "not turtle",
      "/data.ttl":   VALID_PERSON,
    });
    await expect(
      validateShacl(
        { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
        fs
      )
    ).rejects.toThrow();
  });

  it("propagates file-read errors", async () => {
    const fs = makeFs({ "/shapes.ttl": PERSON_SHAPE }); // data file missing
    await expect(
      validateShacl(
        { dataFiles: ["/missing.ttl"], shapesFiles: ["/shapes.ttl"] },
        fs
      )
    ).rejects.toThrow("ENOENT");
  });
});

// ── formatValidationResult ────────────────────────────────────────────────────

describe("formatValidationResult", () => {
  it("returns a conforms message when there are no violations", () => {
    const result: ValidationResult = { conforms: true, violations: [] };
    expect(formatValidationResult(result)).toContain("Conforms");
  });

  it("returns a non-conforms message when there are violations", () => {
    const result: ValidationResult = {
      conforms: false,
      violations: [
        {
          focusNode:  "http://example.org/bob",
          resultPath: "http://example.org/name",
          message:    "Less than 1 values",
          severity:   "Violation",
        },
      ],
    };
    expect(formatValidationResult(result)).toContain("violation");
  });

  it("includes the focus node in the formatted output", () => {
    const result: ValidationResult = {
      conforms: false,
      violations: [
        {
          focusNode:  "http://example.org/bob",
          resultPath: "http://example.org/name",
          message:    "Less than 1 values",
          severity:   "Violation",
        },
      ],
    };
    expect(formatValidationResult(result)).toContain("http://example.org/bob");
  });

  it("includes the result path in the formatted output", () => {
    const result: ValidationResult = {
      conforms: false,
      violations: [
        {
          focusNode:  "http://example.org/bob",
          resultPath: "http://example.org/name",
          message:    "Less than 1 values",
          severity:   "Violation",
        },
      ],
    };
    expect(formatValidationResult(result)).toContain("http://example.org/name");
  });

  it("includes the message in the formatted output", () => {
    const result: ValidationResult = {
      conforms: false,
      violations: [
        {
          focusNode:  "http://example.org/bob",
          resultPath: "http://example.org/name",
          message:    "Less than 1 values",
          severity:   "Violation",
        },
      ],
    };
    expect(formatValidationResult(result)).toContain("Less than 1 values");
  });

  it("reports the correct violation count", () => {
    const result: ValidationResult = {
      conforms: false,
      violations: [
        { focusNode: "ex:a", resultPath: "ex:p", message: "err1", severity: "Violation" },
        { focusNode: "ex:b", resultPath: "ex:q", message: "err2", severity: "Violation" },
      ],
    };
    expect(formatValidationResult(result)).toContain("2 violation");
  });

  it("uses singular 'violation' for a single result", () => {
    const result: ValidationResult = {
      conforms: false,
      violations: [
        { focusNode: "ex:a", resultPath: "ex:p", message: "err", severity: "Violation" },
      ],
    };
    const text = formatValidationResult(result);
    expect(text).toMatch(/1 violation[^s]/);
  });
});

// ── validateShacl: sh:SPARQLTarget ────────────────────────────────────────────

const SPARQL_TARGET_SHAPE = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix ex:  <http://example.org/> .

ex:ActivePersonShape
  a sh:NodeShape ;
  sh:target [
    a sh:SPARQLTarget ;
    sh:select """
      PREFIX ex: <http://example.org/>
      SELECT ?this WHERE {
        ?this a ex:Person .
        ?this ex:active true .
      }
    """
  ] ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1 ;
  ] .
`;

// alice: active, no name  → focus node, violation
// bob:   active, has name → focus node, conforms
// carol: inactive         → not a focus node, ignored
const SPARQL_TARGET_DATA_VIOLATION = `
@prefix ex:  <http://example.org/> .
ex:alice  a ex:Person ; ex:active true .
ex:bob    a ex:Person ; ex:active true  ; ex:name "Bob" .
ex:carol  a ex:Person ; ex:active false ; ex:name "Carol" .
`;

// all active persons have names → conforms
const SPARQL_TARGET_DATA_CONFORMS = `
@prefix ex:  <http://example.org/> .
ex:alice a ex:Person ; ex:active true  ; ex:name "Alice" .
ex:carol a ex:Person ; ex:active false .
`;

describe("validateShacl: sh:SPARQLTarget", () => {
  it("selects only matching focus nodes via SPARQL SELECT", async () => {
    const fs = makeFs({
      "/shapes.ttl": SPARQL_TARGET_SHAPE,
      "/data.ttl":   SPARQL_TARGET_DATA_VIOLATION,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    // carol is inactive → must NOT appear as a focus node
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("carol"))).toBe(false);
  });

  it("reports a violation for an active person without a name", async () => {
    const fs = makeFs({
      "/shapes.ttl": SPARQL_TARGET_SHAPE,
      "/data.ttl":   SPARQL_TARGET_DATA_VIOLATION,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.conforms).toBe(false);
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("alice"))).toBe(true);
  });

  it("does not report a violation for an active person with a name", async () => {
    const fs = makeFs({
      "/shapes.ttl": SPARQL_TARGET_SHAPE,
      "/data.ttl":   SPARQL_TARGET_DATA_VIOLATION,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    const focusNodes = result.violations.map((v) => v.focusNode);
    expect(focusNodes.some((fn) => fn.includes("bob"))).toBe(false);
  });

  it("conforms when all SPARQL-selected nodes satisfy the shape", async () => {
    const fs = makeFs({
      "/shapes.ttl": SPARQL_TARGET_SHAPE,
      "/data.ttl":   SPARQL_TARGET_DATA_CONFORMS,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.conforms).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ── validateShacl: sh:sparql constraint ───────────────────────────────────────

const SPARQL_CONSTRAINT_SHAPE = `
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix ex:   <http://example.org/> .

ex:UniqueEmailShape
  a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:sparql [
    sh:message "Email address must be unique across all persons." ;
    sh:select """
      PREFIX ex: <http://example.org/>
      SELECT $this WHERE {
        $this ex:email ?email .
        ?other ex:email ?email .
        FILTER (?other != $this)
      }
    """
  ] .
`;

const SPARQL_CONSTRAINT_DATA_VIOLATION = `
@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:email "a@example.org" .
ex:bob   a ex:Person ; ex:email "a@example.org" .
`;

const SPARQL_CONSTRAINT_DATA_CONFORMS = `
@prefix ex: <http://example.org/> .
ex:alice a ex:Person ; ex:email "alice@example.org" .
ex:bob   a ex:Person ; ex:email "bob@example.org" .
`;

describe("validateShacl: sh:sparql constraint", () => {
  it("reports a violation when the SPARQL constraint is triggered", async () => {
    const fs = makeFs({
      "/shapes.ttl": SPARQL_CONSTRAINT_SHAPE,
      "/data.ttl":   SPARQL_CONSTRAINT_DATA_VIOLATION,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.conforms).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("includes the custom sh:message in the violation", async () => {
    const fs = makeFs({
      "/shapes.ttl": SPARQL_CONSTRAINT_SHAPE,
      "/data.ttl":   SPARQL_CONSTRAINT_DATA_VIOLATION,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations[0].message).toContain("unique");
  });

  it("conforms when the SPARQL constraint is not triggered", async () => {
    const fs = makeFs({
      "/shapes.ttl": SPARQL_CONSTRAINT_SHAPE,
      "/data.ttl":   SPARQL_CONSTRAINT_DATA_CONFORMS,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.conforms).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
