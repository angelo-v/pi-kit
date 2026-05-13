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
 * Parses a Turtle string and returns all quads and prefix declarations.
 *
 * @param turtle  Valid RDF/Turtle text (must include prefix declarations).
 * @throws        An `Error` whose message contains the parser diagnostic when
 *                the input is syntactically invalid.
 */
export async function parseTurtle(turtle: string): Promise<ParseResult> {
  const store = new Parser({ format: "Turtle" });
  const quads: Quad[] = [];
  const prefixes: Record<string, string> = {};

  return new Promise<ParseResult>((resolve, reject) => {
    store.parse(turtle, (err, quad, parsedPrefixes) => {
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
