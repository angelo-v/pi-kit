/**
 * rdf_validate tool — validate RDF files against SHACL shapes.
 *
 * Loads one or more data files and one or more shapes files, runs the
 * rdf-validate-shacl engine, and returns a conforms flag plus a table of
 * violations (focus node, path, message, severity).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import * as nodePath from "node:path";

import { findByFullSuffix, SHACL_EXTENSIONS } from "./lib/find-files.js";
import { validateShacl, formatValidationResult } from "./lib/shacl-validate.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "rdf_validate",
    label: "RDF Validate (SHACL)",
    description:
      "Validates one or more local RDF/Turtle files against SHACL shapes. " +
      "Returns a conforms flag and a table of violations (focus node, path, message, severity). " +
      "When no shapes files are provided, the tool auto-discovers *.shacl.ttl files in the workspace.",
    promptSnippet: "Validate RDF data files against SHACL shapes",
    promptGuidelines: [
      "Use rdf_validate to check whether RDF data conforms to SHACL shapes before presenting results to the user.",
      "Run discover_rdf_files first if the data or shapes file paths are unknown.",
      "When shapes files are not specified, rdf_validate auto-discovers *.shacl.ttl files in the workspace.",
    ],
    parameters: Type.Object({
      files: Type.Array(Type.String(), {
        description:
          "One or more local RDF data file paths to validate (relative or absolute). " +
          "Run discover_rdf_files first if unknown.",
        minItems: 1,
      }),
      shapes: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "SHACL shapes file path(s) to validate against. " +
            "When omitted, the tool auto-discovers *.shacl.ttl files in the workspace.",
          minItems: 1,
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;

      // Resolve data file paths
      const dataFiles = params.files.map((f) => nodePath.resolve(cwd, f));
      const missingData = dataFiles.filter(
        (f) => !existsSync(f)
      );
      if (missingData.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Data file(s) not found:\n${missingData.map((f) => nodePath.relative(cwd, f)).join("\n")}`,
            },
          ],
          isError: true,
          details: { conforms: false, violations: [] },
        };
      }

      // Resolve shapes file paths (auto-discover when not provided)
      let shapesFiles: string[];
      if (params.shapes && params.shapes.length > 0) {
        shapesFiles = params.shapes.map((f) => nodePath.resolve(cwd, f));
        const missingShapes = shapesFiles.filter((f) => !existsSync(f));
        if (missingShapes.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `Shapes file(s) not found:\n${missingShapes.map((f) => nodePath.relative(cwd, f)).join("\n")}`,
              },
            ],
            isError: true,
            details: { conforms: false, violations: [] },
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
                  "No SHACL shapes files found. " +
                  "Provide shapes file paths explicitly, or add *.shacl.ttl files to the workspace.",
              },
            ],
            isError: true,
            details: { conforms: false, violations: [] },
          };
        }
      }

      try {
        const result = await validateShacl({ dataFiles, shapesFiles });
        const text = formatValidationResult(result);
        return {
          content: [{ type: "text", text }],
          details: {
            conforms:        result.conforms,
            violationCount:  result.violations.length,
            violations:      result.violations,
            dataFiles:       dataFiles.map((f) => nodePath.relative(cwd, f)),
            shapesFiles:     shapesFiles.map((f) => nodePath.relative(cwd, f)),
          },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Validation error: ${(err as Error).message}`,
            },
          ],
          isError: true,
          details: { conforms: false, violations: [] },
        };
      }
    },

    renderCall(args, theme) {
      const files = Array.isArray(args.files) ? args.files : [];
      const label =
        theme.fg("toolTitle", theme.bold("rdf_validate ")) +
        theme.fg("accent", files.join(", "));
      return new Text(label, 0, 0);
    },

    renderResult(result, _options, theme) {
      const d = result.details as Record<string, unknown> | undefined;
      if (!d) return new Text("", 0, 0);

      if (result.isError) {
        const msg = (result.content?.[0] as { text?: string } | undefined)?.text ?? "Error";
        return new Text(theme.fg("error", `✗ ${msg}`), 0, 0);
      }

      if (d.conforms) {
        return new Text(theme.fg("success", "✓ Conforms"), 0, 0);
      }

      const count = typeof d.violationCount === "number" ? d.violationCount : "?";
      return new Text(
        theme.fg("error", `✗ ${count} violation${count === 1 ? "" : "s"}`),
        0,
        0
      );
    },
  });
}

// ── tiny sync helper (avoids importing node:fs at module level) ────────────────
import { existsSync } from "node:fs";
