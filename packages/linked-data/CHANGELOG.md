# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0

### Added
- `sparql_query_endpoint` tool — query any remote SPARQL endpoint by URL.
- `sparql_query_wikidata` tool — query the Wikidata Query Service for any real-world factual question (people,
  places, events, dates, geography, science, …)
- `sparql-query-endpoint` skill — guides the agent when querying arbitrary remote
  SPARQL endpoints.
- `sparql-query-wikidata` skill — guides the agent when querying Wikidata,
  including entity/property model, label service patterns, and multi-hop traversal.

## 0.1.0

### Added
- `sparql_query_files` tool — run SPARQL 1.1 queries against local RDF/Turtle files.
- `discover_rdf_files` tool — find all RDF/Turtle files in the workspace.
- `discover_sparql_queries` tool — find all SPARQL query files in the workspace.
- `sparql-query-files` skill — guides the agent when querying local RDF files.

