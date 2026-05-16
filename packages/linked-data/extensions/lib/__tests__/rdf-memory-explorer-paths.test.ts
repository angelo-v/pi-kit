/**
 * Unit tests for rdf-memory-explorer-paths.ts
 *
 * All filesystem access is injected via a fake `PathsFs` adapter — no real
 * disk I/O occurs.
 */

import { describe, it, expect } from "vitest";
import { resolveHtmlPath, defaultStoreDir } from "../rdf-memory-explorer-paths.js";

// ── resolveHtmlPath ───────────────────────────────────────────────────────────

describe("resolveHtmlPath", () => {
  const DIR = "/some/extensions";

  it("returns the candidate path when the file exists", () => {
    const fs = { existsSync: () => true };
    const result = resolveHtmlPath(DIR, fs);
    expect(result).toMatch(/rdf-memory-explorer\.html$/);
  });

  it("resolves the HTML file one level above extensionDir inside 'tools/'", () => {
    const fs = { existsSync: () => true };
    const result = resolveHtmlPath(DIR, fs);
    expect(result).toContain("tools/rdf-memory-explorer.html");
  });

  it("throws when the file does not exist", () => {
    const fs = { existsSync: () => false };
    expect(() => resolveHtmlPath(DIR, fs)).toThrow("RDF Memory Explorer HTML not found");
  });

  it("includes the expected path in the error message", () => {
    const fs = { existsSync: () => false };
    expect(() => resolveHtmlPath(DIR, fs)).toThrow(/rdf-memory-explorer\.html/);
  });

  it("reflects a different extensionDir in the resolved path", () => {
    const altDir = "/another/path/extensions";
    const visited: string[] = [];
    const fs = {
      existsSync(p: string) {
        visited.push(p);
        return true;
      },
    };
    resolveHtmlPath(altDir, fs);
    expect(visited[0]).toContain("another");
  });
});

// ── defaultStoreDir ───────────────────────────────────────────────────────────

describe("defaultStoreDir", () => {
  it("ends with the expected relative path", () => {
    const dir = defaultStoreDir("/home/testuser");
    expect(dir).toMatch(/[/\\]\.pi[/\\]agent[/\\]rdf-memory$/);
  });

  it("uses the injected home directory", () => {
    expect(defaultStoreDir("/custom/home")).toContain("/custom/home");
  });

  it("uses os.homedir() when no home is supplied", () => {
    // Just verify it returns a non-empty string with the expected suffix
    const dir = defaultStoreDir();
    expect(dir.length).toBeGreaterThan(0);
    expect(dir).toMatch(/rdf-memory$/);
  });

  it("different home values produce different directories", () => {
    expect(defaultStoreDir("/home/alice")).not.toBe(defaultStoreDir("/home/bob"));
  });
});
