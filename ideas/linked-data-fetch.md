# Idea: `ld_fetch` Tool + `linked-data-fetch` Skill (Linked Data Dereferencing)

## Problem

Linked Data resources are meant to be *dereferenceable* — you can GET a URI
and receive RDF. But the agent currently has no first-class tool to do this.
The workaround is `bash` + `curl`, which:
- Returns raw text with no format detection or normalisation.
- Does not negotiate content type (`text/turtle`, `application/ld+json`, …).
- Does not validate the returned RDF.
- Produces no structured result the agent can act on.

## Proposed Tool: `ld_fetch`

```
ld_fetch(uri, targetPath?, format?)
```

| Parameter    | Description |
|--------------|-------------|
| `uri`        | HTTP/HTTPS URI of the Linked Data resource to dereference. |
| `targetPath` | Optional. If provided, the fetched graph is written to this local file (same semantics as `rdf_write`). |
| `format`     | Preferred output format. Defaults to `"turtle"`. |

**Behaviour**:
1. Sends a `GET` with `Accept: text/turtle, application/ld+json;q=0.9, application/n-triples;q=0.8, */*;q=0.1`.
2. Detects the actual `Content-Type` of the response.
3. Parses the response body as RDF using the appropriate parser.
4. Returns a summary (triple count, detected format, effective URI after
   redirects) and, optionally, writes to `targetPath`.
5. Validates the fetched RDF; returns clear error on parse failure.

**Implementation**: Node `fetch` for HTTP; n3 + existing parsers for Turtle/N-Triples; `@rdfjs/parser-jsonld` for JSON-LD; `rdfxml-streaming-parser` for RDF/XML.

## New Skill: `linked-data-fetch`

Guides the agent to:
1. Use `ld_fetch` whenever the user asks to "look up", "resolve", or "get"
   a URI (e.g. a Wikidata entity page, a schema.org term, a FOAF profile).
2. Save the fetched graph locally with `targetPath` before querying it.
3. Chain with `sparql_query_files` to interrogate the fetched graph.
4. Follow `owl:sameAs` and `rdfs:seeAlso` links when the user wants a richer
   view.

## Example Workflow

```
User: "Fetch the Linked Data description of the FOAF vocabulary and tell me
       which classes it defines."

Agent:
  1. ld_fetch(uri="http://xmlns.com/foaf/0.1/", targetPath="foaf.ttl")
  2. sparql_query_files(files=["foaf.ttl"],
       query="SELECT DISTINCT ?class WHERE { ?class a owl:Class } ORDER BY ?class")
```

## Why This Fits the Package

`ld_fetch` closes the "ingest from the web" gap that `rdf_write` (local
authoring) and `sparql_query_endpoint` (remote query) leave open. It gives
the agent a complete ingest → query → write cycle for real Linked Data.
