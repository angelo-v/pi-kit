/**
 * Result-formatting helpers for rdf-memory tools.
 *
 * All functions are pure (no side effects) so they can be unit-tested
 * without a live Oxigraph store or filesystem.
 */

// ── rdf_memory_record ────────────────────────────────────────────────────────

export interface RecordResult {
  chunkIri: string;
  recordedAt: string;
  storeName: string;
  source: string;
  topic: string | undefined;
  factsAdded: number;
  totalQuads: number;
}

/** Build the human-readable text returned by rdf_memory_record. */
export function formatRecordResult(r: RecordResult): string {
  return (
    `Recorded memory chunk <${r.chunkIri}>\n` +
    `  recordedAt: ${r.recordedAt}\n` +
    `  source:     ${r.source}\n` +
    (r.topic ? `  topic:      ${r.topic}\n` : "") +
    `  facts:      ${r.factsAdded} quad(s) added\n` +
    `  store:      '${r.storeName}' (${r.totalQuads} quads total)`
  );
}

// ── rdf_memory_stores ────────────────────────────────────────────────────────

export interface StoreEntry {
  name: string;
  path: string;
  quads?: number;
  error?: string;
}

/** Build the markdown table returned by rdf_memory_stores. */
export function formatStoresTable(entries: StoreEntry[]): string {
  const rows = ["| name | path | quads |", "| --- | --- | --- |"];
  for (const e of entries) {
    const quadCol = e.error != null ? `error: ${e.error}` : String(e.quads ?? 0);
    rows.push(`| ${e.name} | ${e.path} | ${quadCol} |`);
  }
  return rows.join("\n");
}

// ── rdf_memory_update ────────────────────────────────────────────────────────

export interface UpdateResult {
  storeName: string;
  sizeBefore: number;
  sizeAfter: number;
}

/** Build the human-readable text returned by rdf_memory_update. */
export function formatUpdateResult(r: UpdateResult): string {
  const delta = r.sizeAfter - r.sizeBefore;
  return (
    `Update applied to store '${r.storeName}'. ` +
    `Delta: ${delta >= 0 ? "+" : ""}${delta}. ` +
    `Total: ${r.sizeAfter} quad(s).`
  );
}

// ── rdf_memory_drop ───────────────────────────────────────────────────────────

export interface DropResult {
  storeName: string;
  graph: string | undefined;
  sizeBefore: number;
  sizeAfter: number;
}

/** Build the human-readable text returned by rdf_memory_drop. */
export function formatDropResult(r: DropResult): string {
  const scope = r.graph ? `graph <${r.graph}>` : "all graphs";
  const removed = r.sizeBefore - r.sizeAfter;
  return (
    `Cleared ${scope} in store '${r.storeName}'. ` +
    `Removed ${removed} quad(s). ` +
    `Remaining: ${r.sizeAfter}.`
  );
}
