# Bug Report: rdflib - Multiple Issues Preventing RDF/XML Parsing in Node.js

## **Issues**

### Issue 1: Node is not defined
The rdflib library fails to parse RDF/XML documents in a Node.js environment when the server returns `Content-Type: text/xml` because the `XMLHandler.isElement()` method references the DOM `Node` constant, which is undefined in Node.js.

### Issue 2: Incorrect RDF namespace check
Even after fixing Issue 1, there's a second bug in the `XMLHandler.parse()` method at line 238 of `fetcher.js`:
```javascript
if (ns && ns === ns['rdf']) {
```
This compares the namespace URI string to itself (`ns['rdf']` is undefined, so it's comparing `ns === undefined`), which will always be false. It should be comparing to the RDF namespace URI constant:
```javascript
if (ns && ns === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#') {
```

## **Reproduction Steps**
1. Run Node.js (v18+) in a server-side environment
2. Use rdflib's Fetcher to load an RDF/XML document from a server that returns `Content-Type: text/xml`
3. Example:
```javascript
const { Fetcher, graph } = require('rdflib');
const store = graph();
const fetcher = new Fetcher(store, {});

// This URL returns Content-Type: text/xml;charset=UTF-8
fetcher.load('https://publications.europa.eu/resource/authority/a4g/ontology')
  .then(() => console.log('Success!'))
  .catch(err => console.log('Error:', err.message));
// Output: Error: Node is not defined
```

## **Root Cause**

### Issue 1: Missing Node constant
In `node_modules/rdflib/lib/fetcher.js`, the `XMLHandler` class has a static method:
```javascript
static isElement(node) {
  return node.nodeType === Node.ELEMENT_NODE;
}
```

This references the DOM `Node` constant (specifically `Node.ELEMENT_NODE` which has value 1), which is not available in Node.js environments.

### Issue 2: Broken namespace comparison
In the `XMLHandler.parse()` method (around line 238), there's a buggy comparison:
```javascript
if (ns && ns === ns['rdf']) {
```
This attempts to compare the namespace URI string (`ns`) with `ns['rdf']` (which is undefined, since `ns` is a string). This means the condition will always be false, so RDF/XML documents are never recognized as RDF/XML and fall through to the "Unsupported dialect" error.

## **Comparison with rdfaparser.js**
The `rdfaparser.js` module in the same library already handles this issue correctly:
```javascript
if (typeof Node === 'undefined') {
  var Node = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    // ... etc
  };
}
```

## **Expected Fix**

### Fix for Issue 1: Missing Node constant
The `fetcher.js` file should include a fallback definition for the `Node` constant at the top of the file, or the `XMLHandler.isElement()` method should use a local constant instead of the global `Node`.

**Suggested Patch for Issue 1:**
Add this near the top of `fetcher.js` (after other imports, before class definitions):
```javascript
// Fallback for Node constant in non-browser environments
if (typeof Node === 'undefined') {
  var Node = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    ENTITY_REFERENCE_NODE: 5,
    ENTITY_NODE: 6,
    PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
    NOTATION_NODE: 12
  };
}
```

### Fix for Issue 2: Broken namespace comparison
The comparison should use the actual RDF namespace URI string instead of trying to access a property of the namespace string.

**Suggested Patch for Issue 2:**
In `XMLHandler.parse()` method, change line ~238 from:
```javascript
if (ns && ns === ns['rdf']) {
```
to:
```javascript
if (ns && ns === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#') {
```

Or better yet, use the namespace constant that's already defined in the fetcher:
```javascript
if (ns && ns === this.ns.rdf('').value) {
```
(Note: The exact syntax may need adjustment based on how the namespace is accessed in the fetcher context.)

## **Impact**
This bug prevents rdflib from parsing RDF/XML documents served with `Content-Type: text/xml` in Node.js environments. Many Linked Data servers (including EU Publications Office) serve RDF/XML with this content type instead of `application/rdf+xml`.

## **Workaround**
Users can work around this by:
1. Downloading the RDF/XML file manually (e.g., via curl)
2. Converting it to Turtle or JSON-LD using a tool like `rapper` or Python's `rdflib`
3. Loading the converted file into rdflib

However, this defeats the purpose of using rdflib's content negotiation capabilities.

## **Additional Notes**
- The `XMLHandler` is registered as a default handler for `text/xml` and `application/xml` content types
- The handler attempts to detect if the XML is RDF/XML by checking the root element's namespace
- The bug occurs before this detection logic can run, in the `isElement()` helper method
- This affects any RDF/XML document served with `text/xml` content type in Node.js

## **Environment**
- Node.js: v18+
- rdflib: latest (tested with version from npm)
- Platform: Linux/macOS/Windows (any Node.js environment without DOM)
