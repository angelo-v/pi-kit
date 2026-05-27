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
