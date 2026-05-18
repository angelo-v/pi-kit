# `ld_fetch` Tool + `linked-data-fetch` Skill (Linked Data Dereferencing)

> **Status: design resolved** — see ADR-0003 for the storage decision.
> Ready for implementation.

## Problem

Linked Data resources are meant to be *dereferenceable* — you can GET a URI
and receive RDF. But the agent currently has no first-class tool to do this.
The workaround is `bash` + `curl`, which:
- Returns raw text with no format detection or normalisation.
- Does not negotiate content type (`text/turtle`, `application/ld+json`, …).
- Does not parse or validate the returned RDF.
- Produces no structured result the agent can act on.
- Loses quad-level provenance (the document URI as the fourth component).

## Resolved Design

### Tool: `ld_fetch`

**Parameters:**

| Parameter | Type     | Required | Description                          |
|-----------|----------|----------|--------------------------------------|
| `uri`     | `string` | ✅        | HTTP/HTTPS URI to dereference        |

No `targetPath` or `format` parameter — the tool is fetch-and-memorise only.
Use `rdf_write` separately if a local file copy is also needed.

**Behaviour:**

Delegates entirely to **rdflib's `Fetcher`**, which handles all of the
following automatically — no bespoke code needed:

1. Content negotiation (`Accept` header covering Turtle, JSON-LD, RDF/XML,
   N-Triples, HTML+RDFa).
2. Format detection from the `Content-Type` response header.
3. Parsing with the appropriate built-in handler.
4. Redirect following; `link:redirectedTo` triple recorded automatically.
5. **Fetch metadata written as RDF** into the store's `chrome://TheCurrentSession`
   graph, using the W3C link/http/httph ontologies:
   - `link:requestedURI` — requested URI string
   - `link:response` → blank node with `http:status`, `http:statusText`
   - `httph:content-type`, `httph:last-modified`, `httph:etag`, … (all
     response headers, one triple each)
   - `rdf:type link:Document` / `link:RDFDocument` on the document node

After `Fetcher.load()` returns, the implementation:

6. Dumps the rdflib `graph()` store to N-Quads (preserving the
   `GRAPH <documentUri>` quad provenance) and loads it into the Oxigraph
   `"fetched-data"` store via `lib/oxigraph-store.ts`.
7. Flushes the Oxigraph store to disk atomically.
8. Returns a short summary to the agent:
   ```
   Fetched <https://xmlns.com/foaf/0.1/>
   Format:   text/turtle
   Triples:  631
   Graph:    <https://xmlns.com/foaf/0.1/> in store "fetched-data"
   Recorded: 2026-05-18T10:23:00Z

   Query with: rdf_memory_query(store="fetched-data", query="SELECT … WHERE { GRAPH <https://xmlns.com/foaf/0.1/> { … } }")
   ```

**Error cases:** `Fetcher.load()` rejects on non-2xx status or parse
failure → catch, return `isError: true` with the rdflib diagnostic message.
The `link:error` triple that rdflib adds to the store is also surfaced in the
summary.

### Storage

- **Store name:** `"fetched-data"` — fixed, no parameter. Dedicated to fetched
  web documents; separate from agent-synthesised memory (ADR-0003).
- **Named graph IRI:** the effective document URI (after redirects).
- **Meta registration:** `mem:meta` graph, same pattern as `rdf_memory_record`
  but extended with fetch-specific properties.
- Re-fetching the same URI replaces the existing graph atomically (`CLEAR GRAPH
  <uri>` then reload).

### Implementation

**Files to create:**
- `extensions/ld-fetch.ts` — extension entry-point; registers the `ld_fetch`
  tool; no business logic.
- `extensions/lib/ld-fetch-store.ts` — thin adapter:
  1. Creates an rdflib `graph()` + `Fetcher` and calls `fetcher.load(uri)`.
  2. Serialises the rdflib store to N-Quads (`rdflib.serialize` or iterate
     `store.statements`).
  3. Loads the N-Quads into Oxigraph via `lib/oxigraph-store.ts` (no
     hand-rolled metadata — rdflib already wrote it).
- `skills/linked-data-fetch/SKILL.md` — agent-facing skill.

**Files to modify:**
- `package.json` — register extension and skill under `"pi"`; add `rdflib`
  dependency.
- `CHANGELOG.md` — add entry under `[Unreleased]`.
- `CONTEXT.md` — add `ld_fetch` and `"fetched-data"` store as domain terms.

**Dependencies:** add `rdflib` (^2.3.8). n3 (still used elsewhere) and
oxigraph remain. Node built-in `fetch` is used by rdflib internally.

### Skill: `linked-data-fetch`

Guides the agent to:
1. Use `ld_fetch` whenever the user asks to "look up", "resolve", "fetch", or
   "get" a URI from the web of data (e.g. a vocabulary term, a FOAF profile, a
   schema.org type, a Wikidata entity page).
2. After fetching, query the payload graph with `rdf_memory_query` scoped to
   `GRAPH <uri>` in store `"fetched-data"`.
3. Query fetch metadata (status, headers, redirect chain) from the
   `GRAPH <chrome://TheCurrentSession>` graph in the same store, using the
   `link:` / `http:` / `httph:` ontology predicates.
4. Chain with `rdf_memory_query` rather than `sparql_query_files` — the data is
   already in memory.
5. Follow `owl:sameAs` and `rdfs:seeAlso` links by calling `ld_fetch` again on
   the linked URIs.
6. Use `rdf_memory_drop(store="fetched-data", graph=<uri>)` to force a
   re-fetch when the user wants fresh data.

### Example Workflow

```
User: "Fetch the FOAF vocabulary and tell me which classes it defines."

Agent:
  1. ld_fetch(uri="http://xmlns.com/foaf/0.1/")
     → Fetched. 631 triples in GRAPH <http://xmlns.com/foaf/0.1/>
       in store "fetched-data".
  2. rdf_memory_query(
       store="fetched-data",
       query="""
         SELECT DISTINCT ?class WHERE {
           GRAPH <http://xmlns.com/foaf/0.1/> {
             ?class a owl:Class .
           }
         } ORDER BY ?class
       """
     )
```

## Why This Fits the Package

`ld_fetch` closes the "ingest from the web" gap that `rdf_write` (local
authoring) and `sparql_query_endpoint` (remote SPARQL query) leave open.
It gives the agent a complete **fetch → memorise → query** cycle for real
Linked Data, with quad-level provenance guaranteed by construction rather
than convention.
