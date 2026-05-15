# 0002 — Use shacl-engine instead of rdf-validate-shacl for SHACL validation

Date: 2026-05-15
Status: accepted

---

## Context and Problem Statement

The `rdf_validate` tool used `rdf-validate-shacl` as its SHACL engine. This library only implements SHACL Core and does not support the SHACL-SPARQL extension. Specifically, `sh:SPARQLTarget` (selecting focus nodes via a SPARQL SELECT query) and `sh:sparql` constraint components were silently ignored, making it impossible to validate shapes that rely on these features.

---

## Decision Drivers

- Support for `sh:SPARQLTarget` (SHACL-SPARQL extension)
- Support for `sh:sparql` constraint components
- Compatibility with the existing RDF/JS ecosystem already used in the project
- No regression on existing SHACL Core validation

---

## Considered Options

### Option 1 — Keep rdf-validate-shacl (SHACL Core only)
Continue using the existing engine; SHACL-SPARQL features remain silently ignored.

### Option 2 — Switch to shacl-engine with SPARQL plugin
Replace `rdf-validate-shacl` with `shacl-engine`, adding the optional `shacl-engine/sparql.js` plugin for SHACL-SPARQL support.

### Option 3 — Use pyshacl via subprocess
Invoke the Python-based `pyshacl` library through a child process; provides full SHACL-SPARQL support but introduces a Python runtime dependency.

### Option 4 — Use Apache Jena SHACL via subprocess
Invoke the Java-based Jena SHACL processor through a child process; provides full SHACL-SPARQL support but introduces a Java runtime dependency.

---

## Decision Outcome

**Chosen option: Option 2 — Switch to shacl-engine with SPARQL plugin**

because `shacl-engine` is a pure JavaScript/RDF/JS library that supports all of SHACL Core plus SHACL-SPARQL (both `sh:SPARQLTarget` and `sh:sparql` constraints) via an optional plugin (`shacl-engine/sparql.js`). It uses `@comunica/query-sparql-rdfjs-lite` as its SPARQL engine internally — the same Comunica ecosystem already used in the project. No subprocess or language boundary is needed. It is also significantly faster than alternatives (15–26× faster than comparable JS or Python implementations according to published benchmarks).

### Good consequences

- `sh:SPARQLTarget` and `sh:sparql` constraints are now fully evaluated during validation
- Stays within the existing Node.js/RDF/JS toolchain, no new language runtime required
- All 20 existing SHACL validation tests continue to pass without modification
- Better performance than the previous engine

### Bad consequences

- `shacl-engine` and its Comunica dependency (`@comunica/query-sparql-rdfjs-lite`) had to be installed in addition to the existing dependencies
- SPARQL queries inside `sh:select` or `sh:sparql` blocks must include their own PREFIX declarations — they are not inherited from the surrounding Turtle file
- SHACL Advanced Features (sh:js, shacl-af) remain unsupported

---

## Rejected Options

**Option 1** was rejected because silently ignoring `sh:SPARQLTarget` and `sh:sparql` constraints gives a false sense of correctness — shapes using these features would always appear to conform regardless of the data.

**Options 3 and 4** were rejected because they introduce a subprocess boundary and an external language runtime (Python or Java) that is not otherwise required in the project. This increases deployment complexity and latency compared to a pure in-process JavaScript solution.
