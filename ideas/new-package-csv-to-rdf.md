# Idea: New Package — `pi-kit-csv-to-rdf` (Tabular Data → Linked Data)

## Problem

A huge proportion of real-world data lives in CSV, TSV, or spreadsheet form.
Converting it to RDF is a common but tedious task: the user must manually map
columns to predicates, choose a base URI, decide on literal types, and write
Turtle by hand. The W3C has a standard for this —
[CSV on the Web (CSVW)](https://www.w3.org/TR/tabular-data-primer/) — but it
requires writing a JSON-LD mapping document, which is itself non-trivial.

## Proposed Package: `@aveltens/pi-kit-csv-to-rdf`

A new pi-kit package with a guided, agent-native workflow for lifting tabular
data to RDF.

### Tools

#### `csv_inspect`

```
csv_inspect(file)
```

Reads a CSV/TSV file and returns:
- Column names and inferred data types (string, integer, decimal, date, URI).
- Sample values (first 5 rows per column).
- Row count.
- Detected delimiter and encoding.

Used before mapping so the agent understands the input structure.

#### `csv_map`

```
csv_map(file, mapping, outputPath, baseUri?)
```

Applies a column-to-predicate mapping and produces RDF output.

`mapping` is a JSON object:
```json
{
  "idColumn": "id",
  "classUri": "https://example.org/Person",
  "columns": {
    "name":     { "predicate": "foaf:name",     "type": "string" },
    "birthDate":{ "predicate": "schema:birthDate", "type": "date" },
    "homepage": { "predicate": "foaf:homepage",  "type": "uri" }
  }
}
```

Returns the same write summary as `rdf_write`. Under the hood uses
the existing `rdf-serialize.ts` module.

#### `csvw_generate`

```
csvw_generate(file, outputPath)
```

Generates a CSVW metadata JSON-LD file from column inspection, which can be
edited and used with any standards-compliant CSVW processor.

### Skill: `csv-to-rdf`

Guides the agent through the full lift workflow:
1. `csv_inspect` to understand the file.
2. Discuss the mapping with the user (which column is the ID? what ontology
   to use?).
3. `csv_map` to produce RDF.
4. `sparql_query_files` to validate the output.
5. Optionally `csvw_generate` for a reusable, shareable mapping.

### Why a Separate Package?

- CSV parsing adds `papaparse` or a similar dependency not needed by the
  linked-data core.
- The CSVW spec knowledge is self-contained.
- Users who only need SPARQL/RDF tools don't pay the install cost.
- It composes cleanly with `pi-kit-linked-data`: output of `csv_map` feeds
  directly into `sparql_query_files` and `rdf_write`.
