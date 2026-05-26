/**
 * Unit tests for find-files.ts
 *
 * `node:fs` is mocked at the module level. Each test configures `readdirSync`
 * and `statSync` via a small `mockFs` helper that accepts a directory tree
 * expressed as a plain object.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { findByExtensions, findByFullSuffix, RDF_EXTENSIONS, QUERY_EXTENSIONS, SHACL_EXTENSIONS, IGNORE_DIRS } from "../find-files.js";

vi.mock("node:fs", () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

type FakeEntry = { name: string; isDirectory: boolean };

/**
 * Stubs `readdirSync` and `statSync` from a plain tree description.
 * Keys are absolute directory paths; values are their direct children.
 */
function mockFs(tree: Record<string, FakeEntry[]>) {
  vi.mocked(readdirSync).mockImplementation((dir) => {
    const entries = tree[String(dir)];
    if (!entries) throw Object.assign(new Error(`ENOENT: ${dir}`), { code: "ENOENT" });
    return entries.map((e) => e.name) as any;
  });

  vi.mocked(statSync).mockImplementation((p) => {
    for (const [dir, entries] of Object.entries(tree)) {
      for (const entry of entries) {
        if (`${dir}/${entry.name}` === String(p)) {
          return { isDirectory: () => entry.isDirectory } as any;
        }
      }
    }
    throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("findByExtensions", () => {
  beforeEach(() => {
    vi.mocked(readdirSync).mockReset();
    vi.mocked(statSync).mockReset();
  });

  it("returns files whose extension is in the set", () => {
    mockFs({
      "/root": [
        { name: "data.ttl",  isDirectory: false },
        { name: "readme.md", isDirectory: false },
      ],
    });

    expect(findByExtensions("/root", new Set([".ttl"]))).toEqual(["/root/data.ttl"]);
  });

  it("recurses into subdirectories", () => {
    mockFs({
      "/root": [
        { name: "sub",      isDirectory: true },
        { name: "top.ttl",  isDirectory: false },
      ],
      "/root/sub": [
        { name: "nested.ttl", isDirectory: false },
      ],
    });

    const results = findByExtensions("/root", new Set([".ttl"]));
    expect(results).toContain("/root/top.ttl");
    expect(results).toContain("/root/sub/nested.ttl");
    expect(results).toHaveLength(2);
  });

  it("skips all directories listed in IGNORE_DIRS", () => {
    const tree: Record<string, FakeEntry[]> = {
      "/root": [...IGNORE_DIRS].map((name) => ({ name, isDirectory: true })),
    };
    // Add a file inside each ignored dir to prove they are never visited
    for (const ignored of IGNORE_DIRS) {
      tree[`/root/${ignored}`] = [{ name: "secret.ttl", isDirectory: false }];
    }
    mockFs(tree);

    expect(findByExtensions("/root", new Set([".ttl"]))).toHaveLength(0);
  });

  it("silently skips unreadable directories", () => {
    vi.mocked(readdirSync).mockImplementation((dir) => {
      if (String(dir) === "/root/bad") throw new Error("EACCES");
      if (String(dir) === "/root") return ["bad", "good.ttl"] as any;
      throw new Error(`ENOENT: ${dir}`);
    });
    vi.mocked(statSync).mockImplementation((p) => {
      if (String(p) === "/root/bad")    return { isDirectory: () => true  } as any;
      if (String(p) === "/root/good.ttl") return { isDirectory: () => false } as any;
      throw new Error(`ENOENT: ${p}`);
    });

    expect(findByExtensions("/root", new Set([".ttl"]))).toEqual(["/root/good.ttl"]);
  });

  it("silently skips entries whose stat call throws", () => {
    vi.mocked(readdirSync).mockReturnValue(["ghost.ttl"] as any);
    vi.mocked(statSync).mockImplementation(() => { throw new Error("ENOENT"); });

    expect(findByExtensions("/root", new Set([".ttl"]))).toHaveLength(0);
  });

  it("returns an empty array when no files match the extension set", () => {
    mockFs({
      "/root": [
        { name: "readme.md", isDirectory: false },
        { name: "script.js", isDirectory: false },
      ],
    });

    expect(findByExtensions("/root", new Set([".ttl"]))).toEqual([]);
  });

  it("matches multiple extensions in a single pass", () => {
    mockFs({
      "/root": [
        { name: "a.ttl",    isDirectory: false },
        { name: "b.rdf",    isDirectory: false },
        { name: "c.jsonld", isDirectory: false },
        { name: "d.txt",    isDirectory: false },
      ],
    });

    const results = findByExtensions("/root", new Set([".ttl", ".rdf", ".jsonld"]));
    expect(results).toHaveLength(3);
  });
});

describe("RDF_EXTENSIONS", () => {
  it.each([".ttl", ".rdf", ".n3", ".jsonld", ".trig", ".nq", ".nt"])(
    "contains %s",
    (ext) => expect(RDF_EXTENSIONS.has(ext)).toBe(true)
  );
});

describe("QUERY_EXTENSIONS", () => {
  it("contains .rq",     () => expect(QUERY_EXTENSIONS.has(".rq")).toBe(true));
  it("contains .sparql", () => expect(QUERY_EXTENSIONS.has(".sparql")).toBe(true));
});

describe("SHACL_EXTENSIONS", () => {
  it("contains .shacl.ttl",  () => expect(SHACL_EXTENSIONS.has(".shacl.ttl")).toBe(true));
  it("contains .shape.ttl",   () => expect(SHACL_EXTENSIONS.has(".shape.ttl")).toBe(true));
  it("contains .shapes.ttl",  () => expect(SHACL_EXTENSIONS.has(".shapes.ttl")).toBe(true));
});

describe("findByFullSuffix", () => {
  beforeEach(() => {
    vi.mocked(readdirSync).mockReset();
    vi.mocked(statSync).mockReset();
  });

  it("matches files ending with .shacl.ttl", () => {
    mockFs({
      "/root": [
        { name: "person.shacl.ttl", isDirectory: false },
        { name: "person.ttl",       isDirectory: false },
      ],
    });
    expect(findByFullSuffix("/root", SHACL_EXTENSIONS)).toEqual(["/root/person.shacl.ttl"]);
  });

  it("matches files ending with .shapes.ttl", () => {
    mockFs({
      "/root": [
        { name: "person.shapes.ttl", isDirectory: false },
        { name: "person.ttl",        isDirectory: false },
      ],
    });
    expect(findByFullSuffix("/root", SHACL_EXTENSIONS)).toEqual(["/root/person.shapes.ttl"]);
  });

  it("matches files ending with .shape.ttl", () => {
    mockFs({
      "/root": [
        { name: "person.shape.ttl", isDirectory: false },
        { name: "person.ttl",       isDirectory: false },
      ],
    });
    expect(findByFullSuffix("/root", SHACL_EXTENSIONS)).toEqual(["/root/person.shape.ttl"]);
  });

  it("matches all three suffixes in the same directory", () => {
    mockFs({
      "/root": [
        { name: "a.shacl.ttl",  isDirectory: false },
        { name: "b.shape.ttl",  isDirectory: false },
        { name: "c.shapes.ttl", isDirectory: false },
        { name: "d.ttl",        isDirectory: false },
      ],
    });
    const results = findByFullSuffix("/root", SHACL_EXTENSIONS);
    expect(results).toContain("/root/a.shacl.ttl");
    expect(results).toContain("/root/b.shape.ttl");
    expect(results).toContain("/root/c.shapes.ttl");
    expect(results).toHaveLength(3);
  });
});

describe("IGNORE_DIRS", () => {
  it.each(["node_modules", ".git", ".pi", ".agents"])(
    "contains %s",
    (dir) => expect(IGNORE_DIRS.has(dir)).toBe(true)
  );
});
