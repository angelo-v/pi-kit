/**
 * ld-fetch extension
 *
 * Registers the `ld_fetch` tool, which dereferences a Linked Data URI,
 * content-negotiates an RDF representation, parses it, and stores the
 * resulting quads in the Oxigraph "fetched-data" store under GRAPH <uri>.
 *
 * Business logic lives entirely in `lib/ld-fetch-store.ts`; this module is
 * thin wiring only.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdirSync } from "node:fs";

import { ldFetch, FETCHED_DATA_STORE, type FetchResult } from "./lib/ld-fetch-store.js";
import { defaultStoreDir } from "./lib/oxigraph-store.js";

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatFetchResult(result: FetchResult): string {
  return [
    `Fetched <${result.uri}>`,
    `Format:   ${result.format}`,
    `Triples:  ${result.tripleCount}`,
    `Graph:    <${result.graphIri}> in store "${FETCHED_DATA_STORE}"`,
    `Recorded: ${result.recordedAt}`,
    ``,
    `Query with: rdf_memory_query(store="${FETCHED_DATA_STORE}", query="SELECT … WHERE { GRAPH <${result.uri}> { … } }")`,
  ].join("\n");
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ld_fetch",
    label: "Linked Data Fetch",
    description:
      "Fetch a Linked Data URI, content-negotiate an RDF representation " +
      "(Turtle, JSON-LD, RDF/XML, N-Triples, HTML+RDFa), parse it, and store " +
      `the resulting quads in the Oxigraph "${FETCHED_DATA_STORE}" store under GRAPH <uri>. ` +
      "Re-fetching the same URI replaces the existing graph atomically.",
    promptSnippet: "Dereference a Linked Data URI and store its triples in the fetched-data store",
    promptGuidelines: [
      `Use ld_fetch whenever the user asks to "look up", "resolve", "fetch", or "get" a URI from the Web of Data — e.g. a vocabulary term, a FOAF profile, a schema.org type, or a Wikidata entity page.`,
      `After fetching, query the payload graph with rdf_memory_query scoped to GRAPH <uri> in store "${FETCHED_DATA_STORE}".`,
      `Use rdf_memory_drop(store="${FETCHED_DATA_STORE}", graph=<uri>) to force a re-fetch when the user wants fresh data.`,
      `Follow owl:sameAs and rdfs:seeAlso links by calling ld_fetch again on the linked URIs.`,
      `Chain with rdf_memory_query rather than sparql_query_files — the data is already in memory.`,
    ],
    parameters: Type.Object({
      uri: Type.String({
        description: "HTTP/HTTPS URI to dereference.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const storeDir = defaultStoreDir();
        mkdirSync(storeDir, { recursive: true });

        const result = await ldFetch(params.uri, storeDir);
        const text = formatFetchResult(result);

        return {
          content: [{ type: "text", text }],
          details: result,
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `ld_fetch error for <${params.uri}>: ${err.message}`,
            },
          ],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });
}
