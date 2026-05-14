# Idea: `sparql_log_analysis` Tool + `query-history` Skill

## Problem

The package already writes detailed query logs to `.agents/logs/<tool>/<ts>.log`.
But this data is never *read back*. The agent cannot:
- Recall what queries it already ran.
- Avoid re-running expensive or failed queries.
- Learn from past errors (e.g. "I tried this pattern last time and it
  returned 0 rows — the property must have a different name").
- Present a summary of what was queried during a session.

The logs are write-only and their value goes unrealised.

## Proposed Tool: `sparql_log_read`

```
sparql_log_read(tool?, limit?, status?)
```

| Parameter | Description |
|-----------|-------------|
| `tool`    | Filter by tool name (`"sparql_query_files"`, `"sparql_query_endpoint"`, `"sparql_query_wikidata"`). Omit for all. |
| `limit`   | Max number of log entries to return (most recent first). Default 10. |
| `status`  | `"ok"` \| `"error"` \| `"all"` (default). |

**Returns**: a table of recent queries with columns: timestamp, tool, status,
source(s), first 100 chars of query, first 100 chars of result.

**Implementation**: reads files from `.agents/logs/` using `fs.readdir` +
`fs.readFile`, parses the structured log format already in `query-logger.ts`,
and renders a table. No new dependencies.

## Complementary Improvement to `query-logger.ts`

Structure the log file as NDJSON (one JSON object per line) instead of a
free-form text block. This makes `sparql_log_read` trivial to implement
(JSON.parse each line) and makes the logs machine-readable for external tools
too.

Backwards-compatible: the tool can detect format by trying JSON.parse and
falling back to regex-based text parsing for old logs.

## New Skill: `query-history`

Guides the agent to:
1. Call `sparql_log_read` at the start of a complex multi-step query session
   to avoid repeating work.
2. After a failed query, call `sparql_log_read(status="error", limit=5)` to
   review what went wrong previously.
3. Treat logged results as a cache: if a recent successful query covers the
   same question, extract the answer from the log instead of re-querying.

## Additional: `sparql_log_clear`

```
sparql_log_clear(tool?, before?)
```

Deletes log files older than `before` (ISO date) or all logs for a given tool.
Useful for privacy / disk hygiene.
