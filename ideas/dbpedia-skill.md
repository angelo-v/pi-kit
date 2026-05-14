# Idea: `dbpedia` Skill — DBpedia-Specific Query Skill

## Problem

`sparql_query_endpoint` is generic and works with DBpedia, but the agent
needs expert guidance to use DBpedia effectively:
- DBpedia's endpoint URL varies by mirror and version.
- DBpedia uses its own prefix conventions (`dbo:`, `dbr:`, `dbp:`, `dbc:`).
- The `dbo:abstract` / `rdfs:comment` distinction is frequently confused.
- DBpedia has known reliability issues (timeouts, rate limiting) that require
  specific mitigation patterns.
- The DBpedia Lookup API is often faster than SPARQL for entity resolution.

## Proposed Skill: `dbpedia`

A new skill that provides DBpedia-specific guidance on top of
`sparql_query_endpoint`.

### DBpedia Prefix Cheat Sheet

```sparql
PREFIX dbo:  <http://dbpedia.org/ontology/>
PREFIX dbr:  <http://dbpedia.org/resource/>
PREFIX dbp:  <http://dbpedia.org/property/>
PREFIX dbc:  <http://dbpedia.org/resource/Category:>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX geo:  <http://www.w3.org/2003/01/geo/wgs84_pos#>
```

### Key Patterns

- Entity lookup by name:
  `dbr:<PascalCase_Wikipedia_title>` (e.g. `dbr:Albert_Einstein`)
- Abstract / description: `dbo:abstract` (lang-tagged, use `FILTER(LANG(?a) = "en")`)
- Type hierarchy: `dbo:` ontology classes (mapped from Wikipedia categories)
- Geo coordinates: `geo:lat`, `geo:long`
- Wikidata link: `owl:sameAs` to `wd:Q<n>`

### Reliability Patterns

- Always use `LIMIT` (DBpedia's public endpoint rate-limits and times out).
- Prefer `dbpedia.org/sparql` over national mirrors for consistency.
- For entity resolution, prefer the
  [DBpedia Lookup API](https://lookup.dbpedia.org/) over a SPARQL label search.
- Retry on `503` with exponential backoff (manual; the agent should note this
  in its output rather than silently failing).

### Workflow

1. Resolve the entity URI (via the Lookup API or known `dbr:` convention).
2. Explore all properties: `SELECT ?p ?o WHERE { dbr:X ?p ?o }`.
3. Drill into the relevant `dbo:` property.
4. Cross-reference to Wikidata via `owl:sameAs` if richer data is needed.

## Why a Dedicated Skill vs. Generic Endpoint Skill?

DBpedia is one of the most-used public knowledge graphs. A dedicated skill
surfaces the prefix set, reliability patterns, and ontology conventions
without the agent needing to rediscover them each session. It mirrors what
the Wikidata skill does for Wikidata.

## Optional Complementary Tool

A `dbpedia_lookup` tool wrapping the REST Lookup API — analogous to the
proposed `wikidata_search` — for fast entity-to-URI resolution without SPARQL.
