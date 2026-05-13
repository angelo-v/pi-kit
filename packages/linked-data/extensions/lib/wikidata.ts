/**
 * Wikidata-specific helpers for the sparql-query-endpoint extension.
 *
 * Kept in a separate lib module so they can be unit-tested without pulling in
 * the pi ExtensionAPI or other framework dependencies.
 */

/** The Wikidata SPARQL Query Service endpoint URL. */
export const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * Standard Wikidata PREFIX declarations that are automatically prepended to
 * every query sent to the Wikidata Query Service.
 *
 * Reference: https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries
 */
export const WIKIDATA_PREFIXES = `\
PREFIX wd:        <http://www.wikidata.org/entity/>
PREFIX wdt:       <http://www.wikidata.org/prop/direct/>
PREFIX wikibase:  <http://wikiba.se/ontology#>
PREFIX p:         <http://www.wikidata.org/prop/>
PREFIX ps:        <http://www.wikidata.org/prop/statement/>
PREFIX pq:        <http://www.wikidata.org/prop/qualifier/>
PREFIX rdfs:      <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema:    <https://schema.org/>
PREFIX skos:      <http://www.w3.org/2004/02/skos/core#>
PREFIX owl:       <http://www.w3.org/2002/07/owl#>
PREFIX xsd:       <http://www.w3.org/2001/XMLSchema#>
PREFIX bd:        <http://www.bigdata.com/rdf#>
`;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prepend Wikidata PREFIX declarations to `query`, skipping any that the
 * query already declares itself to avoid duplicate PREFIX errors.
 */
export function injectWikidataPrefixes(query: string): string {
  const lines = WIKIDATA_PREFIXES.split("\n").filter((line) => {
    const match = line.match(/^PREFIX\s+(\S+)\s+/i);
    if (!match) return false;
    const prefix = match[1]; // e.g. "wd:"
    return !new RegExp(`\\bPREFIX\\s+${escapeRegExp(prefix)}\\s+`, "i").test(query);
  });
  if (lines.length === 0) return query;
  return lines.join("\n") + "\n" + query;
}
