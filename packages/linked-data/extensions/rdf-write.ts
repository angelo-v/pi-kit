import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { writeRdf } from "./lib/rdf-write.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "rdf_write",
    label: "RDF Write",
    description:
      "Validates RDF/Turtle text, then writes it to a file in the workspace. " +
      "Optionally converts to JSON-LD, N-Triples, or N-Quads. " +
      "Always use this tool instead of the built-in write tool when writing RDF data.",
    promptSnippet:
      "Validate Turtle and write RDF to a file (supports Turtle, JSON-LD, N-Triples, N-Quads output)",
    promptGuidelines: [
      "Use rdf_write instead of the write tool whenever writing any RDF file (.ttl, .jsonld, .nt, .nq). Never write RDF using the write tool directly.",
    ],
    parameters: Type.Object({
      turtle: Type.String({
        description:
          "Valid RDF/Turtle text to parse and write. Must include prefix declarations.",
      }),
      path: Type.String({
        description:
          "Destination file path relative to the workspace. " +
          "Extension determines default output format: .ttl → Turtle, .jsonld → JSON-LD, .nt → N-Triples, .nq → N-Quads.",
      }),
      format: Type.Optional(
        Type.Union(
          [
            Type.Literal("turtle"),
            Type.Literal("jsonld"),
            Type.Literal("ntriples"),
            Type.Literal("nquads"),
          ],
          {
            description:
              "Output format. Overrides the format inferred from the file extension.",
          }
        )
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await writeRdf({
          turtle: params.turtle,
          path:   params.path,
          format: params.format,
          cwd:    ctx.cwd,
        });

        return {
          content: [{ type: "text", text: result.summary }],
          details: {
            path:        result.absPath,
            format:      result.format,
            tripleCount: result.tripleCount,
          },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Parse error — file NOT written.\n\n${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
