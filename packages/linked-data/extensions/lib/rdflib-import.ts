/**
 * rdflib-import.ts
 *
 * Thin re-export of the rdflib symbols used by ld-fetch-store.
 *
 * Importing via this indirection lets tests mock a single stable path
 * (`./rdflib-import.js`) while the production code avoids the rdflib
 * CJS circular-dep bug (store.js → index.js → store.js makes
 * _store.default undefined at class-definition time when jiti, pi's
 * extension loader, transpiles ESM imports to CJS require() calls).
 *
 * Workaround: resolve rdflib's ESM entry point by path at import time
 * so jiti loads it as ESM rather than resolving the bare "rdflib"
 * specifier to the broken lib/index.js CJS build.
 *
 * Additionally, we patch the global Node constant for rdflib's XMLHandler
 * which uses Node.ELEMENT_NODE but doesn't define Node for Node.js environments.
 */

import { createRequire } from "node:module";

const _req = createRequire(import.meta.url);
const rdflibEsm = _req.resolve("rdflib").replace("/lib/index.js", "/esm/index.js");

// Patch global Node constant for rdflib's XMLHandler
// rdflib uses Node.ELEMENT_NODE in fetcher.js but doesn't define Node for Node.js
// See: docs/bugs/ld-fetch-rdf-xml/rdflib-node-missing-constant.md
if (typeof globalThis.Node === 'undefined') {
  // @ts-ignore - We're adding a global for rdflib compatibility
  // Must be a function/class so that `x instanceof Node` does not throw
  // "Right-hand side of 'instanceof' is not callable" (Vitest's toContain
  // uses instanceof Node when globalThis.Node is defined).
  function NodePolyfill() {}
  NodePolyfill.ELEMENT_NODE = 1;
  NodePolyfill.ATTRIBUTE_NODE = 2;
  NodePolyfill.TEXT_NODE = 3;
  NodePolyfill.CDATA_SECTION_NODE = 4;
  NodePolyfill.ENTITY_REFERENCE_NODE = 5;
  NodePolyfill.ENTITY_NODE = 6;
  NodePolyfill.PROCESSING_INSTRUCTION_NODE = 7;
  NodePolyfill.COMMENT_NODE = 8;
  NodePolyfill.DOCUMENT_NODE = 9;
  NodePolyfill.DOCUMENT_TYPE_NODE = 10;
  NodePolyfill.DOCUMENT_FRAGMENT_NODE = 11;
  NodePolyfill.NOTATION_NODE = 12;
  // @ts-ignore
  globalThis.Node = NodePolyfill;
}

const { graph, Fetcher, serialize, parse } = await import(rdflibEsm);

export { graph, Fetcher, serialize, parse };
