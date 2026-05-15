/**
 * shacl-shapes-for-class extension
 *
 * Registers a `discover_shapes_for_class` tool that queries local SHACL files
 * with SPARQL to find all NodeShapes that target a given OWL/RDFS class.
 *
 * The tool auto-discovers *.shacl.ttl files in the workspace when no shapes
 * files are provided explicitly, mirroring the behaviour of `rdf_validate`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import * as nodePath from "node:path";
import { existsSync } from "node:fs";

import { findByFullSuffix, SHACL_EXTENSIONS } from "./lib/find-files.js";
import { findBinary } from "./lib/find-binary.js";
import { buildArgs } from "./lib/format.js";
import { runQuery } from "./lib/run-query.js";
import {
  findShapesForClass,
  formatFindShapesResult,
  type RunQueryFn,
} from "./lib/find-shapes-for-class.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "discover_shapes_for_class",
    label: "Discover SHACL Shapes for Class",
    description:
      "Queries local SHACL files with SPARQL to discover all NodeShapes that " +
      "target a given class IRI via sh:targetClass. " +
      "Auto-discovers *.shacl.ttl files in the workspace when no shapes files are provided.",
    promptSnippet: "Find SHACL shapes targeting a class via SPARQL",
    promptGuidelines: [
      "Use discover_shapes_for_class to find which SHACL shapes apply to a given RDF class before validating or editing data.",
    ],
    parameters: Type.Object({
      classIri: Type.String({
        description:
          "Fully-qualified IRI of the class to search for, e.g. http://example.org/Person.",
      }),
      shapesFiles: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "SHACL shapes file path(s) to search (relative or absolute). " +
            "When omitted, the tool auto-discovers *.shacl.ttl files in the workspace.",
          minItems: 1,
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;

      // ── Resolve shapes file paths ──────────────────────────────────────────
      let shapesFiles: string[];

      if (params.shapesFiles && params.shapesFiles.length > 0) {
        shapesFiles = params.shapesFiles.map((f) => nodePath.resolve(cwd, f));
        const missing = shapesFiles.filter((f) => !existsSync(f));
        if (missing.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `Shapes file(s) not found:\n${missing
                  .map((f) => nodePath.relative(cwd, f))
                  .join("\n")}`,
              },
            ],
            isError: true,
            details: { shapes: [], classIri: params.classIri },
          };
        }
      } else {
        shapesFiles = findByFullSuffix(cwd, SHACL_EXTENSIONS);
        if (shapesFiles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "No SHACL shapes files found in the workspace. " +
                  "Provide shapes file paths explicitly, or add *.shacl.ttl files to the workspace.",
              },
            ],
            isError: true,
            details: { shapes: [], classIri: params.classIri },
          };
        }
      }

      // ── Locate the Comunica binary ─────────────────────────────────────────
      let binary: string;
      try {
        binary = findBinary(cwd, import.meta.url);
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
          details: { shapes: [], classIri: params.classIri },
        };
      }

      // ── Build the injectable RunQueryFn backed by Comunica ─────────────────
      const sourceUris = shapesFiles.map((f) => `file://${f}`);

      const comunica: RunQueryFn = async (query, sources) => {
        const args = buildArgs(sources, query, "json");
        const { output } = await runQuery(binary, args, cwd);

        // Comunica JSON output for SELECT: { results: { bindings: [...] } }
        let parsed: any;
        try {
          parsed = JSON.parse(output);
        } catch {
          return [];
        }

        const bindings: Array<Record<string, { value: string }>> =
          parsed?.results?.bindings ?? [];

        return bindings.map((b) => {
          const row: Record<string, string> = {};
          for (const [k, v] of Object.entries(b)) {
            row[k] = (v as { value: string }).value;
          }
          return row;
        });
      };

      // ── Run the discovery query ────────────────────────────────────────────
      try {
        const result = await findShapesForClass(
          params.classIri,
          sourceUris,
          comunica
        );

        const text = formatFindShapesResult(result, shapesFiles);

        return {
          content: [{ type: "text", text }],
          details: {
            classIri:    result.classIri,
            shapeCount:  result.shapes.length,
            shapes:      result.shapes,
            shapesFiles: shapesFiles.map((f) => nodePath.relative(cwd, f)),
          },
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Query error: ${err.message}`,
            },
          ],
          isError: true,
          details: { shapes: [], classIri: params.classIri },
        };
      }
    },

    renderCall(args, theme) {
      const iri = typeof args.classIri === "string" ? args.classIri : "…";
      return new Text(
        theme.fg("toolTitle", theme.bold("discover_shapes_for_class ")) +
          theme.fg("accent", iri),
        0,
        0
      );
    },

    renderResult(result, _options, theme) {
      const d = result.details as Record<string, unknown> | undefined;
      if (!d) return new Text("", 0, 0);

      if (result.isError) {
        const msg =
          (result.content?.[0] as { text?: string } | undefined)?.text ?? "Error";
        return new Text(theme.fg("error", `✗ ${msg}`), 0, 0);
      }

      const count =
        typeof d.shapeCount === "number" ? d.shapeCount : "?";
      const label = count === 1 ? "shape" : "shapes";

      return new Text(
        count === 0
          ? theme.fg("muted", `○ No shapes found`)
          : theme.fg("success", `✓ ${count} ${label} found`),
        0,
        0
      );
    },
  });
}
