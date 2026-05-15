/**
 * shacl_create_shape tool — LLM-authored SHACL shapes with user confirmation.
 *
 * The LLM builds the complete shape (IRI, target class, property constraints)
 * from context, then calls this tool to present a human-readable summary to
 * the user and ask for approval before writing the Turtle file.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { buildNodeShape, type NodeShapeSpec, type PropertyShapeSpec, type XsdDatatype } from "./lib/shacl-builder.js";
import { writeRdf } from "./lib/rdf-write.js";

// ── Schema ────────────────────────────────────────────────────────────────────

const PropertyShapeSchema = Type.Object({
  name: Type.String({ description: "Human-readable label for this property (sh:name)" }),
  path: Type.String({ description: "RDF property path, e.g. ex:email or foaf:name" }),
  datatype: Type.Optional(
    Type.Union([
      Type.Literal("xsd:string"),
      Type.Literal("xsd:integer"),
      Type.Literal("xsd:decimal"),
      Type.Literal("xsd:boolean"),
      Type.Literal("xsd:date"),
      Type.Literal("xsd:dateTime"),
      Type.Literal("xsd:anyURI"),
    ], { description: "XSD datatype constraint" })
  ),
  nodeKind: Type.Optional(
    Type.Union([
      Type.Literal("sh:IRI"),
      Type.Literal("sh:Literal"),
      Type.Literal("sh:BlankNode"),
      Type.Literal("sh:BlankNodeOrIRI"),
    ], { description: "sh:nodeKind constraint" })
  ),
  classConstraint: Type.Optional(Type.String({ description: "sh:class constraint, e.g. ex:Address" })),
  minCount: Type.Optional(Type.Number({ description: "sh:minCount" })),
  maxCount: Type.Optional(Type.Number({ description: "sh:maxCount" })),
  pattern: Type.Optional(Type.String({ description: "sh:pattern regex" })),
  minLength: Type.Optional(Type.Number({ description: "sh:minLength" })),
  maxLength: Type.Optional(Type.Number({ description: "sh:maxLength" })),
});

// ── Extension entry-point ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "shacl_create_shape",
    label: "Create SHACL Shape",
    description:
      "Presents the SHACL NodeShape the LLM has designed to the user for approval, " +
      "then writes it as a validated Turtle file. " +
      "The LLM must supply all shape details (IRI, target class, property constraints). " +
      "Call this tool once the shape design is complete.",
    promptSnippet: "Design and write a SHACL NodeShape to a .ttl file",
    promptGuidelines: [
      "Use shacl_create_shape when the user asks to create a SHACL shape: design the full shape yourself from context, then call this tool to write the file.",
    ],
    parameters: Type.Object({
      shapeIri: Type.String({
        description: "Shape IRI, e.g. ex:PersonShape",
      }),
      targetClass: Type.Optional(Type.String({
        description: "sh:targetClass, e.g. ex:Person",
      })),
      label: Type.Optional(Type.String({
        description: "Human-readable label for the shape",
      })),
      properties: Type.Array(PropertyShapeSchema, {
        description: "Property constraints to include in the shape",
      }),
      outputPath: Type.String({
        description: "Destination file path relative to the workspace, e.g. shapes/PersonShape.ttl",
      }),
      prefixes: Type.Optional(Type.Record(Type.String(), Type.String(), {
        description: "Namespace prefix map, e.g. { ex: 'http://example.org/' }",
      })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const spec: NodeShapeSpec = {
        shapeIri:    params.shapeIri,
        targetClass: params.targetClass,
        label:       params.label,
        properties:  params.properties as PropertyShapeSpec[],
      };

      const { turtle, suggestedFileName } = buildNodeShape(spec, params.prefixes ?? {});
      const outputPath = params.outputPath || suggestedFileName;

      // Write the file
      try {
        const writeResult = await writeRdf({
          turtle,
          path:   outputPath,
          format: "turtle",
          cwd:    ctx.cwd,
        });

        return {
          content: [
            {
              type: "text",
              text:
                `SHACL shape written.\n\n${writeResult.summary}\n\n` +
                `\`\`\`turtle\n${turtle}\`\`\``,
            },
          ],
          details: {
            shapeIri:    spec.shapeIri,
            targetClass: spec.targetClass,
            properties:  spec.properties.length,
            path:        writeResult.absPath,
            tripleCount: writeResult.tripleCount,
            turtle,
          },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to write shape: ${(err as Error).message}`,
            },
          ],
          isError: true,
          details: { error: (err as Error).message },
        };
      }
    },

    renderCall(args, theme) {
      const iri   = typeof args.shapeIri === "string" ? args.shapeIri : "…";
      const props = Array.isArray(args.properties) ? args.properties.length : 0;
      const text  =
        theme.fg("toolTitle", theme.bold("shacl_create_shape ")) +
        theme.fg("accent", iri) +
        theme.fg("muted", `  ${props} propert${props === 1 ? "y" : "ies"}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const d = result.details as Record<string, unknown> | undefined;
      if (!d) return new Text("", 0, 0);

      const triples = typeof d.tripleCount === "number" ? d.tripleCount : "?";
      const path    = typeof d.path        === "string" ? d.path        : "";
      return new Text(
        theme.fg("success", "✓ Written ") +
        theme.fg("muted", `${triples} triples → `) +
        theme.fg("dim", path),
        0, 0
      );
    },
  });
}
