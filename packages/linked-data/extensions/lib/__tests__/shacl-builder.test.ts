/**
 * Unit tests for shacl-builder.ts
 *
 * All tests are pure (no I/O).  They call the exported helpers directly and
 * assert on the returned Turtle strings.
 */

import { describe, it, expect } from "vitest";
import {
  localName,
  buildPropertyShapeBody,
  buildNodeShape,
  type NodeShapeSpec,
  type PropertyShapeSpec,
} from "../shacl-builder.js";

// ── localName ─────────────────────────────────────────────────────────────────

describe("localName", () => {
  it("extracts the local name from a prefixed IRI", () => {
    expect(localName("ex:PersonShape")).toBe("PersonShape");
  });

  it("extracts the local name from a slash IRI", () => {
    expect(localName("<http://example.org/PersonShape>")).toBe("PersonShape");
  });

  it("extracts the local name from a hash IRI", () => {
    expect(localName("<http://example.org/shapes#PersonShape>")).toBe("PersonShape");
  });

  it("returns the full string if there is no separator", () => {
    expect(localName("PersonShape")).toBe("PersonShape");
  });
});

// ── buildPropertyShapeBody ────────────────────────────────────────────────────

describe("buildPropertyShapeBody", () => {
  const minimalProp: PropertyShapeSpec = {
    name: "email",
    path: "ex:email",
  };

  it("always emits sh:path as the first line", () => {
    const lines = buildPropertyShapeBody(minimalProp);
    expect(lines[0]).toBe("sh:path ex:email ;");
  });

  it("always emits sh:name as the second line", () => {
    const lines = buildPropertyShapeBody(minimalProp);
    // When name is the last constraint the trailing semicolon is stripped.
    expect(lines[1]).toMatch(/^sh:name "email"/);
  });

  it("does not emit optional constraints when absent", () => {
    const lines = buildPropertyShapeBody(minimalProp);
    const joined = lines.join("\n");
    expect(joined).not.toContain("sh:datatype");
    expect(joined).not.toContain("sh:minCount");
    expect(joined).not.toContain("sh:maxCount");
    expect(joined).not.toContain("sh:pattern");
  });

  it("emits sh:datatype when provided", () => {
    const prop: PropertyShapeSpec = { ...minimalProp, datatype: "xsd:string" };
    const lines = buildPropertyShapeBody(prop);
    expect(lines.join("\n")).toContain("sh:datatype xsd:string");
  });

  it("emits sh:minCount when provided", () => {
    const prop: PropertyShapeSpec = { ...minimalProp, minCount: 1 };
    const lines = buildPropertyShapeBody(prop);
    expect(lines.join("\n")).toContain("sh:minCount 1");
  });

  it("emits sh:maxCount when provided", () => {
    const prop: PropertyShapeSpec = { ...minimalProp, maxCount: 3 };
    const lines = buildPropertyShapeBody(prop);
    expect(lines.join("\n")).toContain("sh:maxCount 3");
  });

  it("emits sh:pattern when provided", () => {
    const prop: PropertyShapeSpec = { ...minimalProp, pattern: "^[a-z]+$" };
    const lines = buildPropertyShapeBody(prop);
    expect(lines.join("\n")).toContain('sh:pattern "^[a-z]+$"');
  });

  it("emits sh:minLength and sh:maxLength when provided", () => {
    const prop: PropertyShapeSpec = { ...minimalProp, minLength: 2, maxLength: 50 };
    const joined = buildPropertyShapeBody(prop).join("\n");
    expect(joined).toContain("sh:minLength 2");
    expect(joined).toContain("sh:maxLength 50");
  });

  it("emits sh:nodeKind when provided", () => {
    const prop: PropertyShapeSpec = { ...minimalProp, nodeKind: "sh:IRI" };
    const lines = buildPropertyShapeBody(prop);
    expect(lines.join("\n")).toContain("sh:nodeKind sh:IRI");
  });

  it("emits sh:class when classConstraint is provided", () => {
    const prop: PropertyShapeSpec = { ...minimalProp, classConstraint: "ex:Address" };
    const lines = buildPropertyShapeBody(prop);
    expect(lines.join("\n")).toContain("sh:class ex:Address");
  });

  it("the last line does not end with a semicolon", () => {
    const lines = buildPropertyShapeBody(minimalProp);
    expect(lines[lines.length - 1]).not.toMatch(/ ;$/);
  });

  it("all lines except the last end with a semicolon", () => {
    const prop: PropertyShapeSpec = {
      ...minimalProp,
      datatype: "xsd:string",
      minCount: 1,
    };
    const lines = buildPropertyShapeBody(prop);
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i]).toMatch(/ ;$/);
    }
  });
});

