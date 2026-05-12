/**
 * Unit tests for resolve-sources.ts
 *
 * `node:fs` is mocked so `existsSync` can be controlled per-test without
 * touching the real filesystem.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { resolveSources } from "../resolve-sources.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function setExisting(...paths: string[]) {
  const set = new Set(paths);
  vi.mocked(existsSync).mockImplementation((p) => set.has(String(p)));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("resolveSources", () => {
  beforeEach(() => vi.mocked(existsSync).mockReset());

  it("converts an existing absolute path to a file:// URI", () => {
    setExisting("/data/graph.ttl");

    const { sources, missing } = resolveSources(["/data/graph.ttl"], "/any/cwd");

    expect(sources).toEqual(["file:///data/graph.ttl"]);
    expect(missing).toEqual([]);
  });

  it("resolves a relative path against cwd before building the URI", () => {
    setExisting("/project/data/graph.ttl");

    const { sources, missing } = resolveSources(["data/graph.ttl"], "/project");

    expect(sources).toEqual(["file:///project/data/graph.ttl"]);
    expect(missing).toEqual([]);
  });

  it("collects non-existent paths in the missing array", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { sources, missing } = resolveSources(["missing.ttl"], "/project");

    expect(sources).toHaveLength(0);
    expect(missing).toEqual(["/project/missing.ttl"]);
  });

  it("separates found and missing files correctly", () => {
    setExisting("/project/found.ttl");

    const { sources, missing } = resolveSources(["found.ttl", "missing.ttl"], "/project");

    expect(sources).toEqual(["file:///project/found.ttl"]);
    expect(missing).toEqual(["/project/missing.ttl"]);
  });

  it("returns empty arrays for an empty input list", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { sources, missing } = resolveSources([], "/project");

    expect(sources).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("handles multiple files that all exist", () => {
    setExisting("/p/a.ttl", "/p/b.ttl", "/p/c.rdf");

    const { sources, missing } = resolveSources(["a.ttl", "b.ttl", "c.rdf"], "/p");

    expect(sources).toHaveLength(3);
    expect(missing).toHaveLength(0);
    expect(sources).toContain("file:///p/a.ttl");
    expect(sources).toContain("file:///p/b.ttl");
    expect(sources).toContain("file:///p/c.rdf");
  });

  it("all paths in sources start with file://", () => {
    setExisting("/p/a.ttl", "/p/b.rdf");

    const { sources } = resolveSources(["a.ttl", "b.rdf"], "/p");

    for (const src of sources) {
      expect(src).toMatch(/^file:\/\//);
    }
  });

  it("missing paths are absolute, not relative", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { missing } = resolveSources(["rel/path.ttl"], "/cwd");

    expect(missing[0]).toMatch(/^\//);
    expect(missing[0]).toBe("/cwd/rel/path.ttl");
  });
});
