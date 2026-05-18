/**
 * rdf-schema-overview extension
 *
 * Registers the `rdf_schema_overview` tool, which returns type and predicate
 * usage statistics for an RDF dataset.  Two backends are supported:
 *
 *   store  — queries an Oxigraph rdf-memory store directly (no CLI needed)
 *   files  — queries local RDF files via the Comunica CLI
 *
 * Exactly one of `store` or `files` must be supplied per call.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { findBinary } from "./lib/find-binary.js";
import { resolveSources } from "./lib/resolve-sources.js";
import {
  overviewFromStore,
  overviewFromFiles,
  formatOverview,
} from "./lib/rdf-schema-overview.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "rdf_schema_overview",
    label: "RDF Schema Overview",
    description:
      "Returns type and predicate usage statistics (counts) for an RDF dataset. " +
      "Supply either a store name (rdf-memory) or one or more file paths (local RDF files) — not both. " +
      "Use this before writing any SPARQL query to discover what classes and properties are actually present.",
    promptGuidelines: [
      "Call rdf_schema_overview before writing a SPARQL query against an unfamiliar store or file set " +
        "to discover which types and predicates are present and how often they appear.",
      "Supply store for rdf-memory stores, files for local RDF files. Never supply both.",
    ],
    parameters: Type.Object({
      store: Type.Optional(
        Type.String({
          description:
            "rdf-memory store name to inspect (e.g. 'work-knowledge'). " +
            "Use rdf_memory_stores to list available stores.",
        })
      ),
      files: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Local RDF file paths to inspect (relative or absolute). " +
            "Use discover_rdf_files to find available files.",
          minItems: 1,
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const hasStore = typeof params.store === "string" && params.store.trim() !== "";
      const hasFiles = Array.isArray(params.files) && params.files.length > 0;

      if (!hasStore && !hasFiles) {
        return {
          content: [{ type: "text", text: "Error: supply either `store` or `files`." }],
          isError: true,
        };
      }
      if (hasStore && hasFiles) {
        return {
          content: [{ type: "text", text: "Error: supply `store` OR `files`, not both." }],
          isError: true,
        };
      }

      try {
        if (hasStore) {
          const overview = await overviewFromStore(params.store!);
          return {
            content: [{ type: "text", text: formatOverview(params.store!, overview) }],
            details: overview,
          };
        }

        // files path
        let binary: string;
        try {
          binary = findBinary(ctx.cwd, import.meta.url);
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }

        const { sources, missing } = resolveSources(params.files!, ctx.cwd);
        if (missing.length > 0) {
          return {
            content: [{ type: "text", text: `File(s) not found:\n${missing.join("\n")}` }],
            isError: true,
            details: { missing },
          };
        }

        const label = params.files!.join(", ");
        const overview = await overviewFromFiles(sources, binary, ctx.cwd);
        return {
          content: [{ type: "text", text: formatOverview(label, overview) }],
          details: overview,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });
}
