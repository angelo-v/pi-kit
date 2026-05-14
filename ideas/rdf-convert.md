# Idea: `rdf_convert` Tool — Format Conversion Between Any RDF Serialisations

## Problem

`rdf_write` accepts Turtle as its *only* input format. It cannot:
- Ingest JSON-LD, N-Triples, N-Quads, RDF/XML, TriG, or other serialisations.
- Convert a file that is already on disk from one format to another.
- Round-trip an externally downloaded graph (e.g. a JSON-LD `@context` from a
  schema.org fetch) into Turtle for local editing.

Users who receive RDF in any format other than Turtle are currently blocked.

## Proposed Tool: `rdf_convert`

```
rdf_convert(source, targetPath, targetFormat?)
```

| Parameter      | Description |
|----------------|-------------|
| `source`       | File path *or* inline text of any supported RDF serialisation. |
| `sourceFormat` | Optional hint (`"turtle"`, `"jsonld"`, `"ntriples"`, `"nquads"`, `"trig"`, `"rdfxml"`). Auto-detected from extension when omitted. |
| `targetPath`   | Destination file path. Extension determines default output format. |
| `targetFormat` | Override output format (same set as `rdf_write`). |

**Returns**: write summary identical to `rdf_write` (triple count, path, format).

**Implementation**: use
[`@rdfjs/parser-jsonld`](https://github.com/rdfjs/parser-jsonld),
[`rdfxml-streaming-parser`](https://github.com/rubensworks/rdfxml-streaming-parser.js),
and n3's built-in parsers; all are pure JS and already work in Node. The
serialise path reuses the existing `rdf-serialize.ts` module.

## Complementary Improvement to `rdf_write`

Accept a `sourceFormat` parameter alongside `turtle` so that `rdf_write` can
also act as a converter when the agent already has the raw text in hand — no
separate tool call needed for the common case.

## New Skill: `rdf-convert`

Guides the agent to:
1. Use `rdf_convert` when the user supplies or references a file in a format
   other than Turtle.
2. Always convert to Turtle first for editing, then convert to the target
   format after any modifications.
3. Use `rdf_convert` after fetching a remote RDF resource (via `bash` +
   `curl`) to normalise it for local querying with `sparql_query_files`.

## Example Workflow

```
User: "I downloaded schema.jsonld — can you load it and tell me which classes
       have a 'description' property?"

Agent:
  1. rdf_convert(source="schema.jsonld", targetPath="schema.ttl")
  2. sparql_query_files(files=["schema.ttl"], query="SELECT ...")
```
