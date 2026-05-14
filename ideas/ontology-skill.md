# Idea: `ontology-design` Skill — Guided OWL / SKOS Ontology Design

## Problem

There is an `rdf-write` skill that tells the agent *how* to write valid Turtle,
but no skill that tells it *what* to write when building an ontology or
controlled vocabulary from scratch. The agent falls back on generic LLM
knowledge, which is inconsistent and sometimes incorrect (wrong OWL axioms,
mixing OWL Full with OWL DL, using `rdfs:subClassOf` when `owl:equivalentClass`
is needed, etc.).

## Proposed Skill: `ontology-design`

A new skill document that guides the agent through common ontology-design
scenarios. No new tool is needed — the skill sits on top of `rdf_write` and
`sparql_query_files`.

### Coverage

#### OWL Basics
- When to use `owl:Class` vs `rdfs:Class`.
- Property types: `owl:ObjectProperty`, `owl:DatatypeProperty`,
  `owl:AnnotationProperty`.
- Key axioms: `owl:subClassOf`, `owl:equivalentClass`, `owl:disjointWith`,
  `owl:inverseOf`, `owl:FunctionalProperty`, `owl:TransitiveProperty`.
- Named individuals: `owl:NamedIndividual`.
- OWL DL restrictions: `owl:Restriction`, `owl:onProperty`, `owl:someValuesFrom`,
  `owl:allValuesFrom`, `owl:hasValue`, `owl:cardinality`.

#### SKOS Controlled Vocabularies
- `skos:ConceptScheme`, `skos:Concept`, `skos:Collection`.
- Hierarchical relations: `skos:broader`, `skos:narrower`, `skos:broaderTransitive`.
- Associative: `skos:related`.
- Labelling: `skos:prefLabel`, `skos:altLabel`, `skos:hiddenLabel`.
- Documentation: `skos:definition`, `skos:scopeNote`, `skos:example`.
- Linking: `skos:exactMatch`, `skos:closeMatch`, `skos:broadMatch`.

#### Best Practices
- Always attach `rdfs:label` and `rdfs:comment` to every class and property.
- Choose a stable, dereferenceable base URI.
- Version with `owl:versionInfo` and `owl:priorVersion`.
- Use `dct:creator`, `dct:created`, `dct:license` in the ontology header.
- Never mix `owl:DatatypeProperty` and `owl:ObjectProperty` on the same URI.

#### Common Mistakes to Avoid
- Forgetting `owl:Ontology` declaration.
- Using string literals where URIs are expected.
- Creating cycles in `skos:broader` / `skos:narrower`.
- Declaring `owl:inverseOf` in one direction only.

### Workflow

1. Clarify the domain with the user (a few questions about entities and
   relations).
2. Draft the ontology header (`owl:Ontology`, metadata).
3. Declare classes and properties top-down.
4. Add individuals / concepts.
5. Write with `rdf_write`.
6. Validate structure with `sparql_query_files` (check for orphaned classes,
   missing labels, etc.).

## Why This Fits the Package

Ontology design is one of the primary use cases for RDF tooling. A skill here
elevates the agent from "can write valid Turtle" to "designs coherent
ontologies" — a substantial quality improvement at zero implementation cost.
