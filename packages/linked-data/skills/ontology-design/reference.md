# Ontology Design Reference

## Ontology Header

Always start here. Every ontology needs an `owl:Ontology` declaration.

```turtle
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:  <http://purl.org/dc/terms/> .

<https://example.org/my-ontology>
    a owl:Ontology ;
    rdfs:label "My Ontology"@en ;
    rdfs:comment "A short description of what this ontology models."@en ;
    owl:versionInfo "0.1.0" ;
    dct:creator <https://example.org/me> ;
    dct:created "2026-05-14"^^xsd:date ;
    dct:license <https://creativecommons.org/licenses/by/4.0/> .
```

Keep the ontology URI distinct from term URIs: `<https://example.org/onto>` for the ontology, `<https://example.org/onto/Person>` for the class.

---

## Classes

```turtle
ex:Person
    a owl:Class ;
    rdfs:label "Person"@en ;
    skos:definition "A human being."@en .

ex:Employee
    a owl:Class ;
    rdfs:subClassOf ex:Person ;
    rdfs:label "Employee"@en ;
    skos:definition "A person employed by an organisation."@en .
```

Using `skos:definition` on an OWL class is normal and encouraged — it is more precise than `rdfs:comment`.

### Class axioms

| Axiom | Meaning |
|---|---|
| `rdfs:subClassOf` | Every instance of this class is also an instance of the target |
| `owl:equivalentClass` | The two classes have exactly the same instances |
| `owl:disjointWith` | No individual can be an instance of both classes |
| `owl:unionOf` | Class is the union of a list of classes |
| `owl:intersectionOf` | Class is the intersection of a list of classes |

---

## Properties

Never declare the same URI as both `owl:ObjectProperty` and `owl:DatatypeProperty`.

| Type | Value |
|---|---|
| `owl:ObjectProperty` | Another resource (URI) |
| `owl:DatatypeProperty` | A literal (string, number, date…) |
| `owl:AnnotationProperty` | Documentation only; not used in reasoning |

```turtle
ex:worksFor
    a owl:ObjectProperty ;
    rdfs:label "works for"@en ;
    rdfs:domain ex:Employee ;
    rdfs:range  ex:Organisation ;
    owl:inverseOf ex:employs .

ex:birthDate
    a owl:DatatypeProperty ;
    rdfs:label "birth date"@en ;
    rdfs:domain ex:Person ;
    rdfs:range  xsd:date .
```

Always declare `owl:inverseOf` on both properties:

```turtle
ex:employs  owl:inverseOf ex:worksFor .
ex:worksFor owl:inverseOf ex:employs .
```

### Property characteristics

| Characteristic | Meaning |
|---|---|
| `owl:FunctionalProperty` | At most one value per individual |
| `owl:SymmetricProperty` | If A→B then B→A |
| `owl:TransitiveProperty` | If A→B and B→C then A→C |
| `owl:AsymmetricProperty` | If A→B then not B→A |

---

## Individuals

```turtle
ex:Alice
    a owl:NamedIndividual, ex:Employee ;
    rdfs:label "Alice"@en ;
    ex:worksFor ex:AcmeCorp ;
    ex:birthDate "1985-04-12"^^xsd:date .
```

---

## Concept Schemes (SKOS)

Use SKOS when your primary need is a navigable hierarchy of terms — a taxonomy, thesaurus, or controlled vocabulary. SKOS and OWL are not alternatives; SKOS annotation properties (`skos:prefLabel`, `skos:definition`, `skos:exactMatch`) work well on OWL classes and properties too.

```turtle
ex:ColourScheme
    a skos:ConceptScheme ;
    rdfs:label "Colour Vocabulary"@en .

ex:Colour
    a skos:Concept ;
    skos:inScheme ex:ColourScheme ;
    skos:topConceptOf ex:ColourScheme ;
    skos:prefLabel "Colour"@en .

ex:Red
    a skos:Concept ;
    skos:inScheme ex:ColourScheme ;
    skos:prefLabel "Red"@en ;
    skos:altLabel "Crimson"@en ;
    skos:definition "A colour at the long-wavelength end of the visible spectrum."@en ;
    skos:broader ex:Colour .
```

### SKOS labels

| Property | Rule |
|---|---|
| `skos:prefLabel` | Exactly one per language per concept |
| `skos:altLabel` | Synonyms, acronyms, variant spellings |
| `skos:hiddenLabel` | Misspellings for search; never displayed |

### SKOS hierarchy

- Assert `skos:broader` on the narrower concept. Do not assert `skos:narrower` redundantly.
- No cycles in `skos:broader`.
- Every `skos:Concept` must have `skos:inScheme`.

### Cross-vocabulary mappings

| Property | Strength |
|---|---|
| `skos:exactMatch` | Same meaning in another vocabulary |
| `skos:closeMatch` | Very similar but not identical |
| `skos:broadMatch` / `skos:narrowMatch` | Hierarchical link to external concept |
| `skos:relatedMatch` | Associative link to external concept |

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Forgetting `a owl:Ontology` | Always declare the ontology resource |
| String where a URI is expected | `ex:worksFor ex:AcmeCorp` not `ex:worksFor "Acme"` |
| Mixing `owl:ObjectProperty` and `owl:DatatypeProperty` on the same URI | Use two separate URIs |
| `owl:inverseOf` in only one direction | Assert it on both properties |
| Multiple `skos:prefLabel` in the same language | Exactly one per language; extras go in `skos:altLabel` |
| Cycles in `skos:broader` | Run the cycle audit query |
| Missing `skos:inScheme` on a concept | Every `skos:Concept` must reference its scheme |
