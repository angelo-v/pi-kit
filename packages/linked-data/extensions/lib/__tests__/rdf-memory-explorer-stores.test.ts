/**
 * Unit tests for rdf-memory-explorer-stores.ts
 *
 * All filesystem access is injected via a fake `StoresFs` adapter — no real
 * disk I/O occurs.
 */

import { describe, it, expect } from "vitest";
import { listStores, readStoreNq, type StoresFs } from "../rdf-memory-explorer-stores.js";

// ── Fake filesystem builder ───────────────────────────────────────────────────

/**
 * Build a `StoresFs` fake from a set of "existing" file paths and a map of
 * file contents.
 */
function fakeFs(existing: string[], contents: Record<string, string> = {}): StoresFs {
  const existingSet = new Set(existing);
  return {
    existsSync: (p) => existingSet.has(p),
    readdirSync: (dir) => {
      // Return entries for paths that start with `dir/` (one level deep only)
      const seen = new Set<string>();
      const entries = [];
      for (const p of existingSet) {
        if (!p.startsWith(dir + "/")) continue;
        const rest = p.slice(dir.length + 1);
        const segment = rest.split("/")[0];
        if (seen.has(segment)) continue;
        seen.add(segment);
        const isDirectory = rest.includes("/");
        entries.push({
          name: segment,
          isDirectory: () => isDirectory,
        });
      }
      return entries;
    },
    readFileSync: (p, _enc) => {
      if (p in contents) return contents[p];
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

// ── listStores ────────────────────────────────────────────────────────────────

describe("listStores", () => {
  it("returns an empty array when the directory does not exist", () => {
    const fs = fakeFs([]);
    expect(listStores("/missing", fs)).toEqual([]);
  });

  it("returns store names for directories that contain data.nq", () => {
    const fs = fakeFs([
      "/stores",
      "/stores/alpha/data.nq",
      "/stores/beta/data.nq",
    ]);
    expect(listStores("/stores", fs)).toEqual(["alpha", "beta"]);
  });

  it("excludes directories that do not have data.nq", () => {
    const fs = fakeFs([
      "/stores",
      "/stores/good/data.nq",
      "/stores/bad/other.txt",
    ]);
    expect(listStores("/stores", fs)).toEqual(["good"]);
  });

  it("returns results in sorted order", () => {
    const fs = fakeFs([
      "/stores",
      "/stores/zeta/data.nq",
      "/stores/alpha/data.nq",
      "/stores/mango/data.nq",
    ]);
    expect(listStores("/stores", fs)).toEqual(["alpha", "mango", "zeta"]);
  });

  it("returns an empty array when the directory is empty", () => {
    const fs = fakeFs(["/stores"]);
    expect(listStores("/stores", fs)).toEqual([]);
  });
});

// ── readStoreNq ───────────────────────────────────────────────────────────────

describe("readStoreNq", () => {
  const NQ = "<urn:s> <urn:p> <urn:o> <urn:g> .\n";

  it("returns file content for a valid store name", () => {
    const fs = fakeFs(["/stores/mystore/data.nq"], { "/stores/mystore/data.nq": NQ });
    expect(readStoreNq("/stores", "mystore", fs)).toBe(NQ);
  });

  it("returns null when the store does not exist", () => {
    const fs = fakeFs([]);
    expect(readStoreNq("/stores", "missing", fs)).toBeNull();
  });

  it("returns null for a name containing a forward slash (path traversal)", () => {
    const fs = fakeFs(["/stores/../secret/data.nq"]);
    expect(readStoreNq("/stores", "../secret", fs)).toBeNull();
  });

  it("returns null for a name containing a backslash (path traversal)", () => {
    const fs = fakeFs([]);
    expect(readStoreNq("/stores", "..\\secret", fs)).toBeNull();
  });

  it("returns null for an empty name", () => {
    const fs = fakeFs([]);
    expect(readStoreNq("/stores", "", fs)).toBeNull();
  });

  it("treats slashes embedded mid-name as unsafe", () => {
    const fs = fakeFs([]);
    expect(readStoreNq("/stores", "a/b", fs)).toBeNull();
  });

  it("returns null for a bare '..' traversal (no slashes)", () => {
    const fs = fakeFs(["/secret/data.nq"]);
    expect(readStoreNq("/stores", "..", fs)).toBeNull();
  });

  it("returns null for a name containing a null byte", () => {
    const fs = fakeFs([]);
    expect(readStoreNq("/stores", "store\0evil", fs)).toBeNull();
  });
});
