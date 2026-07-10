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
  // Pass a fragment-only baseIRI ("#") so that relative URIs in the source
  // are preserved as-is rather than expanded against an "undefined" base.
  // n3 leaves `_baseRoot` unset when no baseIRI is given, so resolving e.g.
  // </contacts/jane-doe.ttl#this> yields the string "undefined/contacts/...".
  // With "#" the parser strips the fragment and sets `_baseRoot` to "",
  // so relative references concatenate to an empty prefix and survive intact.
  // This is the right default here because `turtle` is a raw string with no
  // real document location to resolve against; an explicit `@base` in the
  // source still overrides this.
  const store = new Parser({ format: "Turtle", baseIRI: "#" });
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