// ── buildNodeShape ────────────────────────────────────────────────────────────

describe("buildNodeShape", () => {
  const minimalSpec: NodeShapeSpec = {
    shapeIri: "ex:PersonShape",
    properties: [],
  };

  it("returns a suggestedFileName derived from the shape IRI local name", () => {
    const { suggestedFileName } = buildNodeShape(minimalSpec);
    expect(suggestedFileName).toBe("PersonShape.ttl");
  });

  it("turtle always includes the sh: prefix declaration", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    expect(turtle).toContain("@prefix sh:");
  });

  it("turtle always includes the xsd: prefix declaration", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    expect(turtle).toContain("@prefix xsd:");
  });

  it("turtle declares the shape IRI as a sh:NodeShape", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    expect(turtle).toContain("ex:PersonShape");
    expect(turtle).toContain("a sh:NodeShape");
  });

  it("includes sh:targetClass when provided", () => {
    const spec: NodeShapeSpec = { ...minimalSpec, targetClass: "ex:Person" };
    const { turtle } = buildNodeShape(spec);
    expect(turtle).toContain("sh:targetClass ex:Person");
  });

  it("does not include sh:targetClass when omitted", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    expect(turtle).not.toContain("sh:targetClass");
  });

  it("includes rdfs:label when label is provided", () => {
    const spec: NodeShapeSpec = { ...minimalSpec, label: "Person Shape" };
    const { turtle } = buildNodeShape(spec);
    expect(turtle).toContain('rdfs:label "Person Shape"');
  });

  it("does not include rdfs:label when omitted", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    expect(turtle).not.toContain("rdfs:label");
  });

  it("includes sh:property blocks for each property", () => {
    const spec: NodeShapeSpec = {
      shapeIri: "ex:PersonShape",
      properties: [
        { name: "email", path: "ex:email" },
        { name: "name", path: "foaf:name" },
      ],
    };
    const { turtle } = buildNodeShape(spec);
    expect(turtle.match(/sh:property/g)?.length).toBe(2);
  });

  it("auto-detects custom prefixes used in the spec", () => {
    const spec: NodeShapeSpec = {
      shapeIri: "ex:PersonShape",
      targetClass: "ex:Person",
      properties: [{ name: "email", path: "ex:email" }],
    };
    const { turtle } = buildNodeShape(spec);
    expect(turtle).toContain("@prefix ex:");
  });

  it("accepts caller-provided prefix IRIs via extraPrefixes", () => {
    const spec: NodeShapeSpec = {
      shapeIri: "ex:PersonShape",
      properties: [],
    };
    const { turtle } = buildNodeShape(spec, { ex: "http://schema.example.org/" });
    expect(turtle).toContain("<http://schema.example.org/>");
  });

  it("turtle is valid enough to contain at least one @prefix and one sh:NodeShape", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    expect(turtle).toContain("@prefix");
    expect(turtle).toContain("sh:NodeShape");
  });

  it("the Turtle string ends with a newline", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    expect(turtle.endsWith("\n")).toBe(true);
  });

  it("the shape block ends with a period (valid Turtle)", () => {
    const { turtle } = buildNodeShape(minimalSpec);
    // Last non-empty line must end with "."
    const lines = turtle.split("\n").filter((l) => l.trim());
    expect(lines[lines.length - 1].trim()).toMatch(/\.$/);
  });

  it("the shape block ends with a period when properties are present", () => {
    const spec: NodeShapeSpec = {
      shapeIri: "ex:PersonShape",
      properties: [{ name: "name", path: "ex:name", minCount: 1 }],
    };
    const { turtle } = buildNodeShape(spec);
    const lines = turtle.split("\n").filter((l) => l.trim());
    expect(lines[lines.length - 1].trim()).toMatch(/\.$/);
  });

  it("intermediate property blocks end with a semicolon", () => {
    const spec: NodeShapeSpec = {
      shapeIri: "ex:PersonShape",
      properties: [
        { name: "email", path: "ex:email" },
        { name: "name", path: "ex:name" },
      ],
    };
    const { turtle } = buildNodeShape(spec);
    // Find the first closing bracket — it should be followed by ";"
    const firstClose = turtle.indexOf("]");
    expect(turtle.slice(firstClose, firstClose + 3)).toMatch(/\] ;/);
  });

  it("does not duplicate standard prefixes when custom prefixes overlap", () => {
    const spec: NodeShapeSpec = {
      shapeIri: "sh:MyShape",
      properties: [],
    };
    const { turtle } = buildNodeShape(spec);
    const shCount = (turtle.match(/@prefix sh:/g) ?? []).length;
    expect(shCount).toBe(1);
  });
});
