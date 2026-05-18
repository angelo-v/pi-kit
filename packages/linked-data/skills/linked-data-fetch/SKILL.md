---
name: linked-data-fetch
description: >
  Guides the agent to dereference Linked Data URIs using ld_fetch and follow
  owl:sameAs / rdfs:seeAlso links. Use when the user asks to "look up",
  "resolve", "fetch", or "get" a URI from the Web of Data — e.g. a vocabulary
  term, a FOAF profile, a schema.org type, or a Wikidata entity page.
---

# Linked Data Fetch Skill

**Do not** use `bash` + `curl`. `ld_fetch` handles content negotiation,
parsing, and storage automatically — and its response tells you exactly how to
query the result.

## Hash URIs

When the URI contains a fragment (e.g. `http://www.w3.org/2004/02/skos/core#Concept`),
`ld_fetch` fetches the **document URI** (everything before the `#`). The graph
is stored under that document URI — **not** the full hash URI. Always use the
document URI in the `GRAPH` clause.

## Following links

After fetching, look for `owl:sameAs` and `rdfs:seeAlso` and call `ld_fetch`
again on those URIs to expand the graph:

```sparql
SELECT ?related WHERE {
  GRAPH <http://xmlns.com/foaf/0.1/> {
    <http://xmlns.com/foaf/0.1/Person> rdfs:seeAlso ?related .
  }
}
```

## Saving to a file

Use `rdf_write` if the user also wants a local `.ttl` copy of the fetched data.
