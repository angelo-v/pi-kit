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
  /** Broader concept label, if present. */
  broaderLabel?: string;
  /** Narrower concept IRIs. */
  narrower?: string[];
  /** Narrower concept labels (parallel array to narrower). */
  narrowerLabels?: string[];
}

const QUERY = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?concept ?label ?altLabel ?definition ?broader ?broaderLabel ?narrower ?narrowerLabel
WHERE {
  ?concept a skos:Concept .
  OPTIONAL { ?concept skos:prefLabel ?label }
  OPTIONAL { ?concept skos:altLabel ?altLabel }
  OPTIONAL { ?concept skos:definition ?definition }
  OPTIONAL { ?concept skos:scopeNote ?definition }
  OPTIONAL {
    ?concept skos:broader ?broader .
    OPTIONAL { ?broader skos:prefLabel ?broaderLabel }
  }
  OPTIONAL {
    ?concept skos:narrower ?narrower .
    OPTIONAL { ?narrower skos:prefLabel ?narrowerLabel }
  }
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

  // Group by concept IRI, accumulating altLabels and narrower concepts
  const map = new Map<
    string,
    {
      label: string;
      altLabels: Set<string>;
      description?: string;
      broader?: string;
      broaderLabel?: string;
      narrower: Map<string, string | undefined>; // IRI → label
    }
  >();

  for (const row of rows) {
    const iri = row.get("concept")?.value;
    if (!iri) continue;

    const label = row.get("label")?.value ?? localName(iri);
    const altLabel = row.get("altLabel")?.value;
    const definition = row.get("definition")?.value;
    const broader = row.get("broader")?.value;
    const broaderLabel = row.get("broaderLabel")?.value;
    const narrower = row.get("narrower")?.value;
    const narrowerLabel = row.get("narrowerLabel")?.value;

    if (!map.has(iri)) {
      map.set(iri, { label, altLabels: new Set(), description: definition, broader, broaderLabel, narrower: new Map() });
    }

    const entry = map.get(iri)!;
    // Keep the first non-empty label, prefer the one from the first row
    if (!entry.label || entry.label === localName(iri)) {
      entry.label = label;
    }
    if (altLabel) entry.altLabels.add(altLabel);
    if (definition && !entry.description) entry.description = definition;
    if (broader && !entry.broader) {
      entry.broader = broader;
      entry.broaderLabel = broaderLabel;
    }
    if (narrower && !entry.narrower.has(narrower)) {
      entry.narrower.set(narrower, narrowerLabel);
    }
  }

  return Array.from(map.entries()).map(([iri, { label, altLabels, description, broader, broaderLabel, narrower }]) => ({
    iri,
    label,
    altLabels: Array.from(altLabels),
    description,
    broader,
    broaderLabel,
    narrower: Array.from(narrower.keys()),
    narrowerLabels: Array.from(narrower.values()).map((l) => l ?? ""),
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

/**
 * Format a concept as a short context block for injection into the LLM prompt.
 */
export function formatConceptContext(concept: SkosConcept): string {
  const lines: string[] = [`${conceptMention(concept)} — <${concept.iri}>`];
  if (concept.description) lines.push(`  Definition: ${concept.description}`);
  if (concept.altLabels.length > 0)
    lines.push(`  Also known as: ${concept.altLabels.join(", ")}`);
  if (concept.broader) {
    const broaderDisplay = concept.broaderLabel
      ? `${concept.broaderLabel} <${concept.broader}>`
      : `<${concept.broader}>`;
    lines.push(`  Broader: ${broaderDisplay}`);
  }
  if ((concept.narrower ?? []).length > 0) {
    const narrowerDisplay = (concept.narrower ?? []).map((iri, i) => {
      const lbl = (concept.narrowerLabels ?? [])[i];
      return lbl ? `${lbl} <${iri}>` : `<${iri}>`;
    });
    lines.push(`  Narrower: ${narrowerDisplay.join(", ")}`);
  }
  return lines.join("\n");
}
