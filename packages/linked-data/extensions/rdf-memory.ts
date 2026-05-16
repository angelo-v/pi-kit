/**
 * rdf-memory extension
 *
 * Provides persistent RDF storage across pi sessions backed by Oxigraph (WASM).
 * Each named store is a directory on disk containing an N-Quads snapshot that
 * is loaded into an in-memory Oxigraph instance on first access and flushed
 * atomically after every mutating operation.
 *
 * The intended data model (enforced by the rdf-memory skill) is:
 *   - All facts are stored as QUADS in named graphs, never in the default graph.
 *   - Each memory "chunk" lives in its own named graph: mem:chunk/{id}
 *   - A fixed meta graph (mem:meta) indexes all chunks with recordedAt / source.
 *   - Per-fact provenance uses RDF-star: << s p o >> mem:confidence "high" .
 *
 * Tools registered:
 *   - rdf_memory_record   – PRIMARY: write a memory chunk; datetime is stamped by the tool
 *   - rdf_memory_query    – run SPARQL SELECT / ASK / CONSTRUCT / DESCRIBE
 *   - rdf_memory_update   – run SPARQL UPDATE (INSERT DATA, DELETE DATA, …)
 *   - rdf_memory_stores   – list known stores and their quad counts
 *   - rdf_memory_drop     – clear a store or a named graph (keep store dir)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import {
  resolveStorePath,
  openStore,
  flushStore,
  closeAll,
  listStoresInDir,
  serializeSelect,
  serializeQuads,
  defaultStoreDir,
} from "./lib/oxigraph-store.js";
import { mkdirSync } from "node:fs";

// ── Constants ────────────────────────────────────────────────────────────────

const MEM_NS = "urn:pi-kit:linked-data:rdf-memory:";
const META_GRAPH = MEM_NS + "meta";
const CHUNK_BASE = MEM_NS + "chunk-";

/** Standard prefixes prepended to agent-supplied Turtle facts. */
const STANDARD_PREFIXES = [
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve and open a store by name relative to the default store directory. */
function getStore(name: string) {
  const dir = defaultStoreDir();
  mkdirSync(dir, { recursive: true });
  const storePath = resolveStorePath(name, dir);
  return { storePath, store: openStore(storePath) };
}

/**
 * Wrap Turtle-star fact content in a TriG named-graph block.
 * toNamedGraph does not propagate to RDF-star reifiers, so we must
 * wrap in TriG to ensure all quads (including reifier triples) land
 * in the correct named graph.
 *
 * PREFIX / @prefix declarations must appear outside graph blocks in TriG.
 * We extract any user-supplied prefix lines from the facts string and hoist
 * them above the graph block, so agents can bring their own prefixes.
 */
function wrapFactsInGraph(chunkIri: string, turtleFacts: string): string {
  const prefixLines: string[] = [];
  const bodyLines: string[] = [];
  for (const line of turtleFacts.split('\n')) {
    if (/^\s*(PREFIX|@prefix)\s/i.test(line)) {
      prefixLines.push(line.trim());
    } else {
      bodyLines.push(line);
    }
  }
  const extraPrefixes = prefixLines.length ? '\n' + prefixLines.join('\n') : '';
  return `${STANDARD_PREFIXES}${extraPrefixes}\n\n<${chunkIri}> {\n${bodyLines.join('\n')}\n}`;
}

/**
 * Build a SPARQL UPDATE string that registers a chunk in the meta graph.
 * Escapes source / topic strings for safe embedding in a SPARQL literal.
 */
function buildMetaUpdate(
  chunkIri: string,
  recordedAt: string,
  source: string,
  topic: string | undefined
): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const topicLine = topic ? `\n    <${chunkIri}> <http://purl.org/dc/terms/subject> "${esc(topic)}" .` : "";
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

/** Generate a short random hex ID for a chunk IRI. */
function newChunkId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Return the current UTC datetime as an xsd:dateTime string (no milliseconds). */
function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Flush and release all open stores on shutdown
  pi.on("session_shutdown", async () => {
    closeAll();
  });

  // ── rdf_memory_record ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "rdf_memory_record",
    label: "RDF Memory: Record",
    description:
      "Write a memory chunk to a persistent RDF store. " +
      "The chunk is stored as a named graph; the recording datetime is stamped automatically by the tool — do not supply it. " +
      "Facts are expressed as Turtle-star (Turtle with optional RDF-star << >> annotations for per-fact provenance). " +
      "A meta-graph entry is created automatically with recordedAt (set by tool), source, and optional topic. " +
      "This is the primary tool for persisting knowledge across sessions.",
    promptSnippet: "Persist facts as a named-graph memory chunk with auto-stamped datetime",
    promptGuidelines: [
      "Use rdf_memory_record as the primary way to write persistent RDF memory. " +
        "Never supply a datetime — the tool stamps recordedAt automatically. " +
        "Always supply source (verbatim quote or description of where the fact came from). " +
        "Express facts as Turtle-star; use << s p o >> mem:confidence / mem:source for per-fact annotations. " +
        "Standard prefixes available without declaration: mem:, schema:, prov:, xsd:, dct:, rdf:, rdfs:, owl:, foaf:, skos:, vcard:. " +
        "For any other namespace add PREFIX or @prefix lines at the top of the facts string — the tool hoists them outside the graph block automatically.",
    ],
    parameters: Type.Object({
      store: Type.String({
        description:
          "Store name (e.g. 'project-memory'). Created automatically if it does not exist.",
      }),
      source: Type.String({
        description:
          "Where this knowledge came from — verbatim user quote, document title, URL, tool output, etc. Required.",
      }),
      facts: Type.String({
        description:
          "Facts to store, as Turtle-star (Turtle with optional RDF-star << >> annotations). " +
          "Standard prefixes (mem:, schema:, prov:, xsd:, dct:, rdf:, rdfs:, owl:, foaf:, skos:, vcard:) are available without declaration. " +
          "For any other namespace, add PREFIX or @prefix lines at the top of the facts string — the tool hoists them outside the graph block automatically. " +
          "Do NOT include a graph block — the tool wraps facts in the correct named graph automatically. " +
          "Example:\n" +
          "  ex:alice schema:name \"Alice\" ; schema:age 30 .\n" +
          "  << ex:alice schema:age 30 >> mem:confidence \"high\" ; mem:source \"User stated\" .",
      }),
      topic: Type.Optional(
        Type.String({
          description:
            "Optional topic tag for the chunk (e.g. 'people', 'projects', 'decisions'). " +
            "Used to filter chunks by subject in queries.",
        })
      ),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      try {
        const { storePath, store } = getStore(params.store);
        const chunkId = newChunkId();
        const chunkIri = CHUNK_BASE + chunkId;
        const recordedAt = nowIso();

        // Load facts into the chunk's named graph
        const trig = wrapFactsInGraph(chunkIri, params.facts);
        const sizeBefore = store.size;
        store.load(trig, { format: "application/trig" });
        const factsAdded = store.size - sizeBefore;

        // Register chunk in the meta graph
        const metaUpdate = buildMetaUpdate(chunkIri, recordedAt, params.source, params.topic);
        store.update(metaUpdate);

        flushStore(storePath);
        const totalSize = store.size;

        return {
          content: [
            {
              type: "text",
              text:
                `Recorded memory chunk <${chunkIri}>\n` +
                `  recordedAt: ${recordedAt}\n` +
                `  source:     ${params.source}\n` +
                (params.topic ? `  topic:      ${params.topic}\n` : "") +
                `  facts:      ${factsAdded} quad(s) added\n` +
                `  store:      '${params.store}' (${totalSize} quads total)`,
            },
          ],
          details: { chunkIri, recordedAt, store: params.store, factsAdded, totalSize },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error recording memory in store '${params.store}': ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });

  // ── rdf_memory_stores ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "rdf_memory_stores",
    label: "RDF Memory: List Stores",
    description:
      "List all known persistent RDF stores and their quad counts. " +
      "Stores are persisted to disk as N-Quads and survive across pi sessions.",
    promptSnippet: "List available persistent RDF stores",
    promptGuidelines: [
      "Use rdf_memory_stores to discover which persistent RDF stores exist before querying or inserting.",
    ],
    parameters: Type.Object({}),

    async execute(_id, _params, _signal, _onUpdate, _ctx) {
      const entries = listStoresInDir(defaultStoreDir());
      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: "No persistent RDF stores found. Use rdf_memory_record to create one." }],
          details: { stores: [] },
        };
      }

      const rows: string[] = ["| name | path | quads |", "| --- | --- | --- |"];
      const details: any[] = [];

      for (const entry of entries) {
        try {
          const store = openStore(entry.path);
          const size = store.size;
          rows.push(`| ${entry.name} | ${entry.path} | ${size} |`);
          details.push({ name: entry.name, path: entry.path, quads: size });
        } catch (err: any) {
          rows.push(`| ${entry.name} | ${entry.path} | error: ${err.message} |`);
          details.push({ name: entry.name, path: entry.path, error: err.message });
        }
      }

      return {
        content: [{ type: "text", text: rows.join("\n") }],
        details: { stores: details },
      };
    },
  });

  // ── rdf_memory_query ──────────────────────────────────────────────────────
  pi.registerTool({
    name: "rdf_memory_query",
    label: "RDF Memory: SPARQL Query",
    description:
      "Run a SPARQL 1.1 SELECT, ASK, CONSTRUCT, or DESCRIBE query against a persistent Oxigraph store. " +
      "SELECT returns a markdown table. ASK returns true/false. CONSTRUCT/DESCRIBE return N-Quads.",
    promptSnippet: "Query a persistent RDF store with SPARQL",
    promptGuidelines: [
      "Use rdf_memory_query to run SPARQL SELECT, ASK, CONSTRUCT, or DESCRIBE against a named persistent RDF store.",
      "Call rdf_memory_stores first if you are unsure which stores exist.",
    ],
    parameters: Type.Object({
      store: Type.String({
        description: "Store name (must already exist — use rdf_memory_stores to list available stores).",
      }),
      query: Type.String({
        description: "SPARQL 1.1 query string (SELECT, ASK, CONSTRUCT, or DESCRIBE). Include PREFIX declarations.",
      }),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      try {
        const { store } = getStore(params.store);
        const result = store.query(params.query);

        let text: string;
        if (typeof result === "boolean") {
          text = String(result);
        } else if (Symbol.iterator in result) {
          const iter = result[Symbol.iterator]();
          const first = iter.next();
          if (first.done) {
            text = "(no results)";
          } else {
            function* rechain(head: any, rest: Iterator<any>) {
              yield head;
              let r;
              while (!(r = rest.next()).done) yield r.value;
            }
            text =
              first.value instanceof Map
                ? serializeSelect(rechain(first.value, iter))
                : serializeQuads(rechain(first.value, iter));
          }
        } else {
          text = String(result);
        }

        return {
          content: [{ type: "text", text }],
          details: { store: params.store },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `SPARQL error on store '${params.store}': ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });

  // ── rdf_memory_update ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "rdf_memory_update",
    label: "RDF Memory: SPARQL Update",
    description:
      "Run a SPARQL 1.1 Update operation (INSERT DATA, DELETE DATA, DELETE/INSERT WHERE, CLEAR, DROP, …) " +
      "against a persistent Oxigraph store. Changes are persisted to disk immediately.",
    promptSnippet: "Modify a persistent RDF store with SPARQL Update",
    promptGuidelines: [
      "Use rdf_memory_update to delete or modify existing quads in a named persistent RDF store. " +
        "For writing new memory chunks use rdf_memory_record instead.",
    ],
    parameters: Type.Object({
      store: Type.String({
        description: "Store name to modify.",
      }),
      update: Type.String({
        description:
          "SPARQL 1.1 Update string. " +
          "Examples: 'DELETE DATA { GRAPH <g> { <s> <p> <o> . } }', " +
          "'DELETE { GRAPH ?g { ?s ?p ?o } } INSERT { GRAPH ?g { ?s ?p \"new\" } } WHERE { GRAPH ?g { ?s ?p ?o } }'.",
      }),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      try {
        const { storePath, store } = getStore(params.store);
        const sizeBefore = store.size;
        store.update(params.update);
        const sizeAfter = store.size;
        const delta = sizeAfter - sizeBefore;
        flushStore(storePath);

        return {
          content: [
            {
              type: "text",
              text: `Update applied to store '${params.store}'. Delta: ${delta >= 0 ? "+" : ""}${delta}. Total: ${sizeAfter} quad(s).`,
            },
          ],
          details: { store: params.store, sizeBefore, sizeAfter, delta },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `SPARQL Update error on store '${params.store}': ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });

  // ── rdf_memory_drop ───────────────────────────────────────────────────────
  pi.registerTool({
    name: "rdf_memory_drop",
    label: "RDF Memory: Drop",
    description:
      "Remove all quads from a persistent RDF store, or from a single named graph within it. " +
      "The store directory is kept; use 'graph' to scope the clear to one named graph.",
    promptSnippet: "Clear a persistent RDF store or a named graph within it",
    parameters: Type.Object({
      store: Type.String({
        description: "Store name to clear.",
      }),
      graph: Type.Optional(
        Type.String({
          description:
            "Named graph IRI to clear. If omitted, ALL graphs (including the default graph) are cleared.",
        })
      ),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      try {
        const { storePath, store } = getStore(params.store);
        const sizeBefore = store.size;

        if (params.graph) {
          store.update(`CLEAR GRAPH <${params.graph}>`);
        } else {
          store.update("CLEAR ALL");
        }

        const sizeAfter = store.size;
        flushStore(storePath);
        const scope = params.graph ? `graph <${params.graph}>` : "all graphs";

        return {
          content: [
            {
              type: "text",
              text: `Cleared ${scope} in store '${params.store}'. Removed ${sizeBefore - sizeAfter} quad(s). Remaining: ${sizeAfter}.`,
            },
          ],
          details: { store: params.store, sizeBefore, sizeAfter },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error clearing store '${params.store}': ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });
}
