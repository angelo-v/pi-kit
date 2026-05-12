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
import { runQuery } from "./lib/run-query.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "sparql_query_files",
    label: "SPARQL Query (local files)",
    description:
      "Executes a SPARQL 1.1 query (SELECT, ASK, CONSTRUCT, DESCRIBE) against one or more " +
      "local RDF/Turtle files using Comunica. " +
      "Use this tool to query, explore, or analyse knowledge graphs, ontologies, or SKOS " +
      "vocabularies stored as .ttl, .rdf, or .n3 files in the workspace.",
    promptSnippet:
      "Run SPARQL queries against local RDF/Turtle files",
    promptGuidelines: [
      "Use sparql_query_files whenever the user asks to query, explore, or analyse a local RDF/Turtle file with SPARQL.",
      "Use sparql_query_files to discover classes and properties before constructing domain-specific queries.",
      "Always prefer named-individual graph traversal over FILTER(CONTAINS(...)) string matching in sparql_query_files queries.",
    ],
    parameters: Type.Object({
      files: Type.Array(Type.String(), {
        description:
          "Paths to RDF/Turtle files to query (relative to workspace root or absolute). " +
          "Use the `discover_rdf_files` tool first if you are unsure which files exist.",
        minItems: 1,
      }),
      query: Type.String({
        description: "SPARQL 1.1 query string (SELECT, ASK, CONSTRUCT, or DESCRIBE).",
      }),
      format: Type.Optional(
        StringEnum(["table", "json", "csv", "turtle"] as const, {
          description: "Output format. Defaults to 'table'. Use 'turtle' for CONSTRUCT/DESCRIBE.",
          default: "table",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;

      let binary: string;
      try {
        binary = findBinary(cwd);
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
      const args = buildArgs(sources, params.query, fmt);

      try {
        const { output } = await runQuery(binary, args, cwd);
        return {
          content: [{ type: "text", text: output }],
          details: { files: params.files, format: fmt },
        };
      } catch (err: any) {
        const msg = err.stderr || err.stdout || err.message;
        return {
          content: [{ type: "text", text: `SPARQL Error:\n${msg}` }],
          isError: true,
          details: { files: params.files, query: params.query },
        };
      }
    },
  });

  pi.registerTool({
    name: "discover_rdf_files",
    label: "Discover RDF Files",
    description:
      "Finds all RDF/Turtle data files (.ttl, .rdf, .n3, .jsonld, .trig, .nq, .nt) in the workspace. " +
      "Use this before sparql_query_files when the user has not specified which files to query.",
    promptSnippet: "List all RDF/Turtle data files in the workspace",
    promptGuidelines: [
      "Use discover_rdf_files before sparql_query_files when the user has not specified which RDF files to query.",
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
      "Finds all SPARQL query files (.rq, .sparql) in the workspace. " +
      "Use this to check for existing reusable queries before writing a new one.",
    promptSnippet: "List all SPARQL query files (.rq, .sparql) in the workspace",
    promptGuidelines: [
      "Use discover_sparql_queries before writing a new SPARQL query to check if a reusable .rq or .sparql file already exists.",
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
