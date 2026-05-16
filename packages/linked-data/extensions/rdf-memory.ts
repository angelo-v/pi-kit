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
import { Type } from "typebox";
import { mkdirSync } from "node:fs";

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
import {
  CHUNK_BASE,
  wrapFactsInGraph,
  buildMetaUpdate,
  newChunkId,
  nowIso,
} from "./lib/rdf-memory-chunks.js";
import {
  formatRecordResult,
  formatStoresTable,
  formatUpdateResult,
  formatDropResult,
} from "./lib/rdf-memory-format.js";

// ── Store access ─────────────────────────────────────────────────────────────

/** Resolve and open a store by name relative to the default store directory. */
function getStore(name: string) {
  const dir = defaultStoreDir();
  mkdirSync(dir, { recursive: true });
  const storePath = resolveStorePath(name, dir);
  return { storePath, store: openStore(storePath) };
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

        const trig = wrapFactsInGraph(chunkIri, params.facts);
        const sizeBefore = store.size;
        store.load(trig, { format: "application/trig" });
        const factsAdded = store.size - sizeBefore;

        store.update(buildMetaUpdate(chunkIri, recordedAt, params.source, params.topic));
        flushStore(storePath);

        const text = formatRecordResult({
          chunkIri,
          recordedAt,
          storeName: params.store,
          source: params.source,
          topic: params.topic,
          factsAdded,
          totalQuads: store.size,
        });

        return {
          content: [{ type: "text", text }],
          details: { chunkIri, recordedAt, store: params.store, factsAdded, totalQuads: store.size },
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

      const details: any[] = [];
      const tableEntries = entries.map((entry) => {
        try {
          const store = openStore(entry.path);
          details.push({ name: entry.name, path: entry.path, quads: store.size });
          return { name: entry.name, path: entry.path, quads: store.size };
        } catch (err: any) {
          details.push({ name: entry.name, path: entry.path, error: err.message });
          return { name: entry.name, path: entry.path, error: err.message };
        }
      });

      return {
        content: [{ type: "text", text: formatStoresTable(tableEntries) }],
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
        flushStore(storePath);

        const text = formatUpdateResult({
          storeName: params.store,
          sizeBefore,
          sizeAfter: store.size,
        });

        return {
          content: [{ type: "text", text }],
          details: { store: params.store, sizeBefore, sizeAfter: store.size, delta: store.size - sizeBefore },
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

        flushStore(storePath);

        const text = formatDropResult({
          storeName: params.store,
          graph: params.graph,
          sizeBefore,
          sizeAfter: store.size,
        });

        return {
          content: [{ type: "text", text }],
          details: { store: params.store, sizeBefore, sizeAfter: store.size },
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
