/**
 * Turtle parser wrapper.
 *
 * Provides a Promise-based interface over the callback-driven n3 `Parser`,
 * returning both the parsed quads and any namespace prefix declarations
 * found in the source.
 */

import type {Quad} from "n3";
import {Parser} from "n3";

export interface ParseResult {
  /** All quads extracted from the Turtle source. */
  quads: Quad[];
  /** Prefix map collected during parsing (e.g. `{ ex: "http://example.org/" }`). */
  prefixes: Record<string, string>;
}

/**
 * Options for {@link parseTurtle}.
 */
export interface ParseTurtleOptions {
  /**
   * Base IRI used to resolve relative IRIs in the source (e.g. the file's
   * own `file://` URL). Relative references are appended verbatim when
   * omitted — the right behavior for raw strings with no document location.
   * An explicit `@base` in the source still overrides this.
   */
  baseIRI?: string;
}

/**
 * Parses a Turtle string and returns all quads and prefix declarations.
 *
 * @param turtle   Valid RDF/Turtle text (must include prefix declarations).
 * @param options  Optional {@link ParseTurtleOptions} with a `baseIRI`.
 * @throws         An `Error` whose message contains the parser diagnostic when
 *                 the input is syntactically invalid.
 */
export async function parseTurtle(
  turtle: string,
  options: ParseTurtleOptions = {}
): Promise<ParseResult> {
  // Preserve relative URIs verbatim when no baseIRI is given: n3 leaves
  // `_baseRoot` unset without one, so resolving e.g.
  // </contacts/jane-doe.ttl#this> yields the string "undefined/contacts/...".
  // With "#" the parser strips the fragment and sets `_baseRoot` to "",
  // so relative references concatenate to an empty prefix and survive intact.
  // An explicit `@base` in the source still overrides this.
  const parser = new Parser({ format: "Turtle", baseIRI: options.baseIRI ?? "#" });
  const quads: Quad[] = [];
  const prefixes: Record<string, string> = {};

  return new Promise<ParseResult>((resolve, reject) => {
    parser.parse(turtle, (err, quad, parsedPrefixes) => {
      if (err) {
        reject(err);
        return;
      }
      if (parsedPrefixes) {
        Object.assign(prefixes, parsedPrefixes);
      }
      if (quad) {
        quads.push(quad);
      } else {
        // quad is null → end of stream
        resolve({ quads, prefixes });
      }
    });
  });
}
