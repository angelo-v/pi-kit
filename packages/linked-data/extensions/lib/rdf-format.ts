/**
 * Output-format helpers for the rdf_write tool.
 *
 * Provides the shared `OutputFormat` type, file-extension inference,
 * and a human-readable label for each format.
 */

/** Supported RDF serialisation format identifiers. */
export type OutputFormat = "turtle" | "jsonld" | "ntriples" | "nquads";

/**
 * Infers the desired output format from a file path's extension.
 * Falls back to `"turtle"` for any unrecognised extension.
 *
 * @param filePath  The destination file path (only the extension matters).
 */
export function inferFormat(filePath: string): OutputFormat {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".ttl":    return "turtle";
    case ".jsonld":
    case ".json":   return "jsonld";
    case ".nt":     return "ntriples";
    case ".nq":     return "nquads";
    default:        return "turtle";
  }
}

/** Maps each `OutputFormat` to a human-readable display label. */
export const FORMAT_LABEL: Readonly<Record<OutputFormat, string>> = {
  turtle:   "Turtle",
  jsonld:   "JSON-LD",
  ntriples: "N-Triples",
  nquads:   "N-Quads",
};
