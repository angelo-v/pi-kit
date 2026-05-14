# Idea: `rdf_validate` Tool + `rdf-validate` Skill (SHACL / SHACL-AF)

## Problem

`rdf_write` validates Turtle *syntax* (via the n3 parser) before writing, but
it has no knowledge of *shape constraints*. A graph may be syntactically valid
Turtle yet violate the application's SHACL shapes — wrong cardinality, wrong
datatype, missing required property — and the agent won't know until a
downstream consumer fails.

There is also no tool to validate an *already-written* file; re-validation
currently requires re-running `rdf_write` with the same content.

## Proposed Solution

### New tool: `rdf_validate`

```
rdf_validate(files, shapes?, format?)
```

| Parameter | Description |
|-----------|-------------|
| `files`   | One or more local RDF files to validate (the data graph). |
| `shapes`  | Optional SHACL shapes file(s). When omitted the tool discovers `*.shacl.ttl` files in the workspace. |
| `format`  | `"table"` (default) \| `"turtle"` (full SHACL validation report). |

**Implementation**: use the
[`@zazuko/rdf-validate-shacl`](https://github.com/zazuko/rdf-validate-shacl)
library (pure JS, no external process needed) or run `pyshacl` / `comunica`
with SHACL support as a child process.

**Returns**:
- A conforms/non-conforms flag.
- A table of violations (`focusNode`, `resultPath`, `resultMessage`,
  `severity`) for quick triage.
- The raw SHACL validation report as Turtle on request.

### New skill: `rdf-validate`

Guides the agent to:
1. Run `discover_rdf_files` to locate data and shapes files.
2. Call `rdf_validate` *before* `rdf_write` when the user has shapes on disk.
3. Fix violations reported in the result and retry.
4. Never present a graph as "valid" without having actually run validation.

## Why This Fits the Package

`rdf_write` is the write leg; `rdf_validate` becomes the check leg. Together
they form a natural write–validate–fix loop that the agent can execute
autonomously. The skill can teach the agent to run this loop with no extra
user instruction.

## Complementary Improvements to `rdf_write`

- Accept an optional `shapes` parameter and automatically call `rdf_validate`
  *after* writing, returning validation results alongside the write summary.
- Return the list of prefixes detected in the written file so the agent can
  reuse them in subsequent queries.
