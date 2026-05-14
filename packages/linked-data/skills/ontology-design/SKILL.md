---
name: ontology-design
description: Use when the user wants to design, create, or extend an OWL ontology or SKOS controlled vocabulary — for example modelling domain entities and relationships, building a class hierarchy, defining properties with constraints, or creating a concept scheme. Guides the agent through clarification, structure, best practices, and common mistakes.
---

# Ontology Design Skill

Use this skill together with `rdf_write` (to author Turtle) and `sparql_query_files` (to validate structure after writing).

## Workflow

1. **Clarify the domain** — before writing anything, ask: what are the main entities? what relationships exist? OWL or SKOS? what base URI?
2. **Draft the ontology header** — every ontology must start with an `owl:Ontology` declaration and metadata.
3. **Declare classes and properties top-down** — superclasses before subclasses, domains before ranges.
4. **Add individuals / concepts** — after the schema is stable.
5. **Write with `rdf_write`**.

## OWL and SKOS

These are not alternatives — use them together. OWL gives you classes, properties, and reasoning. SKOS gives you navigable term hierarchies and rich labelling. Using `skos:prefLabel` and `skos:definition` on OWL classes is normal and encouraged.

Let the user's primary need guide the structure: if they need a formal domain model with typed individuals and constraints, lead with OWL. If they need a taxonomy or thesaurus, lead with SKOS. Most real ontologies do both.

## Key Rules

- Every class and property must have `rdfs:label` and `rdfs:comment`.
- Never mix `owl:ObjectProperty` and `owl:DatatypeProperty` on the same URI.
- Always declare `owl:inverseOf` on both directions.
- SKOS `skos:broader` / `skos:narrower` must not form cycles.
- Every `skos:Concept` must have `skos:inScheme`.
- Prefer reusing existing vocabularies (`foaf:`, `schema:`, `dct:`, `prov:`) over inventing new terms.

## Reference docs

For Turtle templates, axiom tables, SKOS patterns, and audit queries, read:
`skills/ontology-design/reference.md`
