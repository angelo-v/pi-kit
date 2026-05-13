/**
 * Unit tests for the remote-SPARQL binary resolution in find-binary.ts.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findBinary, BINARY_NAME, REMOTE_BINARY_NAME } from "../find-binary.js";

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));
vi.mock("node:url", () => ({ fileURLToPath: vi.fn() }));

const FAKE_IMPORT_META_URL = "file:///ext/lib/find-binary.js";

function setExisting(...existing: string[]) {
  const set = new Set(existing);
  vi.mocked(existsSync).mockImplementation((p) => set.has(String(p)));
}

describe("REMOTE_BINARY_NAME", () => {
  it("is the expected Comunica remote CLI name", () => {
    expect(REMOTE_BINARY_NAME).toBe("comunica-sparql");
  });
});

describe("findBinary with explicit binaryName", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(fileURLToPath).mockReturnValue("/ext/lib/find-binary.js");
  });

  it("finds the remote binary in the extension tree", () => {
    const expected = `/ext/node_modules/.bin/${REMOTE_BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary("/user/project", FAKE_IMPORT_META_URL, REMOTE_BINARY_NAME)).toBe(expected);
  });

  it("falls back to cwd for the remote binary", () => {
    const expected = `/user/project/node_modules/.bin/${REMOTE_BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary("/user/project", FAKE_IMPORT_META_URL, REMOTE_BINARY_NAME)).toBe(expected);
  });

  it("defaults to BINARY_NAME when binaryName is omitted", () => {
    const expected = `/ext/node_modules/.bin/${BINARY_NAME}`;
    setExisting(expected);

    expect(findBinary("/user/project", FAKE_IMPORT_META_URL)).toBe(expected);
  });

  it("throws with the correct binary name in the error message", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() =>
      findBinary("/some/dir", FAKE_IMPORT_META_URL, REMOTE_BINARY_NAME)
    ).toThrowError(new RegExp(REMOTE_BINARY_NAME));
  });

  it("error still includes npm install hint", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() =>
      findBinary("/some/dir", FAKE_IMPORT_META_URL, REMOTE_BINARY_NAME)
    ).toThrowError(/npm install/);
  });
});
