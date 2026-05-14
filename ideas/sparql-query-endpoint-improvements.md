# Idea: Improvements to `sparql_query_endpoint` and Its Skill

A collection of targeted improvements to the existing remote-endpoint SPARQL
tool and skill.

---

## 1. Endpoint Introspection / Service Description

**Problem**: there is no way to discover what graphs, named graphs, or
supported SPARQL features an endpoint exposes without writing a query.

**Fix**: add an `rdf_service_description` tool (or a parameter on
`sparql_query_endpoint`) that fetches the endpoint's
[SPARQL 1.1 Service Description](https://www.w3.org/TR/sparql11-service-description/)
by sending a `GET` with `Accept: text/turtle` to the endpoint URL. Returns:
- Supported SPARQL features.
- Available named graphs (`sd:namedGraph`).
- Default dataset.

Update skill to suggest running this *once* before a complex query session.

---

## 2. Authentication Support

**Problem**: many real-world triple-stores (corporate GraphDB, Stardog,
AWS Neptune, Oxigraph) require `Bearer` token or `Basic` auth. The current
tool has no auth mechanism.

**Fix**: add optional `auth` parameter:
```
auth: { type: "bearer", token: "..." }
     | { type: "basic", username: "...", password: "..." }
```
Tokens/passwords should be resolved from environment variables (the agent
passes `$ENV_VAR_NAME`; the tool reads `process.env`). Never log
credentials in query logs.

---

## 3. Endpoint Health Check

**Problem**: when a query fails it is not clear whether the endpoint is down,
the URL is wrong, or the SPARQL is invalid.

**Fix**: before running the query, send a lightweight `ASK { ?s ?p ?o }
LIMIT 1` to confirm the endpoint is reachable and responding to SPARQL.
Return a clear "endpoint unreachable" message distinct from "query error".

---

## 4. Multiple Endpoint Federation Helper in Skill

**Problem**: the skill has no guidance on `SERVICE` federation between two
custom endpoints.

**Fix**: add a pattern section in the skill for cross-endpoint federation:
```sparql
SELECT ?item ?wdLabel WHERE {
  ?item a dbo:Person .
  SERVICE <https://query.wikidata.org/sparql> {
    ?wd owl:sameAs ?item .
    ?wd rdfs:label ?wdLabel .
    FILTER(LANG(?wdLabel) = "en")
  }
}
```
Warn that not all endpoints support `SERVICE` and that Wikidata's endpoint
blocks federation from untrusted sources.

---

## 5. Result Size Warning

**Problem**: the auto-`LIMIT 500` is applied silently. When results are
capped, the agent doesn't know and may present incomplete data as complete.

**Fix**: after executing the query, check whether the result row count equals
the applied limit. If so, append a warning:
> ⚠️ Result capped at 500 rows. The dataset may contain more matches —
> add a more specific WHERE clause or increase the limit explicitly.

---

## 6. CSV Export to File

**Problem**: when format is `"csv"` the CSV is returned as a text block in
the tool result. For large results, users want to save it as a file.

**Fix**: add an optional `outputPath` parameter. When provided, the tool
writes the result to that path (using the existing file-write primitives) and
returns a summary instead of the full text.
