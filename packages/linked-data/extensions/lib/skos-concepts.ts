/**
 * SKOS concept discovery via SPARQL over local RDF files.
 *
 * Scans the workspace for RDF files, executes a SPARQL SELECT to retrieve
 * all skos:Concept instances (prefLabel, altLabel, definition), and returns
 * a flat list suitable for autocomplete.
 */

import { QueryEngine } from "@comunica/query-sparql-file";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface SkosConcept {
  /** Full concept IRI. */
  iri: string;
  /** Primary label (skos:prefLabel, falling back to local name). */
  label: string;
  /** Alternative labels (skos:altLabel). */
  altLabels: string[];
  /** Short description (skos:definition or skos:scopeNote), if present. */
  description?: string;
  /** Broader concept IRI, if present. */
  broader?: string;
}

const QUERY = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?concept ?label ?altLabel ?definition ?broader
WHERE {
  ?concept a skos:Concept .
  OPTIONAL { ?concept skos:prefLabel ?label FILTER (LANG(?label) = "en" || LANG(?label) = "") }
  OPTIONAL { ?concept skos:altLabel ?altLabel FILTER (LANG(?altLabel) = "en" || LANG(?altLabel) = "") }
  OPTIONAL { ?concept skos:definition ?definition FILTER (LANG(?definition) = "en" || LANG(?definition) = "") }
  OPTIONAL { ?concept skos:scopeNote ?definition FILTER (LANG(?definition) = "en" || LANG(?definition) = "") }
  OPTIONAL { ?concept skos:broader ?broader }
}
ORDER BY ?concept ?label
`;

function localName(iri: string): string {
  const hashIdx = iri.lastIndexOf("#");
  const slashIdx = iri.lastIndexOf("/");
  const sep = Math.max(hashIdx, slashIdx);
  return sep >= 0 ? iri.slice(sep + 1) : iri;
}

/**
 * Query the given RDF files for SKOS concepts.
 *
 * @param files  Absolute paths of RDF files to query.
 * @param engine Injectable Comunica engine (for testing).
 */
export async function querySkosConcepts(
  files: string[],
  engine?: QueryEngine
): Promise<SkosConcept[]> {
  if (files.length === 0) return [];

  const eng = engine ?? new QueryEngine();
  const sources = files.map((f) => pathToFileURL(f).href) as [string, ...string[]];

  const bindingsStream = await eng.queryBindings(QUERY, {
    sources: sources as any,
  });

  const rows = await bindingsStream.toArray();

  // Group by concept IRI, accumulating altLabels
  const map = new Map<
    string,
    { label: string; altLabels: Set<string>; description?: string; broader?: string }
  >();

  for (const row of rows) {
    const iri = row.get("concept")?.value;
    if (!iri) continue;

    const label = row.get("label")?.value ?? localName(iri);
    const altLabel = row.get("altLabel")?.value;
    const definition = row.get("definition")?.value;
    const broader = row.get("broader")?.value;

    if (!map.has(iri)) {
      map.set(iri, { label, altLabels: new Set(), description: definition, broader });
    }

    const entry = map.get(iri)!;
    // Keep the first non-empty label, prefer the one from the first row
    if (!entry.label || entry.label === localName(iri)) {
      entry.label = label;
    }
    if (altLabel) entry.altLabels.add(altLabel);
    if (definition && !entry.description) entry.description = definition;
  }

  return Array.from(map.entries()).map(([iri, { label, altLabels, description, broader }]) => ({
    iri,
    label,
    altLabels: Array.from(altLabels),
    description,
    broader,
  }));
}

/**
 * Build a display label for a concept suitable for the autocomplete list
 * (e.g. "#SemanticWeb").
 */
export function conceptMention(concept: SkosConcept): string {
  // CamelCase the label for the mention token
  const mention = concept.label
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
  return `#${mention}`;
}
