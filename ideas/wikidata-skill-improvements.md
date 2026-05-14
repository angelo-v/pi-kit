# Idea: Improvements to `sparql_query_wikidata` and Its Skill

A set of targeted improvements to the Wikidata tool and skill.

---

## 1. Entity / Property Search Tool: `wikidata_search`

**Problem**: the skill advises "search by label first, then use those IDs" but
there is no dedicated tool for this. The agent must write a SPARQL query just
to look up a Q-number — error-prone and wasteful.

**Proposed tool: `wikidata_search`**

```
wikidata_search(term, type?, lang?)
```

| Parameter | Description |
|-----------|-------------|
| `term`    | Free-text search term. |
| `type`    | `"item"` (default) \| `"property"`. |
| `lang`    | Language code. Default `"en"`. |

Uses the [Wikidata Entity Search API](https://www.wikidata.org/w/api.php?action=wbsearchentities)
(REST, not SPARQL) for fast entity lookup by label/alias. Returns a table of
`id`, `label`, `description`, `url`. The agent picks the right Q/P number
from the result and uses it in subsequent SPARQL queries.

**Skill update**: add a "Step 0: search before querying" section with an
example of chaining `wikidata_search` → `sparql_query_wikidata`.

---

## 2. Multilingual Query Support

**Problem**: the skill only shows English label patterns. Users who work in
other languages must know the SPARQL patterns themselves.

**Fix**: add a `language` parameter to `sparql_query_wikidata` that adjusts
the `wikibase:language` hint in the label service and the `FILTER(LANG(?label)
= ...)` pattern. Default remains `"en"`.

Update skill patterns to use `?language` as a variable so the agent can
parameterise them from context.

---

## 3. Qualifier-Aware Fetch Helper Pattern in Skill

**Problem**: the full statement model (`p:`, `ps:`, `pq:`) is documented in
the skill but patterns for common qualifier scenarios are minimal.

**Fix**: add ready-to-use patterns for the most frequent qualifier uses:

- Time-bounded facts: `pq:P580` (start time) / `pq:P582` (end time).
- Sourced claims: `pq:P248` (stated in) + `pq:P813` (retrieved).
- Ranked statements: filter on `wikibase:rank wikibase:PreferredRank`.
- Deprecated claims: `wikibase:rank wikibase:DeprecatedRank`.

These are the most common sources of confusion when the simple `wdt:` shortcut
gives multiple or incorrect values.

---

## 4. Automatic Retry on Timeout

**Problem**: Wikidata's 60-second timeout causes hard failures. The agent
currently returns the raw error and stops.

**Fix**: when a query fails with a timeout error:
1. Detect the timeout in `run-query.ts` error output.
2. Automatically inject a tighter `LIMIT` (e.g., 50) and retry once.
3. Return the partial result with a warning: *"Query timed out — result
   limited to 50 rows. Refine the query for complete results."*

---

## 5. Federated Query Support in Skill

**Problem**: Wikidata supports `SERVICE` federation to other endpoints, but
the skill has no guidance on this powerful feature.

**Fix**: add a section with patterns for common federation scenarios:
- Fetching labels from `https://www.wikidata.org/sparql` inside a DBpedia
  query.
- Cross-querying GeoSPARQL endpoints from Wikidata.
- Federated `SERVICE wikibase:mwapi` for MediaWiki API access from SPARQL.

---

## 6. Export / Save Wikidata Results to RDF

**Problem**: Wikidata query results are returned as text tables. There is no
workflow for turning a Wikidata `CONSTRUCT` result into a local `.ttl` file.

**Fix**: update skill to show the end-to-end pattern:
1. `sparql_query_wikidata(format="turtle", query="CONSTRUCT { … } WHERE { … }")`.
2. `rdf_write(turtle=<result>, path="wikidata-export.ttl")`.

This is purely a skill addition — no code change needed.
