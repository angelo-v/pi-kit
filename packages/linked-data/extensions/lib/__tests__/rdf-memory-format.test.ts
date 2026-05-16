/**
 * Unit tests for rdf-memory-format.ts
 *
 * All formatters are pure functions — no mocking required.
 */

import { describe, it, expect } from "vitest";
import {
  formatRecordResult,
  formatStoresTable,
  formatUpdateResult,
  formatDropResult,
} from "../rdf-memory-format.js";
import type { RecordResult, StoreEntry, UpdateResult, DropResult } from "../rdf-memory-format.js";

// ── formatRecordResult ────────────────────────────────────────────────────────

describe("formatRecordResult", () => {
  const base: RecordResult = {
    chunkIri: "urn:example:chunk-abc123",
    recordedAt: "2024-06-01T12:00:00Z",
    storeName: "my-store",
    source: "User stated",
    topic: undefined,
    factsAdded: 3,
    totalQuads: 42,
  };

  it("includes the chunk IRI", () => {
    expect(formatRecordResult(base)).toContain(base.chunkIri);
  });

  it("includes the recordedAt timestamp", () => {
    expect(formatRecordResult(base)).toContain(base.recordedAt);
  });

  it("includes the source", () => {
    expect(formatRecordResult(base)).toContain(base.source);
  });

  it("includes the store name", () => {
    expect(formatRecordResult(base)).toContain(base.storeName);
  });

  it("includes the number of facts added", () => {
    expect(formatRecordResult(base)).toContain("3");
  });

  it("includes the total quad count", () => {
    expect(formatRecordResult(base)).toContain("42");
  });

  it("includes the topic line when topic is provided", () => {
    const result = formatRecordResult({ ...base, topic: "people" });
    expect(result).toContain("people");
  });

  it("omits the topic line when topic is undefined", () => {
    const result = formatRecordResult(base);
    expect(result).not.toContain("topic:");
  });
});

// ── formatStoresTable ─────────────────────────────────────────────────────────

describe("formatStoresTable", () => {
  const entries: StoreEntry[] = [
    { name: "store-a", path: "/home/user/.pi/rdf-memory/store-a", quads: 10 },
    { name: "store-b", path: "/home/user/.pi/rdf-memory/store-b", quads: 0 },
  ];

  it("produces a markdown table with a header row", () => {
    const table = formatStoresTable(entries);
    expect(table).toContain("| name |");
    expect(table).toContain("| path |");
    expect(table).toContain("| quads |");
  });

  it("includes a separator row", () => {
    const table = formatStoresTable(entries);
    expect(table).toContain("| --- |");
  });

  it("includes a row for each store", () => {
    const table = formatStoresTable(entries);
    expect(table).toContain("store-a");
    expect(table).toContain("store-b");
  });

  it("shows the quad count for each store", () => {
    const table = formatStoresTable(entries);
    expect(table).toContain("10");
    expect(table).toContain("0");
  });

  it("shows an error prefix when a store has an error", () => {
    const withError: StoreEntry[] = [
      { name: "bad-store", path: "/x", error: "file not found" },
    ];
    const table = formatStoresTable(withError);
    expect(table).toContain("error: file not found");
  });

  it("still renders a valid table when the list is empty", () => {
    const table = formatStoresTable([]);
    // Must at least have the header and separator
    const lines = table.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

// ── formatUpdateResult ────────────────────────────────────────────────────────

describe("formatUpdateResult", () => {
  it("mentions the store name", () => {
    const r: UpdateResult = { storeName: "my-store", sizeBefore: 10, sizeAfter: 15 };
    expect(formatUpdateResult(r)).toContain("my-store");
  });

  it("shows a positive delta with a '+' sign", () => {
    const r: UpdateResult = { storeName: "s", sizeBefore: 10, sizeAfter: 13 };
    expect(formatUpdateResult(r)).toContain("+3");
  });

  it("shows a negative delta without a '+' sign", () => {
    const r: UpdateResult = { storeName: "s", sizeBefore: 10, sizeAfter: 7 };
    const text = formatUpdateResult(r);
    expect(text).toContain("-3");
    expect(text).not.toContain("+-3");
  });

  it("shows a zero delta as +0", () => {
    const r: UpdateResult = { storeName: "s", sizeBefore: 5, sizeAfter: 5 };
    expect(formatUpdateResult(r)).toContain("+0");
  });

  it("includes the total quad count after the update", () => {
    const r: UpdateResult = { storeName: "s", sizeBefore: 0, sizeAfter: 99 };
    expect(formatUpdateResult(r)).toContain("99");
  });
});

// ── formatDropResult ──────────────────────────────────────────────────────────

describe("formatDropResult", () => {
  it("mentions the store name", () => {
    const r: DropResult = { storeName: "my-store", graph: undefined, sizeBefore: 20, sizeAfter: 0 };
    expect(formatDropResult(r)).toContain("my-store");
  });

  it("reports 'all graphs' when no graph IRI is given", () => {
    const r: DropResult = { storeName: "s", graph: undefined, sizeBefore: 5, sizeAfter: 0 };
    expect(formatDropResult(r)).toContain("all graphs");
  });

  it("reports the specific graph IRI when one is given", () => {
    const r: DropResult = {
      storeName: "s",
      graph: "urn:example:g1",
      sizeBefore: 10,
      sizeAfter: 7,
    };
    const text = formatDropResult(r);
    expect(text).toContain("urn:example:g1");
    expect(text).not.toContain("all graphs");
  });

  it("reports the number of removed quads", () => {
    const r: DropResult = { storeName: "s", graph: undefined, sizeBefore: 10, sizeAfter: 3 };
    expect(formatDropResult(r)).toContain("7");
  });

  it("reports the remaining quad count", () => {
    const r: DropResult = { storeName: "s", graph: undefined, sizeBefore: 10, sizeAfter: 3 };
    expect(formatDropResult(r)).toContain("3");
  });

  it("handles removal of zero quads without error", () => {
    const r: DropResult = { storeName: "s", graph: "urn:empty", sizeBefore: 5, sizeAfter: 5 };
    expect(formatDropResult(r)).toContain("0");
  });
});
