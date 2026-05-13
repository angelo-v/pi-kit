/**
 * Unit tests for find-binary.ts
 *
 * Both `node:fs` and `node:url` are mocked so `existsSync` and
 * `fileURLToPath` are controllable stubs without touching the real filesystem.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findBinary, BINARY_NAME } from "../find-binary.js";

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));
vi.mock("node:url", () => ({ fileURLToPath: vi.fn() }));

// ── helpers ───────────────────────────────────────────────────────────────────

const FAKE_IMPORT_META_URL = "file:///ext/lib/find-binary.js";
const FAKE_EXTENSION_DIR   = "/ext/lib";

function setExisting(...existing: string[]) {
  const set = new Set(existing);
  vi.mocked(existsSync).mockImplementation((p) => set.has(String(p)));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("findBinary", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(fileURLToPath).mockReturnValue(`${FAKE_EXTENSION_DIR}/find-binary.js`);
  });

  it("finds the binary in the extension's own node_modules first", () => {
    const expected = `/ext/node_modules/.bin/${BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary("/user/project", FAKE_IMPORT_META_URL)).toBe(expected);
  });

  it("falls back to cwd when binary is not in the extension's tree", () => {
    const expected = `/user/project/node_modules/.bin/${BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary("/user/project", FAKE_IMPORT_META_URL)).toBe(expected);
  });

  it("walks up from the extension dir before falling back to cwd", () => {
    // Binary exists at extension monorepo root but not in cwd
    const expected = `/ext/node_modules/.bin/${BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary("/user/project", FAKE_IMPORT_META_URL)).toBe(expected);
  });

  it("finds binary two levels up from the extension dir", () => {
    vi.mocked(fileURLToPath).mockReturnValue("/a/b/c/find-binary.js");
    const expected = `/a/node_modules/.bin/${BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary("/user/project", FAKE_IMPORT_META_URL)).toBe(expected);
  });

  it("throws when binary is not found in either ancestor chain", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => findBinary("/some/dir", FAKE_IMPORT_META_URL)).toThrowError(
      /comunica-sparql-file binary not found/
    );
  });

  it("error message includes an npm install hint", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => findBinary("/some/dir", FAKE_IMPORT_META_URL)).toThrowError(/npm install/);
  });
});

describe("BINARY_NAME", () => {
  it("is the expected Comunica CLI name", () => {
    expect(BINARY_NAME).toBe("comunica-sparql-file");
  });
});
