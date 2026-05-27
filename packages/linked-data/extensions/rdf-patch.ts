import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { patchRdf } from "./lib/rdf-patch.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "rdf_patch",
    label: "RDF Patch",
    description:
      "Applies a SPARQL Update (INSERT DATA / DELETE DATA / DELETE…INSERT…WHERE) " +
      "to an existing RDF file and rewrites it in place. " +
      "Prefer over rdf_write for surgical triple-level changes.",
    promptSnippet:
      "Patch individual triples in an existing RDF file via SPARQL Update",
    promptGuidelines: [
      "Use rdf_patch for surgical add/remove/replace of triples; use rdf_write to overwrite whole files.",
      "rdf_patch supports Turtle (.ttl) only.",
    ],
    parameters: Type.Object({
      path: Type.String({
        description:
          "Path to the existing RDF file, relative to the workspace. " +
          "Currently supports .ttl (Turtle) files only.",
      }),
      update: Type.String({
        description:
          "A valid SPARQL Update statement. " +
          "Examples: INSERT DATA { ... }, DELETE DATA { ... }, " +
          "DELETE { ... } INSERT { ... } WHERE { ... }.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await patchRdf({
          path:   params.path,
          update: params.update,
          cwd:    ctx.cwd,
        });

        return {
          content: [{ type: "text", text: result.summary }],
          details: {
            path:          result.absPath,
            format:        result.format,
            triplesBefore: result.triplesBefore,
            triplesAfter:  result.triplesAfter,
          },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `rdf_patch failed — file NOT modified.\n\n${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
