/**
 * sparql-query-files extension
 *
 * Registers a `sparql_query_files` tool that runs SPARQL 1.1 queries
 * (SELECT, ASK, CONSTRUCT, DESCRIBE) against local RDF/Turtle files
 * using the Comunica `comunica-sparql-file` CLI.
 *
 * Sources are passed as file:// URIs. Multiple --file arguments are supported.
 * The LLM supplies structured parameters; this extension builds and executes
 * the command deterministically.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { findBinary } from "./lib/find-binary.js";
import { findByExtensions, RDF_EXTENSIONS, QUERY_EXTENSIONS } from "./lib/find-files.js";
import { resolveSources } from "./lib/resolve-sources.js";
import { buildArgs } from "./lib/format.js";
import { ensureLimit } from "./lib/limit-query.js";
import { runQuery } from "./lib/run-query.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "sparql_query_files",
    label: "SPARQL Query (local files)",
    description:
      "Run a SPARQL 1.1 query (SELECT/ASK/CONSTRUCT/DESCRIBE) against local RDF/Turtle files using Comunica.",
    promptGuidelines: [
      "Use sparql_query_files to query, explore, or analyse local RDF/Turtle files with SPARQL.",
      "Always prefer named-individual graph traversal over FILTER(CONTAINS(...)) string matching.",
    ],
    parameters: Type.Object({
      files: Type.Array(Type.String(), {
        description: "File paths to query (relative or absolute). Run discover_rdf_files first if unknown.",
        minItems: 1,
      }),
      query: Type.String({
        description: "SPARQL 1.1 query string (SELECT, ASK, CONSTRUCT, or DESCRIBE).",
      }),
      format: Type.Optional(
        StringEnum(["table", "json", "csv", "turtle"] as const, {
          description: "Output format ('table'|'json'|'csv'|'turtle'). Use 'turtle' for CONSTRUCT/DESCRIBE.",
          default: "table",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;

      let binary: string;
      try {
        binary = findBinary(cwd, import.meta.url);
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
          details: {},
        };
      }

      const { sources, missing } = resolveSources(params.files, cwd);
      if (missing.length > 0) {
        return {
          content: [{ type: "text", text: `File(s) not found:\n${missing.join("\n")}` }],
          isError: true,
          details: { missing },
        };
      }

      const fmt = params.format ?? "table";
      const query = ensureLimit(params.query);
      const args = buildArgs(sources, query, fmt);

      try {
        const { output } = await runQuery(binary, args, cwd);
        return {
          content: [{ type: "text", text: output }],
        };
      } catch (err: any) {
        const msg = err.stderr || err.stdout || err.message;
        return {
          content: [{ type: "text", text: `SPARQL Error:\n${msg}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "discover_rdf_files",
    label: "Discover RDF Files",
    description:
      "Finds all RDF/Turtle data files (.ttl, .rdf, .n3, .jsonld, .trig, .nq, .nt) in the workspace.",
    promptGuidelines: [
      "Run discover_rdf_files before sparql_query_files when the user has not specified which RDF files to query.",
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const files = findByExtensions(ctx.cwd, RDF_EXTENSIONS);
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "No RDF files found in the workspace." }],
          details: { files: [] },
        };
      }
      const rel = files.map((f) => f.replace(ctx.cwd + "/", ""));
      return {
        content: [{ type: "text", text: rel.join("\n") }],
        details: { files: rel },
      };
    },
  });

  pi.registerTool({
    name: "discover_sparql_queries",
    label: "Discover SPARQL Query Files",
    description:
      "Finds all SPARQL query files (.rq, .sparql) in the workspace.",
    promptGuidelines: [
      "Run discover_sparql_queries before writing a new SPARQL query to check for reusable .rq files.",
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const files = findByExtensions(ctx.cwd, QUERY_EXTENSIONS);
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "No SPARQL query files found in the workspace." }],
          details: { files: [] },
        };
      }
      const rel = files.map((f) => f.replace(ctx.cwd + "/", ""));
      return {
        content: [{ type: "text", text: rel.join("\n") }],
        details: { files: rel },
      };
    },
  });
}
