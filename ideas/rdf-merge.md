# Idea: `rdf_merge` Tool — Merge Multiple RDF Files into One

## Problem

Users frequently need to combine several RDF files — for example, merging an
upper ontology with a domain ontology, combining Wikidata export shards, or
assembling a dataset from per-entity files. The current workflow requires the
agent to:

1. Read each file with `bash cat`.
2. Mentally concatenate the Turtle.
3. Re-declare prefixes.
4. Call `rdf_write` with the combined text.

This is fragile: it breaks on duplicate prefix declarations, it doesn't
deduplicate triples, and blank-node identity is not preserved across files.

## Proposed Tool: `rdf_merge`

```
rdf_merge(files, outputPath, format?, deduplicateBlankNodes?)
```

| Parameter               | Description |
|-------------------------|-------------|
| `files`                 | Two or more local RDF files to merge. Any supported format. |
| `outputPath`            | Destination file. |
| `format`                | Output format (defaults to `.ttl`). |
| `deduplicateBlankNodes` | When `true` (default), skolemise blank nodes to avoid accidental merging of unrelated blank nodes. |

**Returns**: write summary with the total triple count and a per-file
breakdown (triples contributed by each source).

### Blank Node Handling

Naive concatenation merges blank nodes with the same local label across
files, which is almost always wrong. The tool skolemises blank nodes per file
(replaces `_:b0` with `_:file0_b0`) before merging, unless
`deduplicateBlankNodes` is `false`.

### Prefix Merging

Collect all prefix declarations from all files; detect and resolve conflicts
(two files declare the same prefix alias with different IRIs) by renaming the
conflicting alias and reporting the conflict to the agent.

### Triple Deduplication

The merged graph is a set — exact duplicate quads are written only once.

## New Skill: `rdf-merge`

Guides the agent to:
1. Use `rdf_merge` instead of manual concatenation whenever combining ≥2 RDF
   files.
2. Check the per-file breakdown in the result to confirm each source
   contributed the expected triples.
3. Run `sparql_query_files` on the merged file to validate the result.
4. Be aware that OWL `owl:imports` is a declaration, not a merge — use
   `rdf_merge` for physical inclusion.

## Implementation

Built on the existing `rdf-parse.ts` and `rdf-serialize.ts` modules. No new
dependencies. Blank-node skolemisation is a simple string substitution before
parsing.
