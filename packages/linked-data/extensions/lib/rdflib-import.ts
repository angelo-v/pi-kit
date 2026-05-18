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
 */

import { createRequire } from "node:module";

const _req = createRequire(import.meta.url);
const rdflibEsm = _req.resolve("rdflib").replace("/lib/index.js", "/esm/index.js");
const { graph, Fetcher, serialize, parse } = await import(rdflibEsm);

export { graph, Fetcher, serialize, parse };
