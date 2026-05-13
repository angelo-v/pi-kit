/**
 * RDF serialisation helpers.
 *
 * Converts an array of N3 `Quad` objects to a string in the requested
 * output format (Turtle, N-Triples, N-Quads, or JSON-LD).
 */

import { Writer } from "n3";
import type { Quad } from "n3";
import jsonld from "jsonld";
import type { OutputFormat } from "./rdf-format.js";

/** Maps our `OutputFormat` identifiers to the string expected by `n3.Writer`. */
const N3_FORMAT: Readonly<Record<Exclude<OutputFormat, "jsonld">, string>> = {
  turtle:   "Turtle",
  ntriples: "N-Triples",
  nquads:   "N-Quads",
};

/**
 * Serialises `quads` to an N-Quads string suitable for `jsonld.fromRDF`.
 * Handles blank nodes, literals (with language tags and datatypes), and IRIs.
 */
function quadsToNQuadString(quads: Quad[]): string {
  return quads
    .map((q) => {
      const s =
        q.subject.termType === "BlankNode"
          ? `_:${q.subject.value}`
          : `<${q.subject.value}>`;

      const p = `<${q.predicate.value}>`;

      const o =
        q.object.termType === "Literal"
          ? q.object.language
            ? `"${escapeLiteral(q.object.value)}"@${q.object.language}`
            : `"${escapeLiteral(q.object.value)}"^^<${q.object.datatype.value}>`
          : q.object.termType === "BlankNode"
            ? `_:${q.object.value}`
            : `<${q.object.value}>`;

      return `${s} ${p} ${o} .`;
    })
    .join("\n");
}

/** Escapes backslashes, double-quotes, and newlines inside a literal value. */
function escapeLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Serialises quads to JSON-LD (compacted form).
 */
async function serializeJsonLd(quads: Quad[]): Promise<string> {
  const nquads = quadsToNQuadString(quads);
  const doc = await jsonld.fromRDF(nquads, { format: "application/n-quads" });
  const compacted = await jsonld.compact(doc, {});
  return JSON.stringify(compacted, null, 2);
}

/**
 * Serialises quads using the n3 `Writer` (Turtle, N-Triples, or N-Quads).
 *
 * @param quads     Quads to serialise.
 * @param format    Target format (must not be `"jsonld"`).
 * @param prefixes  Namespace prefix map to embed in Turtle output.
 */
async function serializeN3(
  quads: Quad[],
  format: Exclude<OutputFormat, "jsonld">,
  prefixes: Record<string, string>
): Promise<string> {
  const writer = new Writer({
    format: N3_FORMAT[format],
    prefixes: format === "turtle" ? prefixes : undefined,
  });
  for (const quad of quads) writer.addQuad(quad);
  return new Promise<string>((resolve, reject) => {
    writer.end((err, result) => (err ? reject(err) : resolve(result)));
  });
}

/**
 * Serialises an array of quads to the requested output format string.
 *
 * @param quads     Quads to serialise.
 * @param format    Target serialisation format.
 * @param prefixes  Prefix declarations to include (used for Turtle output only).
 */
export async function serialize(
  quads: Quad[],
  format: OutputFormat,
  prefixes: Record<string, string> = {}
): Promise<string> {
  if (format === "jsonld") {
    return serializeJsonLd(quads);
  }
  return serializeN3(quads, format, prefixes);
}
