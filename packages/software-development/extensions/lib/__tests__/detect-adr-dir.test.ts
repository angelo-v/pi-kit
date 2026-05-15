/**
 * Unit tests for detect-adr-dir.ts
 *
 * Filesystem access is injected via `ExistsAdapter` — no real I/O occurs.
 */

import { describe, it, expect } from "vitest";
import { detectExistingAdrDirs, ADR_CANDIDATE_DIRS } from "../detect-adr-dir.js";
import type { ExistsAdapter } from "../detect-adr-dir.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAdapter(...existing: string[]): ExistsAdapter {
  const set = new Set(existing);
  return { existsSync: (p) => set.has(p) };
}

// ── ADR_CANDIDATE_DIRS ────────────────────────────────────────────────────────

describe("ADR_CANDIDATE_DIRS", () => {
  it.each(["docs/decisions", "docs/adr", "adr", ".adr"])(
    "contains '%s'",
    (dir) => expect(ADR_CANDIDATE_DIRS).toContain(dir)
  );
});

// ── detectExistingAdrDirs ─────────────────────────────────────────────────────

describe("detectExistingAdrDirs", () => {
  it("returns an empty array when no candidate directory exists", () => {
    const adapter = makeAdapter(); // nothing exists
    expect(detectExistingAdrDirs("/project", adapter)).toEqual([]);
  });

  it("returns only directories that exist", () => {
    const adapter = makeAdapter("/project/docs/decisions");
    expect(detectExistingAdrDirs("/project", adapter)).toEqual(["docs/decisions"]);
  });

  it("returns multiple directories when several exist", () => {
    const adapter = makeAdapter("/project/docs/adr", "/project/adr");
    const result = detectExistingAdrDirs("/project", adapter);
    expect(result).toContain("docs/adr");
    expect(result).toContain("adr");
  });

  it("resolves candidate paths against cwd before checking existence", () => {
    const seen: string[] = [];
    const adapter: ExistsAdapter = {
      existsSync: (p) => { seen.push(p); return false; },
    };

    detectExistingAdrDirs("/my/project", adapter);

    for (const candidate of ADR_CANDIDATE_DIRS) {
      expect(seen).toContain(`/my/project/${candidate}`);
    }
  });

  it("does not return candidates whose resolved path was not checked", () => {
    // All candidates exist — result must only contain the short relative names
    const adapter = makeAdapter(
      ...ADR_CANDIDATE_DIRS.map((d) => `/project/${d}`)
    );
    const result = detectExistingAdrDirs("/project", adapter);
    for (const entry of result) {
      expect(entry).not.toMatch(/^\//);  // relative, not absolute
    }
  });

  it("is not confused by a path that shares a prefix with a candidate", () => {
    // "/project/docs/decision" (singular) must not match "docs/decisions"
    const adapter = makeAdapter("/project/docs/decision");
    expect(detectExistingAdrDirs("/project", adapter)).toEqual([]);
  });

  it("returns all candidates when all exist", () => {
    const adapter = makeAdapter(
      ...ADR_CANDIDATE_DIRS.map((d) => `/project/${d}`)
    );
    const result = detectExistingAdrDirs("/project", adapter);
    expect(result).toHaveLength(ADR_CANDIDATE_DIRS.length);
  });
});
