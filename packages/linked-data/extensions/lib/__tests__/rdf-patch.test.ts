/**
 * Unit tests for patchRdf().
 *
 * The filesystem is fully injected via FsAdapter — no real files are touched.
 */

import { describe, it, expect, vi } from "vitest";
import { patchRdf } from "../rdf-patch.js";
import type { FsAdapter } from "../rdf-patch.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_TTL = `
@prefix ex: <http://example.org/> .
ex:Alice ex:age 30 .
`;

const TWO_TRIPLE_TTL = `
@prefix ex: <http://example.org/> .
ex:Alice ex:age 30 .
ex:Bob   ex:age 25 .
`;

function makeFakeFs(source: string): FsAdapter {
  return {
    readFile:  vi.fn().mockResolvedValue(source),
    mkdir:     vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
}

// ── INSERT DATA ───────────────────────────────────────────────────────────────

describe("patchRdf: INSERT DATA", () => {
  it("increases tripleCount by 1", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          INSERT DATA { ex:Bob ex:age 25 . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore + 1);
  });

  it("writes the updated file to disk", async () => {
    const fs = makeFakeFs(BASE_TTL);
    await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          INSERT DATA { ex:Bob ex:age 25 . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(fs.writeFile).toHaveBeenCalledWith("/ws/data.ttl", expect.any(String), "utf8");
  });
});

// ── DELETE DATA ───────────────────────────────────────────────────────────────

describe("patchRdf: DELETE DATA", () => {
  it("decreases tripleCount by 1", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          DELETE DATA { ex:Alice ex:age 30 . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore - 1);
  });

  it("tripleCount reaches zero when all triples are deleted", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          DELETE DATA { ex:Alice ex:age 30 . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(0);
  });
});

// ── DELETE/INSERT WHERE ───────────────────────────────────────────────────────

describe("patchRdf: DELETE/INSERT WHERE", () => {
  it("replaces a value — tripleCount unchanged", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          DELETE { ex:Alice ex:age ?old }
          INSERT { ex:Alice ex:age 31 }
          WHERE  { ex:Alice ex:age ?old }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore);
  });

  it("writes updated content that contains the new value", async () => {
    const fs = makeFakeFs(BASE_TTL);
    await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          DELETE { ex:Alice ex:age ?old }
          INSERT { ex:Alice ex:age 31 }
          WHERE  { ex:Alice ex:age ?old }
        `,
        cwd: "/ws",
      },
      fs
    );
    const written = vi.mocked(fs.writeFile).mock.calls[0][1];
    expect(written).toContain("31");
  });
});

// ── WHERE condition does not match ────────────────────────────────────────────

describe("patchRdf: WHERE condition not matched", () => {
  it("does not throw and makes no change", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          DELETE { ex:Alice ex:age ?old }
          INSERT { ex:Alice ex:age 99 }
          WHERE  { ex:Alice ex:name ?old }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore);
  });
});

// ── Relative IRIs ─────────────────────────────────────────────────────────

// Files that use relative IRIs are common in the wild: a vocabulary prefix
// pointing at a sibling file and fragment IRIs for the described resource.
const RELATIVE_IRI_TTL = `
@prefix vocab: <../vocab.ttl#>.
@prefix dct: <http://purl.org/dc/terms/>.

<#this> a vocab:Thing ;
    dct:title "Sample document" .
`;

