# Domain Reference: Chemical Compound / Drug

## P31 identifiers for this domain

| Q-number | Label |
|----------|-------|
| Q11173 | chemical compound |
| Q79529 | chemical substance |
| Q12140 | medication |
| Q8386 | drug |
| Q188580 | chemical element |
| Q36496 | ion |
| Q11344 | chemical element |
| Q2393187 | molecular entity |

## Recommended property set (use in Step 1c VALUES clause)

```sparql
VALUES ?prop {
  wdt:P31     # instance of
  wdt:P274    # chemical formula
  wdt:P231    # CAS Registry Number
  wdt:P592    # ChEMBL ID
  wdt:P661    # ChemSpider ID
  wdt:P662    # PubChem CID
  wdt:P683    # ChEBI ID
  wdt:P2067   # molar mass
  wdt:P2101   # melting point
  wdt:P2102   # boiling point
  wdt:P2275   # WHO International Nonproprietary Name
  wdt:P636    # route of administration
  wdt:P2175   # medical condition treated
  wdt:P3780   # active ingredient in
  wdt:P18     # image (structure)
  wdt:P117    # chemical structure (image)
}
```

## Domain-specific tips

### Chemical formula (P274)
Returned as a plain string literal (not a typed literal). Display directly;
no language filter needed.

### Identifiers (CAS, PubChem, ChEMBL, etc.)
These are plain string literals. Useful for cross-referencing external
databases. Example — fetching several identifiers at once:

```sparql
SELECT ?casLabel ?pubchemLabel ?chebiLabel WHERE {
  VALUES ?prop { wdt:P231 wdt:P662 wdt:P683 }
  wd:Q2270 ?prop ?id .            # Q2270 = aspirin
  BIND(?prop AS ?propLabel)
  BIND(?id   AS ?casLabel)        # reuse ?id for all; alias in presentation
}
```

Or more readably:

```sparql
SELECT ?cas ?pubchem ?chebi WHERE {
  wd:Q2270 wdt:P231 ?cas .
  OPTIONAL { wd:Q2270 wdt:P662 ?pubchem }
  OPTIONAL { wd:Q2270 wdt:P683 ?chebi }
}
```

### Physical properties (P2101 melting point, P2102 boiling point)
Returned as `xsd:decimal` with a unit qualifier (`pq:P1114` or `pq:P2076`
for temperature unit). Fetch the unit for a complete answer:

```sparql
SELECT ?mp ?unitLabel WHERE {
  wd:Q2270 p:P2101 ?stmt .
  ?stmt ps:P2101 ?mp ;
        psv:P2101/wikibase:quantityUnit ?unit .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
```

### Medical conditions treated (P2175)
Multi-valued. Collapse with `GROUP_CONCAT` when showing one row per compound:

```sparql
SELECT ?compoundLabel (GROUP_CONCAT(?condLabel; SEPARATOR=", ") AS ?treats) WHERE {
  wd:Q2270 wdt:P2175 ?cond .
  ?cond rdfs:label ?condLabel .
  FILTER(LANG(?condLabel) = "en")
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?compoundLabel
```

### Chemical element vs compound
Chemical elements (Q188580 / Q11344) share some properties (atomic number
`wdt:P1086`, symbol `wdt:P246`) that compounds do not have. Check P31 before
adding element-specific properties to the VALUES list.

## Common pitfalls

| Pitfall | Correct approach |
|---------|-----------------|
| `wdt:P274` (formula) filtered by language | Formula is a plain string; no `FILTER(LANG(...))` needed |
| Physical property values without unit | Use `p:/ps:/psv:` statement model to fetch the unit qualifier |
| Expecting a single CAS number | Some compounds have multiple CAS numbers; treat P231 as multi-valued |
| Mixing chemical elements and compounds in the same query | Filter with `wdt:P31 wd:Q11173` (compound) or `wd:Q188580` (element) as appropriate |
| `wdt:P2175` returning too many rows | Add `LIMIT` or narrow with a specific compound |
