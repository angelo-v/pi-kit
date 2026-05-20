# Bug Report: `ld_fetch` Fails on RDF/XML with text/xml Content-Type

## **Issue**
The `ld_fetch` tool fails to fetch and parse RDF/XML documents served with `Content-Type: text/xml` (such as `https://publications.europa.eu/resource/authority/a4g/ontology`).

## **Reproduction Steps**
1. Call `ld_fetch` with URI:
   `https://publications.europa.eu/resource/authority/a4g/ontology`
2. Observe error:
   `ld_fetch error for <uri>: Node is not defined`

## **Root Cause**
- The server only serves RDF/XML with `Content-Type: text/xml;charset=UTF-8`
- The tool expects Turtle/JSON-LD and fails due to rdflib bugs with XML parsing in Node.js
- rdflib's `XMLHandler` references the DOM `Node` constant which is undefined in Node.js

## **Workaround**
1. Download raw RDF/XML via `curl`:
   ```bash
   curl -L "https://publications.europa.eu/resource/authority/a4g/ontology" -o a4g.rdf
   ```
2. Convert to Turtle locally (e.g., using `rapper` or Python's `rdflib`).

## **Expected Fix**
- Extend `ld_fetch` to support RDF/XML parsing with `text/xml` content type
- See implemented workaround in: [ld-fetch-a4g-workaround.md](./ld-fetch-a4g-workaround.md)
