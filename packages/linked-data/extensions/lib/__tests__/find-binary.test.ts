/**
 * Unit tests for find-binary.ts
 *
 * `node:fs` is mocked at the module level with vi.mock so that `existsSync`
 * is a controllable stub when `find-binary.ts` imports it.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { findBinary, BINARY_NAME } from "../find-binary.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

/** Make existsSync return true only for paths in `existing`. */
function setExisting(...existing: string[]) {
  const set = new Set(existing);
  vi.mocked(existsSync).mockImplementation((p) => set.has(String(p)));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("findBinary", () => {
  beforeEach(() => vi.mocked(existsSync).mockReset());

  it("returns the binary path when found in the given directory", () => {
    const cwd = "/project/packages/foo";
    const expected = `/project/packages/foo/node_modules/.bin/${BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary(cwd)).toBe(expected);
  });

  it("walks up ancestor directories until the binary is found", () => {
    const cwd = "/project/packages/foo";
    // Binary only exists at the monorepo root, not inside the package
    const rootBinary = `/project/node_modules/.bin/${BINARY_NAME}`;
    setExisting(rootBinary);

    expect(findBinary(cwd)).toBe(rootBinary);
  });

  it("finds the binary two levels up", () => {
    const cwd = "/a/b/c";
    const target = `/a/node_modules/.bin/${BINARY_NAME}`;
    setExisting(target);

    expect(findBinary(cwd)).toBe(target);
  });

  it("throws a descriptive error when the binary is not found anywhere", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => findBinary("/some/dir")).toThrowError(
      /comunica-sparql-file binary not found/
    );
  });

  it("error message includes an npm install hint", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => findBinary("/some/dir")).toThrowError(/npm install/);
  });
});

describe("BINARY_NAME", () => {
  it("is the expected Comunica CLI name", () => {
    expect(BINARY_NAME).toBe("comunica-sparql-file");
  });
});
