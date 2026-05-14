/**
 * Unit tests for query-logger.ts
 *
 * File-system calls are mocked via vi.mock so no real files are written.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── fs mock ───────────────────────────────────────────────────────────────────

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// ── import after mocks ────────────────────────────────────────────────────────

import { makeTimestamp, formatLogEntry, logQuery } from "../query-logger.js";
import type { QueryLogEntry } from "../query-logger.js";

// ── fixtures ──────────────────────────────────────────────────────────────────

const BASE_ENTRY: QueryLogEntry = {
  toolName: "sparql_query_files",
  sources: ["file:///workspace/data.ttl"],
  query: "SELECT * WHERE { ?s ?p ?o } LIMIT 10",
  result: "s | p | o\n...",
  cwd: "/workspace",
};

// ── makeTimestamp ─────────────────────────────────────────────────────────────

describe("makeTimestamp", () => {
  it("returns an ISO-8601-like string", () => {
    const ts = makeTimestamp(new Date("2026-05-14T10:23:45.678Z"));
    expect(ts).toBe("2026-05-14T10-23-45.678Z");
  });

  it("replaces all colons with hyphens", () => {
    const ts = makeTimestamp(new Date("2026-05-14T10:23:45.678Z"));
    expect(ts).not.toContain(":");
  });

  it("uses the current time when no date is supplied", () => {
    const before = Date.now();
    const ts = makeTimestamp();
    const after = Date.now();

    // Parse the timestamp back; colons were replaced so restore them first.
    const restored = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
    const parsed = new Date(restored).getTime();

    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

// ── formatLogEntry ────────────────────────────────────────────────────────────

describe("formatLogEntry", () => {
  it("includes the tool name", () => {
    const log = formatLogEntry(BASE_ENTRY);
    expect(log).toContain("sparql_query_files");
  });

  it("shows status OK for successful queries", () => {
    const log = formatLogEntry({ ...BASE_ENTRY, isError: false });
    expect(log).toContain("Status:    OK");
  });

  it("shows status ERROR when isError is true", () => {
    const log = formatLogEntry({ ...BASE_ENTRY, isError: true });
    expect(log).toContain("Status:    ERROR");
  });

  it("defaults to OK when isError is undefined", () => {
    const log = formatLogEntry(BASE_ENTRY); // no isError field
    expect(log).toContain("Status:    OK");
  });

  it("includes each source", () => {
    const entry: QueryLogEntry = {
      ...BASE_ENTRY,
      sources: ["file:///workspace/a.ttl", "file:///workspace/b.ttl"],
    };
    const log = formatLogEntry(entry);
    expect(log).toContain("file:///workspace/a.ttl");
    expect(log).toContain("file:///workspace/b.ttl");
  });

  it("includes the endpoint URL when source is a remote URL", () => {
    const entry: QueryLogEntry = {
      ...BASE_ENTRY,
      toolName: "sparql_query_endpoint",
      sources: ["https://query.wikidata.org/sparql"],
    };
    const log = formatLogEntry(entry);
    expect(log).toContain("https://query.wikidata.org/sparql");
  });

  it("includes the full query text", () => {
    const log = formatLogEntry(BASE_ENTRY);
    expect(log).toContain(BASE_ENTRY.query);
  });

  it("includes the result text", () => {
    const log = formatLogEntry(BASE_ENTRY);
    expect(log).toContain(BASE_ENTRY.result);
  });

  it("contains Sources, Query, and Result sections", () => {
    const log = formatLogEntry(BASE_ENTRY);
    expect(log).toContain("## Sources");
    expect(log).toContain("## Query");
    expect(log).toContain("## Result");
  });
});

// ── logQuery ──────────────────────────────────────────────────────────────────

describe("logQuery", () => {
  beforeEach(() => {
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
  });

  it("creates the log directory under .agents/logs/<toolName>", async () => {
    await logQuery(BASE_ENTRY);

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".agents/logs/sparql_query_files"),
      { recursive: true }
    );
  });

  it("writes a file whose name contains a timestamp", async () => {
    await logQuery(BASE_ENTRY);

    const [path] = mockWriteFile.mock.calls[0] as [string, ...unknown[]];
    expect(path).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.log$/);
  });

  it("writes the file with utf8 encoding", async () => {
    await logQuery(BASE_ENTRY);

    const [, , encoding] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(encoding).toBe("utf8");
  });

  it("writes content that includes the tool name", async () => {
    await logQuery(BASE_ENTRY);

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("sparql_query_files");
  });

  it("writes content that includes the query", async () => {
    await logQuery(BASE_ENTRY);

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain(BASE_ENTRY.query);
  });

  it("writes content that includes the result", async () => {
    await logQuery(BASE_ENTRY);

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain(BASE_ENTRY.result);
  });

  it("uses the toolName as the log subdirectory", async () => {
    const entry: QueryLogEntry = { ...BASE_ENTRY, toolName: "sparql_query_wikidata" };
    await logQuery(entry);

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining("sparql_query_wikidata"),
      expect.any(Object)
    );
  });

  it("does not throw when mkdir fails", async () => {
    mockMkdir.mockRejectedValueOnce(new Error("permission denied"));

    await expect(logQuery(BASE_ENTRY)).resolves.toBeUndefined();
  });

  it("does not throw when writeFile fails", async () => {
    mockWriteFile.mockRejectedValueOnce(new Error("disk full"));

    await expect(logQuery(BASE_ENTRY)).resolves.toBeUndefined();
  });
});
