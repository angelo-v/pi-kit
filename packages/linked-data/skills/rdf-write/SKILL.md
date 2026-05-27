---
name: rdf-write
description: Writes RDF data to files in the workspace. Use when the user asks to create, generate, or save RDF graphs, ontologies, vocabularies, or knowledge graphs as .ttl, .jsonld, .nt, or .nq files.
---

# RDF Write

Use the `rdf_write` tool to write RDF data. Never use the `write` tool directly for RDF files.

## Workflow

1. Compose valid Turtle in your response
2. Call `rdf_write` with the Turtle text and target path
3. The tool validates, normalises, and writes the file — or returns a parse error with line info for you to fix
4. After writing, discover which shapes apply to the data:
   - For each type IRI, call `discover_shapes_for_class` to find the shapes that target it. The tool auto-discovers `*.shacl.ttl` files in the workspace when no shapes files are specified.
   - Pass only the matching shapes files to `rdf_validate` (or omit `shapes` to auto-discover if no targeted match is found)
5. If violations are found, fix the data and re-write the file, then repeat from step 4 until the file fully conforms

## Turtle Guidelines

### Always declare prefixes
```turtle
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix ex:   <http://example.org/> .
```

### Use `;` to group triples about the same subject
```turtle
ex:Alice a foaf:Person ;
    foaf:name "Alice" ;
    foaf:mbox <mailto:alice@example.org> .
```

### Use `,` to group objects for the same subject+predicate
```turtle
ex:Bob ex:knows ex:Alice, ex:Carol .
```

### Typed and language-tagged literals
```turtle
ex:item ex:count 42 ;               # xsd:integer inferred
        ex:price "9.99"^^xsd:decimal ;
        rdfs:label "Hello"@en, "Hallo"@de .
```

### Don't forget the final `.`
Every triple block must end with `.` — the most common parse error.

## Output Formats

| File extension | Default format |
|---|---|
| `.ttl` | Turtle (normalised) |
| `.jsonld` | JSON-LD (compacted) |
| `.nt` | N-Triples |
| `.nq` | N-Quads |

Override with the `format` parameter when extension and desired format differ.

## Common Ontology Prefixes

```turtle
@prefix foaf:    <http://xmlns.com/foaf/0.1/> .
@prefix dc:      <http://purl.org/dc/elements/1.1/> .
@prefix dct:     <http://purl.org/dc/terms/> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix schema:  <https://schema.org/> .
@prefix sh:      <http://www.w3.org/ns/shacl#> .
@prefix void:    <http://rdfs.org/ns/void#> .
```

## Patching vs. Rewriting

When you only need to add, remove, or replace a few triples in an **existing** `.ttl` file, prefer `rdf_patch` over `rdf_write`:

| Situation | Tool |
|---|---|
| Creating a new RDF file | `rdf_write` |
| Overwriting a file completely | `rdf_write` |
| Adding a few triples to an existing file | `rdf_patch` |
| Removing specific triples from an existing file | `rdf_patch` |
| Replacing a property value | `rdf_patch` |

`rdf_patch` accepts a SPARQL Update statement and rewrites only the changed triples.