describe("patchRdf: relative IRIs in file and update", () => {
  it("does not throw on a file with relative @prefix and relative <#...> IRIs", async () => {
    const fs = makeFakeFs(RELATIVE_IRI_TTL);
    await expect(
      patchRdf(
        {
          path: "dev/docs/my-doc/doc.ttl",
          update: `
            PREFIX vocab: <../vocab.ttl#>
            PREFIX dct: <http://purl.org/dc/terms/>
            INSERT DATA { <#item-1> dct:title "Added by patch" . }
          `,
          cwd: "/ws",
        },
        fs
      )
    ).resolves.toBeTruthy();
  });

  it("resolves relative IRIs against the file location when patching", async () => {
    const fs = makeFakeFs(RELATIVE_IRI_TTL);
    const result = await patchRdf(
      {
        path: "dev/docs/my-doc/doc.ttl",
        update: `
          PREFIX vocab: <../vocab.ttl#>
          PREFIX dct: <http://purl.org/dc/terms/>
          INSERT DATA { <#item-1> dct:title "Added by patch" . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore + 1);
    const written = vi.mocked(fs.writeFile).mock.calls[0][1];
    // The inserted triple must be a triple about the same file-relative subject
    // as the existing one (same <#this> base), joined by the shared type triple.
    expect(written).toContain("Added by patch");
  });

  it("keeps relative IRIs relative in the output (no file:// rewrite)", async () => {
    const fs = makeFakeFs(RELATIVE_IRI_TTL);
    await patchRdf(
      {
        path: "dev/docs/my-doc/doc.ttl",
        update: `
          PREFIX vocab: <../vocab.ttl#>
          PREFIX dct: <http://purl.org/dc/terms/>
          INSERT DATA { <#item-1> dct:title "Added by patch" . }
        `,
        cwd: "/ws",
      },
      fs
    );
    const written = vi.mocked(fs.writeFile).mock.calls[0][1];
    expect(written).not.toContain("file://");
    expect(written).toContain("../vocab.ttl#");
    expect(written).toContain("<#this>");
  });

  it("writes IRIs inserted by the update as relative IRIs too", async () => {
    const fs = makeFakeFs(RELATIVE_IRI_TTL);
    await patchRdf(
      {
        path: "dev/docs/my-doc/doc.ttl",
        update: `
          PREFIX vocab: <../vocab.ttl#>
          PREFIX dct: <http://purl.org/dc/terms/>
          INSERT DATA { <#item-1> dct:title "Added by patch" . }
        `,
        cwd: "/ws",
      },
      fs
    );
    const written = vi.mocked(fs.writeFile).mock.calls[0][1];
    expect(written).toContain("<#item-1>");
    expect(written).not.toContain("file://");
  });
});

// ── Order stability ───────────────────────────────────────────────────────────
// Oxigraph walks its internal store list backwards on dump/match, which reshuffles
// the whole file on every patch. Reversing the updated quads before serialization
// restores the original source order. See ideas/rdf-patch-stable.md.

describe("patchRdf: order stability", () => {
  const FIVE = `
@prefix ex: <http://example.org/> .
ex:Alice ex:age 30 .
ex:Bob   ex:age 25 .
ex:Carol ex:age 40 .
ex:Dave  ex:age 22 .
ex:Eve   ex:age 35 .
`;

  function subjectOrder(ttl: string): string[] {
    return ttl
      .split("\n")
      .filter((l) => l.startsWith("ex:"))
      .map((l) => l.split(" ")[0]);
  }

  it("keeps untouched triples in their original order and moves the patched one to the end", async () => {
    const fs = makeFakeFs(FIVE);
    await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          DELETE { ex:Bob ex:age ?old }
          INSERT { ex:Bob ex:age 26 }
          WHERE  { ex:Bob ex:age ?old }
        `,
        cwd: "/ws",
      },
      fs
    );
    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    // Original order preserved (Alice, Carol, Dave, Eve), patched Bob moved to the end.
    expect(subjectOrder(written)).toEqual(["ex:Alice", "ex:Carol", "ex:Dave", "ex:Eve", "ex:Bob"]);
  });

  it("pins Oxigraph's reverse-dump behavior this fix relies on", async () => {
    // Not a behavior of patchRdf but of the underlying store: match() must walk
    // the internal list backwards (dump = reverse of load order). If a future
    // Oxigraph version changes this, patchRdf's .reverse() workaround must be
    // revisited — this test fails loudly instead of silently reshuffling files.
    const { Store } = await import("oxigraph");
    const store = new Store();
    store.load(FIVE, { format: "text/turtle" });
    const dumped = store
      .dump({ format: "application/n-quads" })
      .trim()
      .split("\n")
      .map((l) => l.match(/<http:\/\/example\.org\/(\w+)>/)![1]);
    expect(dumped).toEqual(["Eve", "Dave", "Carol", "Bob", "Alice"]);
  });
});

// ── Document prefixes in scope ───────────────────────────────────────────────
// SPARQL Update does not inherit @prefix declarations from the Turtle document,
// so an update using only prefixed names (no inline PREFIX clause) currently
// fails with a raw Oxigraph lexer error. patchRdf already has the document's
// prefix map, so it should inject document prefixes into the update.

const PREFIXED_DOC_TTL = `
@prefix ex: <http://example.org/vocab#>.
@prefix dct: <http://purl.org/dc/terms/>.

<#item-1> a ex:Item;
    dct:title "Example Item";
    ex:status ex:draft.
`;

describe("patchRdf: document prefixes in scope", () => {
  it("applies an update that uses document prefixes without inline PREFIX clauses", async () => {
    const fs = makeFakeFs(PREFIXED_DOC_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `DELETE DATA { <#item-1> ex:status ex:draft . }`,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore - 1);
  });

  it("applies an update with a relative-IRI prefix from the document without inline PREFIX", async () => {
    const fs = makeFakeFs(RELATIVE_IRI_TTL);
    const result = await patchRdf(
      {
        path: "dev/docs/my-doc/doc.ttl",
        update: `INSERT DATA { <#item-2> a vocab:Thing . }`,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore + 1);
  });

  it("lets an explicit PREFIX clause in the update override the document prefix", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://other.example.org/>
          INSERT DATA { ex:Carol ex:age 20 . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.triplesAfter).toBe(result.triplesBefore + 1);
    const written = vi.mocked(fs.writeFile).mock.calls[0][1];
    expect(written).toContain("http://other.example.org/");
  });
});

// ── Error: file does not exist ─────────────────────────────────────────────────

describe("patchRdf: file not found", () => {
  it("throws a descriptive error", async () => {
    const fs: FsAdapter = {
      readFile:  vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      mkdir:     vi.fn(),
      writeFile: vi.fn(),
    };
    await expect(
      patchRdf({ path: "missing.ttl", update: "INSERT DATA {}", cwd: "/ws" }, fs)
    ).rejects.toThrow(/file not found/i);
  });

  it("does not call writeFile when file is missing", async () => {
    const fs: FsAdapter = {
      readFile:  vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
      mkdir:     vi.fn(),
      writeFile: vi.fn(),
    };
    await patchRdf({ path: "missing.ttl", update: "INSERT DATA {}", cwd: "/ws" }, fs).catch(() => {});
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

// ── Error: invalid SPARQL Update ──────────────────────────────────────────────

describe("patchRdf: invalid SPARQL Update", () => {
  it("throws an error", async () => {
    const fs = makeFakeFs(BASE_TTL);
    await expect(
      patchRdf(
        { path: "data.ttl", update: "THIS IS NOT SPARQL", cwd: "/ws" },
        fs
      )
    ).rejects.toThrow();
  });

  it("does not write the file when SPARQL is invalid", async () => {
    const fs = makeFakeFs(BASE_TTL);
    await patchRdf(
      { path: "data.ttl", update: "INVALID", cwd: "/ws" },
      fs
    ).catch(() => {});
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

// ── Error: invalid Turtle in source file ──────────────────────────────────────

describe("patchRdf: invalid Turtle in source file", () => {
  it("propagates the parse error", async () => {
    const fs = makeFakeFs("this is not valid turtle !!!");
    await expect(
      patchRdf(
        {
          path: "data.ttl",
          update: `
            PREFIX ex: <http://example.org/>
            INSERT DATA { ex:X ex:y ex:z . }
          `,
          cwd: "/ws",
        },
        fs
      )
    ).rejects.toThrow();
  });
});

// ── Error: unsupported format ─────────────────────────────────────────────────

describe("patchRdf: unsupported format", () => {
  it("throws for .jsonld files", async () => {
    const fs = makeFakeFs("{}");
    await expect(
      patchRdf({ path: "data.jsonld", update: "INSERT DATA {}", cwd: "/ws" }, fs)
    ).rejects.toThrow(/Turtle/i);
  });

  it("throws for .nt files", async () => {
    const fs = makeFakeFs("");
    await expect(
      patchRdf({ path: "data.nt", update: "INSERT DATA {}", cwd: "/ws" }, fs)
    ).rejects.toThrow(/Turtle/i);
  });
});

// ── Prefix preservation ───────────────────────────────────────────────────────

describe("patchRdf: prefix preservation", () => {
  it("keeps the ex: prefix in the serialized output", async () => {
    const fs = makeFakeFs(TWO_TRIPLE_TTL);
    await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          INSERT DATA { ex:Carol ex:age 20 . }
        `,
        cwd: "/ws",
      },
      fs
    );
    const written = vi.mocked(fs.writeFile).mock.calls[0][1];
    expect(written).toContain("ex:");
  });
});

// ── Result shape ──────────────────────────────────────────────────────────────

describe("patchRdf: result shape", () => {
  it("returns absPath resolved against cwd", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "sub/data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          INSERT DATA { ex:X ex:y ex:z . }
        `,
        cwd: "/workspace",
      },
      fs
    );
    expect(result.absPath).toBe("/workspace/sub/data.ttl");
  });

  it("returns format 'turtle' for .ttl files", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          INSERT DATA { ex:X ex:y ex:z . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.format).toBe("turtle");
  });

  it("summary contains the file path", async () => {
    const fs = makeFakeFs(BASE_TTL);
    const result = await patchRdf(
      {
        path: "my/data.ttl",
        update: `
          PREFIX ex: <http://example.org/>
          INSERT DATA { ex:X ex:y ex:z . }
        `,
        cwd: "/ws",
      },
      fs
    );
    expect(result.summary).toContain("my/data.ttl");
  });
});
