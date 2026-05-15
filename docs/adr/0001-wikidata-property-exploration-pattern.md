# 0001 — Wikidata Property Exploration Pattern

Date: 2026-05-15
Status: accepted

---

## Context and Problem Statement

The `sparql-query-wikidata` skill included a single "Properties of a specific
entity" exploration query that matched all predicates on an entity:

```sparql
SELECT ?prop ?propLabel ?value ?valueLabel WHERE {
  wd:Q64 ?prop ?value .
  ...
}
LIMIT 30
```

Empirical testing against Berlin (Q64) showed the query is unusable in
practice:

- `rdfs:label` produces 300 rows (one per language)
- `schema:description` produces 118 rows (multilingual)
- `skos:altLabel` produces 65 rows
- The entire `LIMIT 30` budget is consumed by label noise before a single
  substantive fact appears

The immediate instinct was to add a namespace filter (`STRSTARTS(STR(?prop),
STR(wdt:))`) and/or a language filter (`LANG(?value) = "en"`). Investigation
showed both approaches are insufficient on their own:

- `schema:description` is multilingual too (118 language variants) — so it
  has the same noise problem as `rdfs:label`, despite seeming useful
- Some `wdt:` properties store multilingual untagged string literals (e.g.
  `P1549` demonyms, `P998` DMOZ paths), so a `wdt:` namespace filter alone
  doesn't eliminate language noise
- Combining both filters (`wdt:` + `LANG = ""||"en"`) still lets through
  untagged multilingual strings like DMOZ paths

No purely filter-based approach is airtight.

---

## Decision Drivers

- Exploration queries must return useful signal within `LIMIT 30`
- The pattern must work for any entity, not just cities
- Property sets are domain-specific — population is meaningless for a person,
  birth date is meaningless for a city
- The skill must be maintainable and extensible as new domains are encountered

---

## Considered Options

### Option 1 — Add a `wdt:` namespace filter
Single filter: `FILTER(STRSTARTS(STR(?prop), STR(wdt:)))`.

### Option 2 — Add a language filter
Filter to English literals: `FILTER(LANG(?value) = "" || LANG(?value) = "en")`.

### Option 3 — Combine namespace + language filter
`FILTER(STRSTARTS(STR(?prop), STR(wdt:)) && (LANG(?value) = "" || LANG(?value) = "en"))`.

### Option 4 — Replace with a three-step workflow + domain reference files
1. **Inventory query** (`GROUP BY ?prop COUNT`) — always domain-agnostic
2. **P31 lookup** — identify the entity's type to select the right domain
3. **Curated `VALUES` fetch** — property set loaded from a per-domain
   reference file, not hardcoded

Domain reference files live in `domains/` next to `SKILL.md`, one file per
domain (city, person, organisation, creative work, chemical compound, …).

---

## Decision Outcome

**Chosen option: Option 4 — three-step workflow + domain reference files**

because no filter-based approach is reliably noise-free, and because the
correct property set is inherently domain-dependent. A single hardcoded
`VALUES` list would be misleading for entities outside its target domain.

### Good consequences

- Exploration queries always return useful results regardless of entity type
- Domain files are independently maintainable and extensible
- The skill loads only the relevant domain file, keeping context lean
- Domain files can include domain-specific tips and pitfalls alongside the
  property set

### Bad consequences

- More complex workflow (three steps instead of one query)
- Requires a domain match step — entities with unusual or ambiguous `P31`
  types may not match any domain file
- Domain files must be created and kept up to date as new domains are
  encountered

---

## Rejected Options

**Options 1–3** were rejected because they are filters on a fundamentally
wrong query shape. The root problem is not the filter — it is that a single
catch-all query cannot produce a useful, domain-appropriate result set.
Filters reduce noise but cannot eliminate it (untagged multilingual literals
pass through), and they do not address the domain-mismatch problem.

`schema:description` was initially considered worth preserving (it provides a
human-readable summary useful for entity confirmation), but testing showed it
produces 118 language variants, making it equally noisy. A dedicated
`FILTER(LANG(?desc) = "en")` fetch is preferable if the description is needed.
