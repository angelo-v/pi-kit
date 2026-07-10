/**
 * Unit tests for writeRdf().
 *
 * The filesystem is injected via `FsAdapter` so no real files are touched.
 * Parse and serialisation logic is exercised via rdf-parse / rdf-serialize;
 * the tests here focus on the orchestration layer.
 */

import { describe, it, expect, vi } from "vitest";
import { writeRdf } from "../rdf-write.js";
import type { FsAdapter } from "../rdf-write.js";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Creates a no-op FsAdapter spy for verifying write calls. */
function makeFakeFs(): FsAdapter {
  return {
    mkdir:     vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
}

const ONE_TRIPLE_TTL = `
  @prefix ex: <http://example.org/> .
  ex:alice a ex:Person .
`;

const TWO_TRIPLE_TTL = `
  @prefix ex: <http://example.org/> .
  ex:alice a ex:Person .
  ex:bob   a ex:Person .
`;

// ── result shape ──────────────────────────────────────────────────────────────

describe("writeRdf: result", () => {
  it("returns the correct tripleCount", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.ttl" }, fs);
    expect(result.tripleCount).toBe(1);
  });

  it("returns the correct tripleCount for multiple triples", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: TWO_TRIPLE_TTL, path: "out.ttl" }, fs);
    expect(result.tripleCount).toBe(2);
  });

  it("returns the inferred format when no explicit format is given", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.nt" }, fs);
    expect(result.format).toBe("ntriples");
  });

  it("returns the explicit format when one is provided", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf(
      { turtle: ONE_TRIPLE_TTL, path: "out.ttl", format: "jsonld" },
      fs
    );
    expect(result.format).toBe("jsonld");
  });

  it("summary contains the triple count", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.ttl" }, fs);
    expect(result.summary).toContain("1 triple");
  });

  it("summary uses plural 'triples' for more than one triple", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: TWO_TRIPLE_TTL, path: "out.ttl" }, fs);
    expect(result.summary).toContain("2 triples");
  });

  it("summary contains the destination path", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "output/graph.ttl" }, fs);
    expect(result.summary).toContain("output/graph.ttl");
  });

  it("summary contains the human-readable format label", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.nt" }, fs);
    expect(result.summary).toContain("N-Triples");
  });
});

// ── path resolution ───────────────────────────────────────────────────────────

describe("writeRdf: path resolution", () => {
  it("resolves a relative path against cwd", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf(
      { turtle: ONE_TRIPLE_TTL, path: "sub/out.ttl", cwd: "/workspace" },
      fs
    );
    expect(result.absPath).toBe("/workspace/sub/out.ttl");
  });

  it("returns an absolute absPath even when path is relative", async () => {
    const fs = makeFakeFs();
    const result = await writeRdf(
      { turtle: ONE_TRIPLE_TTL, path: "out.ttl", cwd: "/workspace" },
      fs
    );
    expect(result.absPath).toMatch(/^\//);
  });
});

// ── filesystem interactions ───────────────────────────────────────────────────

describe("writeRdf: filesystem interactions", () => {
  it("calls mkdir with recursive: true before writing", async () => {
    const fs = makeFakeFs();
    await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "a/b/out.ttl", cwd: "/ws" }, fs);
    expect(fs.mkdir).toHaveBeenCalledWith("/ws/a/b", { recursive: true });
  });

  it("calls writeFile with the resolved absolute path", async () => {
    const fs = makeFakeFs();
    await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.ttl", cwd: "/ws" }, fs);
    expect(fs.writeFile).toHaveBeenCalledWith("/ws/out.ttl", expect.any(String), "utf8");
  });

  it("writes non-empty content to disk", async () => {
    const fs = makeFakeFs();
    await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.ttl", cwd: "/ws" }, fs);
    const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it("creates parent directories before writing", async () => {
    const fs = makeFakeFs();
    const mkdirOrder: number[] = [];
    const writeOrder: number[] = [];
    let call = 0;
    vi.mocked(fs.mkdir).mockImplementation(async () => { mkdirOrder.push(call++); });
    vi.mocked(fs.writeFile).mockImplementation(async () => { writeOrder.push(call++); });

    await writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.ttl", cwd: "/ws" }, fs);

    expect(mkdirOrder[0]).toBeLessThan(writeOrder[0]);
  });
});

// ── format inference ──────────────────────────────────────────────────────────

describe("writeRdf: format inference from extension", () => {
  it.each<[string, string]>([
    ["out.ttl",    "turtle"],
    ["out.jsonld", "jsonld"],
    ["out.nt",     "ntriples"],
    ["out.nq",     "nquads"],
  ])("infers %s as %s", async (file, expectedFormat) => {
    const fs = makeFakeFs();
    const result = await writeRdf({ turtle: ONE_TRIPLE_TTL, path: file }, fs);
    expect(result.format).toBe(expectedFormat);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe("writeRdf: error handling", () => {
  it("rejects with an error when Turtle is syntactically invalid", async () => {
    const fs = makeFakeFs();
    await expect(
      writeRdf({ turtle: "this is not valid turtle!!!", path: "out.ttl" }, fs)
    ).rejects.toThrow();
  });

  it("does not call writeFile when parsing fails", async () => {
    const fs = makeFakeFs();
    await writeRdf({ turtle: "invalid", path: "out.ttl" }, fs).catch(() => {});
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("propagates writeFile errors", async () => {
    const fs = makeFakeFs();
    vi.mocked(fs.writeFile).mockRejectedValue(new Error("ENOSPC: disk full"));
    await expect(
      writeRdf({ turtle: ONE_TRIPLE_TTL, path: "out.ttl", cwd: "/ws" }, fs)
    ).rejects.toThrow("ENOSPC: disk full");
  });
});

describe("writeRdf: relative URIs", () => {
  const RELATIVE_TTL = `
    @prefix schema: <http://schema.org/> .
    @prefix : <#> .

    :it a schema:Article ;
        schema:author </contacts/jane-doe.ttl#this> ;
        schema:about </orgs/acme.ttl#it> ;
        schema:url <https://example.org/foo> ;
        schema:name "Test" .
  `;

  it("preserves relative URIs instead of expanding them against an 'undefined' base", async () => {
    const fs = makeFakeFs();
    await writeRdf({ turtle: RELATIVE_TTL, path: "out.ttl", cwd: "/ws" }, fs);

    const [, content] = vi.mocked(fs.writeFile).mock.calls[0] as [string, string];

    // Bug signature: the literal "undefined" base must never leak into IRIs.
    expect(content).not.toContain("undefined");

    // Relative references must survive as relative IRIs, not be absolutized
    // against some default base (which would still be wrong per AGENTS.md).
    expect(content).toContain("contacts/jane-doe.ttl#this");
    expect(content).not.toMatch(/https?:\/\/[^>]*contacts\/jane-doe\.ttl#this/);
    expect(content).toContain("orgs/acme.ttl#it");
    expect(content).not.toMatch(/https?:\/\/[^>]*orgs\/acme\\.ttl#strategy/);

    // Absolute URIs are unaffected (control — already worked before the bug).
    expect(content).toContain("https://example.org/foo");
  });
});
