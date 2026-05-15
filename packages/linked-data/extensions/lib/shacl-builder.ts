/**
 * SHACL shape builder — pure business logic, no I/O.
 *
 * Constructs well-formed SHACL NodeShape and PropertyShape Turtle snippets
 * from structured input descriptors.  The caller is responsible for writing
 * the result to a file.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type XsdDatatype =
  | "xsd:string"
  | "xsd:integer"
  | "xsd:decimal"
  | "xsd:boolean"
  | "xsd:date"
  | "xsd:dateTime"
  | "xsd:anyURI";

export interface PropertyShapeSpec {
  /** Human-readable label for this property shape (becomes sh:name). */
  name: string;
  /** RDF property path, e.g. "ex:email" or "foaf:name". */
  path: string;
  /** XSD datatype constraint (optional). */
  datatype?: XsdDatatype;
  /** sh:class constraint — the object must be an instance of this class (optional). */
  nodeKind?: "sh:IRI" | "sh:BlankNode" | "sh:BlankNodeOrIRI" | "sh:Literal";
  /** sh:class value (optional). */
  classConstraint?: string;
  /** Minimum count (optional). */
  minCount?: number;
  /** Maximum count (optional). */
  maxCount?: number;
  /** sh:pattern — a regular-expression pattern (optional). */
  pattern?: string;
  /** sh:minLength (optional). */
  minLength?: number;
  /** sh:maxLength (optional). */
  maxLength?: number;
}

export interface NodeShapeSpec {
  /** Prefixed IRI for the shape, e.g. "ex:PersonShape". */
  shapeIri: string;
  /** The RDF class this shape targets, e.g. "ex:Person" (used as sh:targetClass). */
  targetClass?: string;
  /** Human-readable label. */
  label?: string;
  /** Property shapes to embed. */
  properties: PropertyShapeSpec[];
}

