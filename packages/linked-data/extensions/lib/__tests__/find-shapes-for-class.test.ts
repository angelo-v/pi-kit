/**
 * Unit tests for find-shapes-for-class.ts
 *
 * The RunQueryFn is injected so no real SPARQL execution or filesystem I/O
 * occurs. Fixtures are inline records that mimic what the Comunica CLI would
 * return as parsed JSON rows.
 */

import { describe, it, expect } from "vitest";
import {
  buildShapesQuery,
  findShapesForClass,
  formatFindShapesResult,
  type FindShapesResult,
  type RunQueryFn,
} from "../find-shapes-for-class.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLASS_IRI   = "http://example.org/Person";
const SHAPE_IRI   = "http://example.org/PersonShape";
const SOURCE_FILE = "file:///workspace/shapes/person.shacl.ttl";

function makeRunner(rows: Array<Record<string, string>>): RunQueryFn {
  return async (_query, _sources) => rows;
}

// ── buildShapesQuery ──────────────────────────────────────────────────────────

describe("buildShapesQuery", () => {
  it("includes the target class IRI in the query", () => {
    const q = buildShapesQuery(CLASS_IRI);
    expect(q).toContain(CLASS_IRI);
  });

  it("queries sh:targetClass", () => {
    const q = buildShapesQuery(CLASS_IRI);
    expect(q).toContain("sh:targetClass");
  });

  it("selects ?shape and ?targetClass variables", () => {
    const q = buildShapesQuery(CLASS_IRI);
    expect(q).toContain("?shape");
    expect(q).toContain("?targetClass");
  });

  it("covers both sh:targetClass and implicit class target via UNION", () => {
    const q = buildShapesQuery(CLASS_IRI);
    expect(q).toContain("UNION");
  });
});

// ── findShapesForClass: no source files ───────────────────────────────────────

describe("findShapesForClass: no source files", () => {
  it("returns an empty shapes array when sourceFiles is empty", async () => {
    const runner = makeRunner([
      { shape: SHAPE_IRI, targetClass: CLASS_IRI },
    ]);
    const result = await findShapesForClass(CLASS_IRI, [], runner);
    expect(result.shapes).toHaveLength(0);
  });

  it("returns the correct classIri even when sourceFiles is empty", async () => {
    const runner = makeRunner([]);
    const result = await findShapesForClass(CLASS_IRI, [], runner);
    expect(result.classIri).toBe(CLASS_IRI);
  });
});

// ── findShapesForClass: shapes found ─────────────────────────────────────────

describe("findShapesForClass: shapes found", () => {
  it("maps each result row to a DiscoveredShape", async () => {
    const runner = makeRunner([
      { shape: SHAPE_IRI, targetClass: CLASS_IRI },
    ]);
    const result = await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(result.shapes).toHaveLength(1);
  });

  it("sets the shapeIri from the ?shape binding", async () => {
    const runner = makeRunner([
      { shape: SHAPE_IRI, targetClass: CLASS_IRI },
    ]);
    const result = await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(result.shapes[0].shapeIri).toBe(SHAPE_IRI);
  });

  it("sets the targetClass from the ?targetClass binding", async () => {
    const runner = makeRunner([
      { shape: SHAPE_IRI, targetClass: CLASS_IRI },
    ]);
    const result = await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(result.shapes[0].targetClass).toBe(CLASS_IRI);
  });

  it("derives sourceFile by stripping file:// from the URI", async () => {
    const runner = makeRunner([
      { shape: SHAPE_IRI, targetClass: CLASS_IRI },
    ]);
    const result = await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(result.shapes[0].sourceFile).toBe("/workspace/shapes/person.shacl.ttl");
  });

  it("returns multiple shapes when multiple rows are returned", async () => {
    const runner = makeRunner([
      { shape: "http://example.org/ShapeA", targetClass: CLASS_IRI },
      { shape: "http://example.org/ShapeB", targetClass: CLASS_IRI },
    ]);
    const result = await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(result.shapes).toHaveLength(2);
    expect(result.shapes[0].shapeIri).toBe("http://example.org/ShapeA");
    expect(result.shapes[1].shapeIri).toBe("http://example.org/ShapeB");
  });

  it("passes the query to the runner", async () => {
    let capturedQuery = "";
    const runner: RunQueryFn = async (q, _s) => {
      capturedQuery = q;
      return [{ shape: SHAPE_IRI, targetClass: CLASS_IRI }];
    };
    await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(capturedQuery).toContain(CLASS_IRI);
  });

  it("passes all source files to the runner", async () => {
    let capturedSources: string[] = [];
    const extraSource = "file:///workspace/shapes/extra.shacl.ttl";
    const runner: RunQueryFn = async (_q, s) => {
      capturedSources = s;
      return [];
    };
    await findShapesForClass(CLASS_IRI, [SOURCE_FILE, extraSource], runner);
    expect(capturedSources).toContain(SOURCE_FILE);
    expect(capturedSources).toContain(extraSource);
  });
});

