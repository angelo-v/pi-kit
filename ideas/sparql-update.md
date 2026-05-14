# Idea: `sparql_update` Tool + `sparql-update` Skill (SPARQL 1.1 Update)

## Problem

All three current SPARQL tools are read-only (`SELECT`, `ASK`, `CONSTRUCT`,
`DESCRIBE`). There is no way to execute SPARQL 1.1 *Update* operations
(`INSERT DATA`, `DELETE DATA`, `INSERT/DELETE … WHERE`, `LOAD`, `CLEAR`,
`DROP`, `COPY`, `MOVE`, `ADD`) against a remote triple-store or a local
in-memory graph.

This is a significant gap for users who have a Fuseki, GraphDB, Virtuoso, or
any other SPARQL-capable store and want the agent to modify the graph — e.g.,
to batch-load transformed data, correct mistakes, or run a migration.

## Proposed Tool: `sparql_update`

```
sparql_update(endpoint, update, dryRun?)
```

| Parameter  | Description |
|------------|-------------|
| `endpoint` | SPARQL Update endpoint URL (often `<store>/update`). |
| `update`   | SPARQL 1.1 Update string (one or more operations separated by `;`). |
| `dryRun`   | If `true`, validate and log the update without sending it. Default `false`. |

**Returns**: HTTP status, affected-triple count where the store reports it,
and the raw response body.

**Implementation**: HTTP POST with `Content-Type: application/sparql-update`
using Node's built-in `fetch` (no extra dep). The existing
`validate-endpoint.ts` guard applies.

### Safety rails

- Prompt guidelines explicitly warn: `DELETE WHERE {}` without a `GRAPH` clause
  wipes the default graph. The agent should always preview with a matching
  `SELECT` first.
- `dryRun` mode parses and logs but does not send.
- The skill requires the agent to confirm destructive operations with the user.

## New Skill: `sparql-update`

Guides the agent to:
1. Distinguish *query* endpoints from *update* endpoints (different URL paths).
2. Always run a matching `SELECT` before any `DELETE … WHERE` to confirm scope.
3. Use `INSERT DATA` for small, deterministic additions; use `INSERT … WHERE`
   for pattern-driven inserts.
4. Check for `dryRun` when the operation is irreversible.
5. Never generate unbounded `DELETE WHERE` without explicit user confirmation.

## Example Workflow

```
User: "Add Angelo Veltens as the creator of every resource in the local store
       that is missing a dc:creator."

Agent:
  1. sparql_query_endpoint(endpoint=..., query="SELECT ?s WHERE { ?s a ?t
     FILTER NOT EXISTS { ?s dc:creator ?c } }")  -- preview scope
  2. (confirms count with user)
  3. sparql_update(endpoint=.../update, update="INSERT { ?s dc:creator <...> }
     WHERE { ?s a ?t FILTER NOT EXISTS { ?s dc:creator ?c } }")
```
