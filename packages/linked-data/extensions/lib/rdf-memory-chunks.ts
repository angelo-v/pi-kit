/**
 * Pure helpers for the rdf-memory extension.
 *
 * All functions here are side-effect-free and can be tested directly
 * without touching the filesystem or Oxigraph.
 */

// ── Namespace constants ──────────────────────────────────────────────────────

export const MEM_NS = "urn:pi-kit:linked-data:rdf-memory:";
export const META_GRAPH = MEM_NS + "meta";
export const CHUNK_BASE = MEM_NS + "chunk-";

// ── Standard prefixes ────────────────────────────────────────────────────────

/**
 * Standard namespace prefixes prepended to every agent-supplied Turtle block.
 * Agents may assume these are available without declaring them.
 */
export const STANDARD_PREFIXES = [
  `PREFIX mem:    <${MEM_NS}>`,
  "PREFIX prov:   <http://www.w3.org/ns/prov#>",
  "PREFIX xsd:    <http://www.w3.org/2001/XMLSchema#>",
  "PREFIX dct:    <http://purl.org/dc/terms/>",
  "PREFIX schema: <https://schema.org/>",
  "PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>",
  "PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>",
  "PREFIX owl:    <http://www.w3.org/2002/07/owl#>",
  "PREFIX foaf:   <http://xmlns.com/foaf/0.1/>",
  "PREFIX skos:   <http://www.w3.org/2004/02/skos/core#>",
  "PREFIX vcard:  <http://www.w3.org/2006/vcard/ns#>",
].join("\n");

// ── TriG helpers ─────────────────────────────────────────────────────────────

/**
 * Wrap Turtle-star fact content in a TriG named-graph block.
 *
 * PREFIX / @prefix declarations must appear *outside* graph blocks in TriG.
 * We extract any user-supplied prefix lines from the facts string and hoist
 * them above the graph block, so agents can bring their own prefixes.
 * Standard prefixes are always included.
 */
export function wrapFactsInGraph(chunkIri: string, turtleFacts: string): string {
  const prefixLines: string[] = [];
  const bodyLines: string[] = [];
  for (const line of turtleFacts.split("\n")) {
    if (/^\s*(PREFIX|@prefix)\s/i.test(line)) {
      prefixLines.push(line.trim());
    } else {
      bodyLines.push(line);
    }
  }
  const extraPrefixes = prefixLines.length ? "\n" + prefixLines.join("\n") : "";
  return `${STANDARD_PREFIXES}${extraPrefixes}\n\n<${chunkIri}> {\n${bodyLines.join("\n")}\n}`;
}

// ── SPARQL helpers ───────────────────────────────────────────────────────────

/**
 * Escape a string for safe embedding as a SPARQL string literal.
 */
export function escapeSparqlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Build a SPARQL UPDATE that registers a chunk in the meta graph.
 */
export function buildMetaUpdate(
  chunkIri: string,
  recordedAt: string,
  source: string,
  topic: string | undefined
): string {
  const esc = escapeSparqlString;
  const topicLine = topic
    ? `\n    <${chunkIri}> <http://purl.org/dc/terms/subject> "${esc(topic)}" .`
    : "";
  return (
    `PREFIX mem: <${MEM_NS}>\n` +
    `PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n` +
    `INSERT DATA {\n` +
    `  GRAPH <${META_GRAPH}> {\n` +
    `    <${chunkIri}> a mem:MemoryChunk ;\n` +
    `      mem:recordedAt "${recordedAt}"^^xsd:dateTime ;\n` +
    `      mem:source "${esc(source)}" .${topicLine}\n` +
    `  }\n` +
    `}`
  );
}

// ── ID / time utilities ──────────────────────────────────────────────────────

/** Generate a short random hex ID for a chunk IRI. */
export function newChunkId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Return the current UTC datetime as an xsd:dateTime string (no milliseconds). */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
