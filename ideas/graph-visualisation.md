# Idea: `rdf_visualise` Tool — RDF Graph Visualisation

## Problem

RDF graphs are inherently visual — classes, properties, and individuals form a
network that is much easier to reason about as a diagram than as a text table.
The agent currently has no way to produce a diagram, so the user must copy the
Turtle into an external tool (Protégé, WebVOWL, RDF Grapher) to see the
structure.

## Proposed Tool: `rdf_visualise`

```
rdf_visualise(files, outputPath, format?, focus?, depth?)
```

| Parameter    | Description |
|--------------|-------------|
| `files`      | RDF files to visualise. |
| `outputPath` | Destination file (`.svg`, `.png`, `.dot`, `.md`). |
| `format`     | `"dot"` (Graphviz), `"mermaid"`, `"svg"`. Inferred from extension. |
| `focus`      | Optional URI — start the graph from this node only. |
| `depth`      | Max hop depth from `focus`. Default 2. |

### Output Formats

**Graphviz `.dot`**: use `graphviz` npm package (pure JS wrapper around the
system `dot` binary) or output raw DOT text for the user to render manually.

**Mermaid** (`.md` containing a `\`\`\`mermaid` block): no binary needed,
renders natively in GitHub, GitLab, Obsidian, and pi's Markdown preview.
This is the most zero-dependency option.

**SVG**: render Graphviz DOT to SVG inline (system `dot` binary or
`@hpcc-js/wasm-graphviz`).

### What to Render

- `rdfs:subClassOf` / `owl:subClassOf` → hierarchy edges.
- `rdf:type` → dashed edges (instance-of).
- `owl:ObjectProperty` domain/range → labelled edges between class nodes.
- `skos:broader` / `skos:narrower` → hierarchy in SKOS mode.
- Literals shown as rectangle leaf nodes (optional, controllable).

### Implementation Sketch

1. Parse files with n3 (already available).
2. Run a SPARQL-like traversal in memory to collect nodes and edges.
3. Render to DOT / Mermaid string.
4. Write with the existing `fs.writeFile` pattern.

## New Skill: `rdf-visualise`

Guides the agent to:
1. Offer visualisation after writing or loading an ontology/vocabulary.
2. Default to Mermaid format unless the user requests otherwise (most portable).
3. Use `focus` + `depth` to keep large graphs readable.
4. Annotate nodes with `rdfs:label` if available, falling back to the local
   name of the URI.

## Example Workflow

```
User: "Show me the class hierarchy of my ontology."

Agent:
  1. discover_rdf_files() → ["ontology.ttl"]
  2. rdf_visualise(files=["ontology.ttl"], outputPath="ontology.md",
                   format="mermaid")
  3. Displays the Mermaid diagram inline in the response.
```