export interface ShaclBuildResult {
  /** Complete Turtle text (prefixes + shape definition). */
  turtle: string;
  /** Suggested file name derived from the shape IRI local name, e.g. "PersonShape.ttl". */
  suggestedFileName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the local name from a prefixed IRI like "ex:PersonShape"
 * or a full IRI like "<http://example.org/PersonShape>".
 */
export function localName(iri: string): string {
  const colonIdx = iri.lastIndexOf(":");
  const slashIdx = iri.lastIndexOf("/");
  const hashIdx = iri.lastIndexOf("#");
  const splitAt = Math.max(colonIdx, slashIdx, hashIdx);
  const raw = splitAt >= 0 ? iri.slice(splitAt + 1) : iri;
  return raw.replace(/[<>]/g, "");
}

/**
 * Collects all namespace prefixes referenced in a NodeShapeSpec that are
 * not standard SHACL / XSD prefixes (which are always included).
 *
 * Returns a map of prefix → placeholder IRI so the caller can substitute
 * real IRIs.  Prefixes already in the standard set are silently skipped.
 */
function collectCustomPrefixes(spec: NodeShapeSpec): Set<string> {
  const standard = new Set(["sh", "xsd", "rdf", "rdfs", "owl"]);
  const found = new Set<string>();

  const scan = (token: string | undefined) => {
    if (!token) return;
    const m = token.match(/^([A-Za-z][A-Za-z0-9_-]*):/);
    if (m && !standard.has(m[1])) found.add(m[1]);
  };

  scan(spec.shapeIri);
  scan(spec.targetClass);
  for (const p of spec.properties) {
    scan(p.path);
    scan(p.datatype);
    scan(p.classConstraint);
  }
  return found;
}

/** Indents every line of a block by `n` spaces. */
function indent(text: string, n: number): string {
  const pad = " ".repeat(n);
  return text
    .split("\n")
    .map((l) => (l.trim() ? pad + l : l))
    .join("\n");
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Serialises a single `PropertyShapeSpec` into inline Turtle lines
 * (without the outer `sh:property [ ... ]` wrapper).
 */
export function buildPropertyShapeBody(prop: PropertyShapeSpec): string[] {
  const lines: string[] = [];
  lines.push(`sh:path ${prop.path} ;`);
  lines.push(`sh:name "${prop.name}" ;`);

  if (prop.datatype) lines.push(`sh:datatype ${prop.datatype} ;`);
  if (prop.nodeKind) lines.push(`sh:nodeKind ${prop.nodeKind} ;`);
  if (prop.classConstraint) lines.push(`sh:class ${prop.classConstraint} ;`);
  if (prop.minCount !== undefined) lines.push(`sh:minCount ${prop.minCount} ;`);
  if (prop.maxCount !== undefined) lines.push(`sh:maxCount ${prop.maxCount} ;`);
  if (prop.pattern) lines.push(`sh:pattern "${prop.pattern.replace(/"/g, '\\"')}" ;`);
  if (prop.minLength !== undefined) lines.push(`sh:minLength ${prop.minLength} ;`);
  if (prop.maxLength !== undefined) lines.push(`sh:maxLength ${prop.maxLength} ;`);

  // Remove trailing semicolon from last constraint line
  if (lines.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, "");
  }

  return lines;
}

/**
 * Builds a complete Turtle document for a SHACL NodeShape.
 *
 * @param spec         Shape specification.
 * @param extraPrefixes Optional map of prefix → base IRI to embed in the header.
 *                      Standard prefixes (sh:, xsd:, rdf:) are always included.
 */
export function buildNodeShape(
  spec: NodeShapeSpec,
  extraPrefixes: Record<string, string> = {}
): ShaclBuildResult {
  // ── Prefix block ──────────────────────────────────────────────────────────
  const standardPrefixes: Record<string, string> = {
    sh:   "http://www.w3.org/ns/shacl#",
    xsd:  "http://www.w3.org/2001/XMLSchema#",
    rdf:  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  };

  // Detect which custom prefixes are actually used in the spec
  const usedCustomPrefixes = collectCustomPrefixes(spec);
  const mergedPrefixes: Record<string, string> = { ...standardPrefixes };
  for (const prefix of usedCustomPrefixes) {
    mergedPrefixes[prefix] = extraPrefixes[prefix] ?? `http://example.org/${prefix}/`;
  }

  const prefixLines = Object.entries(mergedPrefixes)
    .map(([p, iri]) => `@prefix ${p}: <${iri}> .`)
    .join("\n");

  // ── Shape body ────────────────────────────────────────────────────────────
  const shapeLines: string[] = [];
  shapeLines.push(`${spec.shapeIri}`);
  shapeLines.push(`  a sh:NodeShape ;`);

  if (spec.label) {
    shapeLines.push(`  rdfs:label "${spec.label.replace(/"/g, '\\"')}" ;`);
  }
  if (spec.targetClass) {
    shapeLines.push(`  sh:targetClass ${spec.targetClass} ;`);
  }

  for (let i = 0; i < spec.properties.length; i++) {
    const propBody = buildPropertyShapeBody(spec.properties[i]);
    const isLast = i === spec.properties.length - 1;
    const propBlock = [
      `  sh:property [`,
      ...propBody.map((l) => `    ${l}`),
      `  ]${isLast ? " ." : " ;"}`,
    ];
    shapeLines.push(...propBlock);
  }

  // If no properties were added, close the shape
  if (spec.properties.length === 0) {
    // Replace the last " ;" with " ."
    const last = shapeLines[shapeLines.length - 1];
    shapeLines[shapeLines.length - 1] = last.endsWith(" ;")
      ? last.slice(0, -2) + " ."
      : last + " .";
  }

  const turtle = `${prefixLines}\n\n${shapeLines.join("\n")}\n`;
  const suggestedFileName = `${localName(spec.shapeIri)}.ttl`;

  return { turtle, suggestedFileName };
}
