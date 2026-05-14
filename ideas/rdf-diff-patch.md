# Idea: `rdf_diff` and `rdf_patch` Tools

## Problem

The agent currently operates on RDF files as opaque blobs: every update is a
full rewrite via `rdf_write`. There is no way to:

- See *what changed* between two versions of a graph.
- Apply a targeted *add/remove* set of triples to an existing file without
  rewriting the whole thing.
- Reason about changes in a pull-request or review context ("what triples did
  this commit add or remove?").

## Proposed Tools

### `rdf_diff`

```
rdf_diff(fileA, fileB, format?)
```

Computes the symmetric difference between two RDF files and returns:
- Triples present in B but not A (added, `+`).
- Triples present in A but not B (removed, `-`).

Output formats: `"table"` (default, human readable), `"turtle"` (two named
graphs: `ex:added` and `ex:removed`).

**Implementation**: parse both files with n3, collect quad sets, compute set
difference, render. No external binary needed.

### `rdf_patch`

```
rdf_patch(file, add?, remove?, format?)
```

Applies an incremental patch to an existing RDF file:
- `add`: Turtle text whose triples are unioned into the file.
- `remove`: Turtle text whose triples are subtracted from the file.

The tool validates the Turtle input before touching the file (same guard as
`rdf_write`). It rewrites the file atomically (write temp → rename).

**RDF Patch standard alignment**: Could align with the
[RDF Patch / RDF-star Patch](https://afs.github.io/rdf-patch/) format so
patches are interoperable with other tools (Jena, Fuseki patch log).

## New Skill: `rdf-diff-patch`

Guides the agent to:
1. Use `rdf_diff` for understanding what changed between two graph versions,
   e.g. "compare `v1.ttl` with `v2.ttl`".
2. Use `rdf_patch` for targeted edits instead of full rewrites — especially
   when the existing file is large or contains blank nodes that would change
   identity on re-serialisation.
3. Prefer patch over rewrite when only a small subset of triples changes.

## Why This Fits the Package

The package already has parse + serialize primitives in `rdf-parse.ts` and
`rdf-serialize.ts`. A diff/patch layer sits naturally on top of those, requires
no new runtime dependencies, and closes a real gap in the agent's RDF editing
workflow.
