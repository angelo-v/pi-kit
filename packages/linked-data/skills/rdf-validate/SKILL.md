---
name: rdf-validate
description: Use when the user wants to validate RDF data against SHACL shapes — for example to check cardinality constraints, required properties, or datatype rules on a Turtle file. Guides the agent through discovering shapes files, running rdf_validate, interpreting violations, and fixing them.
---

# RDF Validate (SHACL)

Use this skill whenever the user wants to validate RDF data against SHACL shapes.

## When to use `rdf_validate`

- Before presenting any RDF graph as "valid" when SHACL shapes exist in the workspace.
- After writing RDF with `rdf_write`, if shapes are present.
- When the user explicitly asks to validate or check a Turtle file.

## Workflow

1. **Discover files** — if you don't know the file paths, run `discover_rdf_files` first to locate both data files and shapes files (`.shacl.ttl`).

2. **Run validation** — call `rdf_validate` with the data file(s). Shapes files are optional: omit them to auto-discover all `*.shacl.ttl` files in the workspace, or pass them explicitly.

   ```
   rdf_validate(files=["data/persons.ttl"], shapes=["shapes/PersonShape.shacl.ttl"])
   ```

3. **Interpret results**
   - `conforms: true` → the data graph satisfies all shape constraints. Report this clearly.
   - `conforms: false` → violations are listed with **focus node**, **path**, **message**, and **severity**. Fix each violation and re-validate.

4. **Fix and retry** — edit the offending triples (or update the data source), then call `rdf_validate` again. Repeat until the graph conforms.

## Naming convention for shapes files

Name SHACL shapes files with the `.shacl.ttl` double extension so `rdf_validate` can auto-discover them:

```
shapes/PersonShape.shacl.ttl
shapes/BookShape.shacl.ttl
```

Plain `.ttl` files are treated as data by default and are **not** auto-discovered as shapes.

## SHACL feature support

The validator uses **`shacl-engine`** with full SPARQL support enabled:

| Feature | Supported |
|---|---|
| `sh:targetClass` | ✅ |
| `sh:targetNode` | ✅ |
| `sh:targetSubjectsOf` | ✅ |
| `sh:targetObjectsOf` | ✅ |
| `sh:SPARQLTarget` (`sh:target` + `sh:select`) | ✅ |
| `sh:sparql` constraint components | ✅ |
| SHACL Core constraint components | ✅ |

> **Note:** SPARQL queries inside `sh:select` or `sh:sparql` must include their own `PREFIX` declarations — they are not inherited from the surrounding Turtle file.

## Important rules

- Never claim a graph conforms without actually running `rdf_validate`.
- Do not skip validation because the graph "looks correct" — always verify.
- When there are violations, fix them all before proceeding; do not leave known violations unresolved.
