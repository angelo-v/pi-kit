# Workaround: ld_fetch Support for RDF/XML (text/xml)

## **Problem**
The `ld_fetch` tool failed to fetch and parse the **A4G Ontology** (`https://publications.europa.eu/resource/authority/a4g/ontology`) because:
1. The server only serves RDF/XML with `Content-Type: text/xml;charset=UTF-8`
2. rdflib (the underlying library) has bugs that prevent it from parsing RDF/XML with `text/xml` content type in Node.js environments

## **Root Causes in rdflib**

### Bug 1: Missing Node Constant
In `node_modules/rdflib/lib/fetcher.js`, the `XMLHandler.isElement()` method uses:
```javascript
static isElement(node) {
  return node.nodeType === Node.ELEMENT_NODE;
}
```
The `Node` constant (from DOM) is not defined in Node.js environments.

### Bug 2: Broken Namespace Comparison  
In `XMLHandler.parse()` method (line ~238), there's a buggy comparison:
```javascript
if (ns && ns === ns['rdf']) {
```
This compares the namespace URI string to `undefined` (since `ns['rdf']` on a string is undefined), so the condition always fails. RDF/XML documents are never recognized and fall through to an "Unsupported dialect" error.

## **Bug Reports**
- Original bug report: [ld-fetch-a4g-rdf-xml-support.md](./ld-fetch-a4g-rdf-xml-support.md)
- Upstream rdflib bug report: [rdflib-node-missing-constant.md](./rdflib-node-missing-constant.md)

## **Workaround Implemented**

Since we cannot wait for rdflib to be fixed, we implemented a workaround in the pi-kit linked-data extension:

### Changes Made

#### 1. `/workdir/packages/linked-data/extensions/lib/rdflib-import.ts`
- Added a patch for the global `Node` constant before importing rdflib
- This ensures rdflib's `XMLHandler.isElement()` method can work in Node.js

#### 2. `/workdir/packages/linked-data/extensions/lib/ld-fetch-store.ts`
- Added `normalizeContentType()` function to normalize `text/xml` and `application/xml` to `application/rdf+xml`
- Added `customFetchAndParse()` function as a fallback for when rdflib fails to parse XML documents
- Modified `ldFetch()` to:
  - Try rdflib's Fetcher first (for content negotiation, redirects, etc.)
  - If rdflib fails with known XML-related errors, fall back to custom fetch + parse
  - Use native `fetch()` + rdflib's `parse()` directly for RDF/XML documents

### How the Workaround Works

1. When `ldFetch()` is called, it first tries to use rdflib's Fetcher
2. If the server returns `text/xml` or `application/xml`:
   - rdflib's Fetcher will try to parse it but may fail due to the bugs
   - If no triples are parsed or if an error occurs, we fall back to custom parsing
3. The custom parser:
   - Uses native `fetch()` to get the document
   - Normalizes the content type (e.g., `text/xml` → `application/rdf+xml`)
   - Uses rdflib's `parse()` function directly with the normalized content type
   - This bypasses the buggy `XMLHandler` in rdflib's Fetcher

## **Testing**

All existing tests pass:
```bash
cd /workdir/packages/linked-data
npm test -- --run extensions/lib/__tests__/ld-fetch-store.test.ts
# ✓ 13 tests passed
```

## **Verification**

To verify the fix works for the A4G ontology:

```javascript
// In a pi agent session:
ld_fetch({ uri: "https://publications.europa.eu/resource/authority/a4g/ontology" })

// Should return:
// Fetched <https://publications.europa.eu/resource/authority/a4g/ontology>
// Format:   text/xml;charset=UTF-8
// Triples:  <number>
// Graph:    <https://publications.europa.eu/resource/authority/a4g/ontology> in store "fetched-data"
// ...
```

## **Future Work**

1. **Upstream Fix**: Submit PR to rdflib to fix:
   - Add `Node` constant fallback for Node.js environments
   - Fix the namespace comparison bug in `XMLHandler.parse()`
   
2. **Remove Workaround**: Once rdflib is fixed, we can simplify the code by removing the custom fetch fallback.

## **Files Modified**
- `/workdir/packages/linked-data/extensions/lib/rdflib-import.ts` - Added Node constant patch
- `/workdir/packages/linked-data/extensions/lib/ld-fetch-store.ts` - Added workaround for XML parsing
