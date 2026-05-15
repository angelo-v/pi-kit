import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateShacl,
  type FsReadAdapter,
} from "../shacl-validate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...parts: string[]) => join(__dirname, "fixtures", ...parts);

// ── Inline Turtle fixtures (mirrors the bug-report reproduction) ─────────────

/**
 * Shape with:
 *   - sh:SPARQLTarget using FILTER NOT EXISTS
 *   - sh:in list (creates rdf:first/rdf:rest blank nodes in the shapes graph)
 */
const ACTION_SHAPE = `
@prefix sh:     <http://www.w3.org/ns/shacl#> .
@prefix schema: <https://schema.org/> .
@prefix ex:     <http://example.org/> .

ex:ActionShape a sh:NodeShape ;
    sh:target [
        a sh:SPARQLTarget ;
        sh:select """
            PREFIX schema: <https://schema.org/>
            SELECT ?this WHERE {
                ?this a schema:Action .
                FILTER NOT EXISTS { ?this a schema:Intangible . }
            }
        """ ;
    ] ;
    sh:property [
        sh:path schema:name ;
        sh:minCount 1 ;
        sh:message "name is required" ;
    ] ;
    sh:property [
        sh:path schema:actionStatus ;
        sh:minCount 1 ;
        sh:in ( schema:CompletedActionStatus schema:ActiveActionStatus ) ;
        sh:message "status must be valid" ;
    ] .
`;

/** Valid data: ex:act1 satisfies all constraints. */
const ACTION_DATA_CONFORMS = `
@prefix schema: <https://schema.org/> .
@prefix ex:     <http://example.org/> .

ex:act1 a schema:Action ;
    schema:name "Do something" ;
    schema:actionStatus schema:CompletedActionStatus .
`;

function makeFs(files: Record<string, string>): FsReadAdapter {
  return {
    readFile: async (path) => {
      if (path in files) return files[path];
      throw new Error(`ENOENT: ${path}`);
    },
  };
}

// ── Unit tests (inline fixtures, no disk I/O) ────────────────────────────────

describe("bug: blank nodes from sh:in list bleed into data dataset (unit)", () => {
  it("conforms when the only data node satisfies all constraints", async () => {
    // This is the core regression: with the bug, sh:in blank nodes leak into
    // the data graph and trigger spurious violations, causing conforms=false.
    const fs = makeFs({
      "/shapes.ttl": ACTION_SHAPE,
      "/data.ttl":   ACTION_DATA_CONFORMS,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.conforms).toBe(true);
  });

  it("reports zero violations when data satisfies all constraints", async () => {
    const fs = makeFs({
      "/shapes.ttl": ACTION_SHAPE,
      "/data.ttl":   ACTION_DATA_CONFORMS,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    expect(result.violations).toHaveLength(0);
  });

  it("does not produce violations on blank-node focus nodes", async () => {
    // Blank nodes (e.g. 'bc_0_n3-1') must never appear as focus nodes.
    const fs = makeFs({
      "/shapes.ttl": ACTION_SHAPE,
      "/data.ttl":   ACTION_DATA_CONFORMS,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    // A blank-node focus value has no scheme (not a full IRI), or the
    // engine represents it with a generated label like "bc_0_n3-1".
    // Either way it will not contain "http" or "ex:act1".
    const blankNodeViolations = result.violations.filter(
      (v) => !v.focusNode.startsWith("http")
    );
    expect(blankNodeViolations).toHaveLength(0);
  });

  it("only selects named data IRIs as focus nodes", async () => {
    const fs = makeFs({
      "/shapes.ttl": ACTION_SHAPE,
      "/data.ttl":   ACTION_DATA_CONFORMS,
    });
    const result = await validateShacl(
      { dataFiles: ["/data.ttl"], shapesFiles: ["/shapes.ttl"] },
      fs
    );
    // ex:act1 is the only data node; all focus nodes (if any violations
    // existed) must be full IRIs, not blank-node labels.
    for (const v of result.violations) {
      expect(v.focusNode).toMatch(/^https?:\/\//);
    }
  });
});

// ── Integration tests (fixture files on disk) ────────────────────────────────

describe("bug: blank nodes from sh:in list bleed into data dataset (integration)", () => {
  it("conforms when the only data node satisfies all constraints", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-blanknodes-sparql-target.data.ttl")],
      shapesFiles: [F("shacl-blanknodes-sparql-target.shapes.ttl")],
    });
    expect(result.conforms).toBe(true);
  });

  it("reports zero violations when data satisfies all constraints", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-blanknodes-sparql-target.data.ttl")],
      shapesFiles: [F("shacl-blanknodes-sparql-target.shapes.ttl")],
    });
    expect(result.violations).toHaveLength(0);
  });

  it("does not produce violations on blank-node focus nodes", async () => {
    const result = await validateShacl({
      dataFiles:   [F("shacl-blanknodes-sparql-target.data.ttl")],
      shapesFiles: [F("shacl-blanknodes-sparql-target.shapes.ttl")],
    });
    const blankNodeViolations = result.violations.filter(
      (v) => !v.focusNode.startsWith("http")
    );
    expect(blankNodeViolations).toHaveLength(0);
  });
});
