/**
 * sparql-query-endpoint extension
 *
 * Registers two tools:
 *
 *  • `sparql_query_endpoint` — runs a SPARQL 1.1 query against any remote
 *    SPARQL endpoint (e.g. DBpedia, Wikidata, your own triple-store) using
 *    the Comunica `comunica-sparql` CLI (from `@comunica/query-sparql`).
 *
 *  • `sparql_query_wikidata` — thin wrapper around `sparql_query_endpoint`
 *    pre-configured for the Wikidata Query Service
 *    (https://query.wikidata.org/sparql). Automatically prepends common
 *    Wikidata prefixes (wd:, wdt:, wikibase:, …) so the LLM can write
 *    idiomatic Wikidata SPARQL without boilerplate.
 *
 * Sources are passed as `sparql@<url>` positional arguments so Comunica
 * treats them as SPARQL protocol endpoints rather than attempting to
 * dereference them as Linked Data documents.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { findBinary, REMOTE_BINARY_NAME } from "./lib/find-binary.js";
import { buildArgs, type OutputFormat } from "./lib/format.js";
import { ensureLimit } from "./lib/limit-query.js";
import { runQuery } from "./lib/run-query.js";
import {
  WIKIDATA_ENDPOINT,
  WIKIDATA_PREFIXES,
  injectWikidataPrefixes,
} from "./lib/wikidata.js";

// Re-export so consumers can import from a single place if needed.
export { WIKIDATA_ENDPOINT, WIKIDATA_PREFIXES, injectWikidataPrefixes };

// ── shared helper ─────────────────────────────────────────────────────────────

async function queryEndpoint(
  endpointUrl: string,
  query: string,
  format: OutputFormat,
  cwd: string
): Promise<{ output: string; isError?: boolean }> {
  let binary: string;
  try {
    binary = findBinary(cwd, import.meta.url, REMOTE_BINARY_NAME);
  } catch (err: any) {
    return { output: `Error: ${err.message}`, isError: true };
  }

  // Comunica treats "sparql@<url>" as a SPARQL protocol endpoint.
  const source = `sparql@${endpointUrl}`;
  const limitedQuery = ensureLimit(query);
  const args = buildArgs([source], limitedQuery, format);

  try {
    const { output } = await runQuery(binary, args, cwd);
    return { output };
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message;
    return { output: `SPARQL Error:\n${msg}`, isError: true };
  }
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── sparql_query_endpoint ──────────────────────────────────────────────────
  pi.registerTool({
    name: "sparql_query_endpoint",
    label: "SPARQL Query (remote endpoint)",
    description:
      "Run a SPARQL 1.1 query (SELECT/ASK/CONSTRUCT/DESCRIBE) against a remote SPARQL endpoint " +
      "(e.g. Wikidata, DBpedia, a custom triple-store) using Comunica.",
    promptGuidelines: [
      "Use sparql_query_endpoint to query a remote SPARQL endpoint by URL.",
      "Pass the full SPARQL endpoint URL in the 'endpoint' parameter (e.g. https://query.wikidata.org/sparql).",
      "Always declare PREFIX statements inside the query string.",
      "For Wikidata specifically, prefer sparql_query_wikidata — it injects standard prefixes automatically.",
    ],
    parameters: Type.Object({
      endpoint: Type.String({
        description:
          "Full URL of the SPARQL endpoint to query " +
          "(e.g. https://query.wikidata.org/sparql, https://dbpedia.org/sparql).",
      }),
      query: Type.String({
        description: "SPARQL 1.1 query string (SELECT, ASK, CONSTRUCT, or DESCRIBE). " +
          "Include all required PREFIX declarations.",
      }),
      format: Type.Optional(
        StringEnum(["table", "json", "csv", "turtle"] as const, {
          description: "Output format ('table'|'json'|'csv'|'turtle'). Use 'turtle' for CONSTRUCT/DESCRIBE.",
          default: "table",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const fmt = params.format ?? "table";
      const { output, isError } = await queryEndpoint(
        params.endpoint,
        params.query,
        fmt,
        ctx.cwd
      );
      return {
        content: [{ type: "text", text: output }],
        ...(isError ? { isError: true } : {}),
      };
    },
  });

  // ── sparql_query_wikidata ──────────────────────────────────────────────────
  pi.registerTool({
    name: "sparql_query_wikidata",
    label: "SPARQL Query (Wikidata)",
    description:
      "Query the Wikidata Knowledge Graph for real-world facts — people, places, events, organisations, " +
      "species, works of art, historical dates, geographic data, scientific concepts, and anything else " +
      "that might appear in Wikipedia or an encyclopedia. " +
      "Use this tool instead of relying on training knowledge whenever the user asks a factual question. " +
      "Standard Wikidata prefixes (wd:, wdt:, wikibase:, p:, ps:, pq:, rdfs:, schema:, …) " +
      "are injected automatically — you do not need to declare them.",
    promptGuidelines: [
      "Use sparql_query_wikidata whenever the user asks about real-world facts that could appear in Wikipedia — people, places, dates, organisations, species, works, geography, science, history, etc. Prefer live data over training knowledge.",
      "Standard Wikidata prefixes (wd:, wdt:, wikibase:, p:, ps:, pq:, rdfs:, schema:, skos:, owl:, xsd:, bd:) are injected automatically into sparql_query_wikidata queries.",
      "Reference Wikidata entities as wd:Q<number> and properties as wdt:P<number>.",
      "Use rdfs:label with FILTER(LANG(?label) = 'en') to retrieve English labels.",
      "Use wikibase:label service for efficient label fetching: SERVICE wikibase:label { bd:serviceParam wikibase:language 'en'. }",
    ],
    parameters: Type.Object({
      query: Type.String({
        description:
          "SPARQL 1.1 query for Wikidata. " +
          "Standard prefixes (wd:, wdt:, wikibase:, etc.) are pre-declared — omit them or include them, both work. " +
          "Use wd:Q<number> for entities and wdt:P<number> for direct properties.",
      }),
      format: Type.Optional(
        StringEnum(["table", "json", "csv", "turtle"] as const, {
          description: "Output format ('table'|'json'|'csv'|'turtle'). Defaults to 'table'.",
          default: "table",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const fmt = params.format ?? "table";
      const queryWithPrefixes = injectWikidataPrefixes(params.query);
      const { output, isError } = await queryEndpoint(
        WIKIDATA_ENDPOINT,
        queryWithPrefixes,
        fmt,
        ctx.cwd
      );
      return {
        content: [{ type: "text", text: output }],
        ...(isError ? { isError: true } : {}),
      };
    },
  });
}
