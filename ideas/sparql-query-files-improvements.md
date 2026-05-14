# Idea: Improvements to `sparql_query_files` and Its Skill

A collection of targeted improvements to the existing local-file SPARQL tool
and skill, each independently deliverable.

---

## 1. Named Graph / Dataset Support

**Problem**: `sparql_query_files` loads all files into a single unnamed
default graph. Files that already use named graphs (TriG, N-Quads) lose their
graph boundaries. There is no way to query `GRAPH <uri> { … }` patterns.

**Fix**: add a `namedGraphs` parameter — a mapping from file path to graph
URI. Comunica already supports multiple sources with named-graph assignments.

```
sparql_query_files(
  files: ["data.trig"],
  namedGraphs: { "data.trig": "https://example.org/graph1" },
  query: "SELECT … WHERE { GRAPH <https://example.org/graph1> { … } }"
)
```

---

## 2. Streaming / Paginated Results

**Problem**: the current tool buffers the entire result set in memory and
returns it in one shot. For large graphs this can hit the 10 MiB `MAX_BUFFER`
cap or overwhelm the LLM's context window.

**Fix**:
- Add an `offset` / `limit` parameter pair for manual pagination when the
  user wants to browse a large result set page by page.
- Alternatively, use `onUpdate` streaming to push result rows incrementally
  as Comunica emits them.

---

## 3. Query Explanation / Plan

**Problem**: when a SPARQL query returns no results it is hard to tell whether
the graph is empty, the query is wrong, or the file paths are off.

**Fix**: add a `explain` mode (boolean flag) that runs a lightweight
introspection query before the real one:
1. Triple count in the loaded graph.
2. Classes present.
3. Whether any variable binding in the WHERE clause matches at all (via
   `ASK`).

Return this diagnostic block before the empty result so the agent can
self-correct.

---

## 4. Workspace-relative Path Autocomplete in Skill

**Problem**: the skill currently says "run `discover_rdf_files` if the user
hasn't specified files." But there is no guidance on how to present
discovered paths back to the user or confirm before querying.

**Fix**: update the skill to instruct the agent to:
1. Run `discover_rdf_files` and show the list to the user.
2. Ask for confirmation if more than 5 files are found (to avoid accidentally
   querying an enormous dataset).
3. Always use workspace-relative paths in tool calls for readability.

---

## 5. Reusable `.rq` File Management

**Problem**: `discover_sparql_queries` finds existing `.rq` files, but there
is no tool to *write* a new `.rq` file, no convention for naming them, and no
skill guidance on organising a query library.

**Fix**:
- Add a `sparql_save_query` tool that writes a SPARQL string to a `.rq` file
  (with a syntax-check pass).
- Extend the `sparql-query-files` skill with a "query library" section:
  naming convention (`<topic>-<verb>.rq`), suggested directory
  (`.sparql/queries/`), and when to save vs. write inline.

---

## 6. `LIMIT` Safety Cap — Expose and Override

**Problem**: `ensureLimit` silently caps results at 500. Users who know they
want all results (e.g. exporting a small controlled vocabulary) have no way to
override this without knowing the implementation detail.

**Fix**:
- Add an optional `limit` parameter to `sparql_query_files` (and the other
  SPARQL tools). When set to `0` or `"none"`, skip the auto-cap entirely.
- Update the skill to acknowledge the default limit and show how to override.
