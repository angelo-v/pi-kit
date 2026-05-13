# @aveltens/pi-kit-linked-data

Pi Coding Agent skills and extensions to work with RDF, SPARQL, and other Linked Data technologies.

Adds tools and matching skills to the [Pi Coding Agent](https://pi.dev):

| Tool | What it does |
|---|---|
| `sparql_query_files` | Run SPARQL 1.1 queries against local RDF/Turtle files |
| `sparql_query_endpoint` | Query any remote SPARQL endpoint by URL |
| `sparql_query_wikidata` | Query the Wikidata Knowledge Graph for real-world facts |

Two discovery tools are also included: `discover_rdf_files` and `discover_sparql_queries`.

## Quick Start

### Install

```bash
pi install npm:@aveltens/pi-kit-linked-data
```

To try the package without installing it permanently:

```bash
pi -e npm:@aveltens/pi-kit-linked-data
```

To install per-project (shared with your team via `.pi/settings.json`):

```bash
pi install -l npm:@aveltens/pi-kit-linked-data
```

### Query local RDF files

Put some Turtle files in your workspace, then ask Pi in plain English:

> *"What classes are defined in my ontology?"*
> *"List all SKOS concepts with their labels."*
> *"Find all resources of type schema:Person."*

Pi will run `discover_rdf_files` to locate the files and `sparql_query_files` to query them.

### Query a remote SPARQL endpoint

> *"Query DBpedia for population of Germany."*
> *"List the classes available at https://example.org/sparql."*

Pi uses `sparql_query_endpoint` and handles PREFIX declarations automatically.

### Query Wikidata

> *"Who were the presidents of France in the 20th century?"*
> *"What is the capital of Japan?"*
> *"List all Nobel Prize winners in Physics since 2010."*

Pi uses `sparql_query_wikidata`, which pre-injects all standard Wikidata prefixes (`wd:`, `wdt:`, `wikibase:`, etc.) — no declarations needed.

## What's Included

### Tools

| Tool | Description |
|---|---|
| `sparql_query_files` | Executes SPARQL 1.1 (SELECT/ASK/CONSTRUCT/DESCRIBE) against local `.ttl`, `.rdf`, `.n3`, `.jsonld`, `.trig`, `.nq`, `.nt` files using Comunica |
| `sparql_query_endpoint` | Executes SPARQL 1.1 against any remote endpoint over HTTP |
| `sparql_query_wikidata` | Executes SPARQL 1.1 against the Wikidata Query Service with standard prefixes pre-injected |
| `discover_rdf_files` | Finds all RDF data files in the workspace |
| `discover_sparql_queries` | Finds all `.rq` / `.sparql` query files in the workspace |

### Skills

Skills guide Pi on when and how to use the tools:

- **sparql-query-files** — semantic graph traversal, class/property discovery, reusing existing `.rq` files
- **sparql-query-endpoint** — endpoint exploration, output format selection, PREFIX declarations
- **sparql-query-wikidata** — entity/property model, label service patterns, multi-hop traversal

## Requirements

- [Pi Coding Agent](https://pi.dev) — any version