// ── findShapesForClass: no results ────────────────────────────────────────────

describe("findShapesForClass: no results", () => {
  it("returns an empty shapes array when the runner returns no rows", async () => {
    const runner = makeRunner([]);
    const result = await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(result.shapes).toHaveLength(0);
  });

  it("still includes the classIri in the result", async () => {
    const runner = makeRunner([]);
    const result = await findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner);
    expect(result.classIri).toBe(CLASS_IRI);
  });
});

// ── findShapesForClass: runner error propagation ──────────────────────────────

describe("findShapesForClass: runner errors", () => {
  it("propagates errors thrown by the runner", async () => {
    const runner: RunQueryFn = async () => {
      throw new Error("SPARQL execution failed");
    };
    await expect(
      findShapesForClass(CLASS_IRI, [SOURCE_FILE], runner)
    ).rejects.toThrow("SPARQL execution failed");
  });
});

// ── formatFindShapesResult: no shapes ────────────────────────────────────────

describe("formatFindShapesResult: no shapes", () => {
  it("mentions the class IRI", () => {
    const result: FindShapesResult = { classIri: CLASS_IRI, shapes: [] };
    expect(formatFindShapesResult(result, [SOURCE_FILE])).toContain(CLASS_IRI);
  });

  it("says no shapes were found", () => {
    const result: FindShapesResult = { classIri: CLASS_IRI, shapes: [] };
    expect(formatFindShapesResult(result, [SOURCE_FILE])).toContain("No SHACL shapes");
  });

  it("lists the searched files", () => {
    const result: FindShapesResult = { classIri: CLASS_IRI, shapes: [] };
    expect(formatFindShapesResult(result, [SOURCE_FILE])).toContain(SOURCE_FILE);
  });
});

// ── formatFindShapesResult: shapes found ─────────────────────────────────────

describe("formatFindShapesResult: shapes found", () => {
  const result: FindShapesResult = {
    classIri: CLASS_IRI,
    shapes: [
      {
        shapeIri: SHAPE_IRI,
        targetClass: CLASS_IRI,
        sourceFile: "/workspace/shapes/person.shacl.ttl",
      },
    ],
  };

  it("includes the shape IRI in the output", () => {
    expect(formatFindShapesResult(result, [SOURCE_FILE])).toContain(SHAPE_IRI);
  });

  it("includes the target class IRI in the output", () => {
    expect(formatFindShapesResult(result, [SOURCE_FILE])).toContain(CLASS_IRI);
  });

  it("includes the source file path in the output", () => {
    expect(formatFindShapesResult(result, [SOURCE_FILE])).toContain(
      "/workspace/shapes/person.shacl.ttl"
    );
  });

  it("reports the correct shape count", () => {
    expect(formatFindShapesResult(result, [SOURCE_FILE])).toContain("1 shape");
  });

  it("uses plural 'shapes' for multiple results", () => {
    const multiResult: FindShapesResult = {
      classIri: CLASS_IRI,
      shapes: [
        { shapeIri: "http://ex.org/A", targetClass: CLASS_IRI, sourceFile: "/a.ttl" },
        { shapeIri: "http://ex.org/B", targetClass: CLASS_IRI, sourceFile: "/b.ttl" },
      ],
    };
    expect(formatFindShapesResult(multiResult, [SOURCE_FILE])).toContain("2 shapes");
  });
});
