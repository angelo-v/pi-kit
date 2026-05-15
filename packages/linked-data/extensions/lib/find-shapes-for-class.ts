/**
 * find-shapes-for-class.ts
 *
 * Pure logic for discovering SHACL NodeShapes that target a given class IRI.
 *
 * The search is done with a SPARQL SELECT query executed against one or more
 * local RDF/Turtle files (typically the auto-discovered *.shacl.ttl files in
 * the workspace).  All I/O (query execution) is injected via the
 * `RunQueryFn` interface so the logic is straightforward to unit-test.
 */

// ── Public types ──────────────────────────────────────────────────────────────

/** A single discovered shape. */
export interface DiscoveredShape {
  /** Absolute IRI of the sh:NodeShape. */
  shapeIri: string;
  /**
   * Absolute IRI of the sh:targetClass constraint — may differ from the
   * requested class IRI when the class was matched transitively (future work).
   */
  targetClass: string;
  /** Absolute path of the file in which the shape was found. */
  sourceFile: string;
}

/** Result returned by `findShapesForClass`. */
export interface FindShapesResult {
  /** Class IRI that was searched for. */
  classIri: string;
  /** Shapes that target the requested class. */
  shapes: DiscoveredShape[];
}

/**
 * Injectable query executor.
 *
 * Receives a SPARQL SELECT query and a list of `file://` source URIs and
 * returns the raw result rows as an array of string-valued maps.
 */
export type RunQueryFn = (
  query: string,
  sources: string[]
) => Promise<Array<Record<string, string>>>;

// ── SPARQL query ──────────────────────────────────────────────────────────────

/**
 * Builds the SPARQL SELECT query that finds NodeShapes targeting `classIri`.
 *
 * The query covers two targeting mechanisms:
 *   - `sh:targetClass`            — the standard, explicit target declaration
 *   - `rdf:type sh:NodeShape` + the shape IRI itself == the class (implicit
 *     class target — a NodeShape that is also a class implicitly targets
 *     instances of itself per SHACL § 2.1.3)
 */
export function buildShapesQuery(classIri: string): string {
  return `
PREFIX sh:  <http://www.w3.org/ns/shacl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?shape ?targetClass WHERE {
  {
    ?shape a sh:NodeShape ;
           sh:targetClass <${classIri}> .
    BIND(<${classIri}> AS ?targetClass)
  }
  UNION
  {
    <${classIri}> a sh:NodeShape .
    BIND(<${classIri}> AS ?shape)
    BIND(<${classIri}> AS ?targetClass)
  }
}
ORDER BY ?shape
`.trim();
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Discovers SHACL NodeShapes that target `classIri` across `sourceFiles`.
 *
 * Each entry in `sourceFiles` must be an absolute `file://` URI.
 * The query is run once against the union of all source files.
 *
 * @param classIri    The fully-qualified class IRI to search for.
 * @param sourceFiles `file://` URIs of the shapes files to query.
 * @param runQuery    Injectable query executor.
 */
export async function findShapesForClass(
  classIri: string,
  sourceFiles: string[],
  runQuery: RunQueryFn
): Promise<FindShapesResult> {
  if (sourceFiles.length === 0) {
    return { classIri, shapes: [] };
  }

  const query = buildShapesQuery(classIri);
  const rows = await runQuery(query, sourceFiles);

  const shapes: DiscoveredShape[] = rows.map((row) => {
    // Derive the source file path: strip the `file://` prefix from the URI.
    // We use the first source file as a fallback when the engine does not
    // expose per-row provenance (most simple Comunica CLI invocations).
    const sourceUri = sourceFiles[0];
    const sourceFile = sourceUri.startsWith("file://")
      ? sourceUri.slice("file://".length)
      : sourceUri;

    return {
      shapeIri: row["shape"] ?? "",
      targetClass: row["targetClass"] ?? classIri,
      sourceFile,
    };
  });

  return { classIri, shapes };
}

// ── Formatting helper ─────────────────────────────────────────────────────────

/**
 * Formats a `FindShapesResult` as a human-readable string for the LLM.
 */
export function formatFindShapesResult(
  result: FindShapesResult,
  sourceFiles: string[]
): string {
  const searched = sourceFiles.join(", ");

  if (result.shapes.length === 0) {
    return (
      `No SHACL shapes found targeting <${result.classIri}>.\n` +
      `Searched: ${searched}`
    );
  }

  const header =
    `Found ${result.shapes.length} shape${result.shapes.length !== 1 ? "s" : ""} ` +
    `targeting <${result.classIri}>:\n\n` +
    `| Shape | Target Class | Source File |\n` +
    `|-------|-------------|-------------|\n`;

  const rows = result.shapes
    .map((s) => `| ${s.shapeIri} | ${s.targetClass} | ${s.sourceFile} |`)
    .join("\n");

  return header + rows;
}
