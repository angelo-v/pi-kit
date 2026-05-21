/**
 * Unit tests for skos-concepts.ts
 *
 * The Comunica QueryEngine is injected as a mock so no real filesystem or
 * network I/O occurs.
 */

import { vi, describe, it, expect } from "vitest";
import { querySkosConcepts, conceptMention, formatConceptContext, type SkosConcept } from "../skos-concepts.js";
import type { QueryEngine } from "@comunica/query-sparql-file";

// ── helpers ───────────────────────────────────────────────────────────────────

function mockBinding(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => (values[key] !== undefined ? { value: values[key] } : undefined),
  };
}

function mockEngine(rows: Array<Record<string, string | undefined>>): QueryEngine {
  return {
    queryBindings: vi.fn().mockResolvedValue({
      toArray: vi.fn().mockResolvedValue(rows.map(mockBinding)),
    }),
  } as unknown as QueryEngine;
}

// ── querySkosConcepts ─────────────────────────────────────────────────────────

describe("querySkosConcepts", () => {
  it("returns empty array when no files given", async () => {
    const engine = mockEngine([]);
    expect(await querySkosConcepts([], engine)).toEqual([]);
  });

  it("returns a concept with label and description", async () => {
    const engine = mockEngine([
      {
        concept: "http://example.org/concept/SemanticWeb",
        label: "Semantic Web",
        altLabel: undefined,
        definition: "The extension of the Web through standards.",
        broader: undefined,
      },
    ]);

    const concepts = await querySkosConcepts(["/data/vocab.ttl"], engine);
    expect(concepts).toHaveLength(1);
    expect(concepts[0]).toMatchObject({
      iri: "http://example.org/concept/SemanticWeb",
      label: "Semantic Web",
      altLabels: [],
      description: "The extension of the Web through standards.",
    });
  });

  it("accumulates multiple altLabels for the same concept", async () => {
    const engine = mockEngine([
      {
        concept: "http://example.org/concept/AI",
        label: "Artificial Intelligence",
        altLabel: "AI",
        definition: undefined,
        broader: undefined,
      },
      {
        concept: "http://example.org/concept/AI",
        label: "Artificial Intelligence",
        altLabel: "Machine Intelligence",
        definition: undefined,
        broader: undefined,
      },
    ]);

    const concepts = await querySkosConcepts(["/data/vocab.ttl"], engine);
    expect(concepts).toHaveLength(1);
    expect(concepts[0]!.altLabels).toEqual(expect.arrayContaining(["AI", "Machine Intelligence"]));
  });

  it("falls back to local name when no prefLabel present", async () => {
    const engine = mockEngine([
      {
        concept: "http://example.org/concept/LinkedData",
        label: undefined,
        altLabel: undefined,
        definition: undefined,
        broader: undefined,
      },
    ]);

    const concepts = await querySkosConcepts(["/data/vocab.ttl"], engine);
    expect(concepts[0]!.label).toBe("LinkedData");
  });

  it("captures broader concept IRI", async () => {
    const engine = mockEngine([
      {
        concept: "http://example.org/concept/OWL",
        label: "OWL",
        altLabel: undefined,
        definition: undefined,
        broader: "http://example.org/concept/SemanticWeb",
      },
    ]);

    const concepts = await querySkosConcepts(["/data/vocab.ttl"], engine);
    expect(concepts[0]!.broader).toBe("http://example.org/concept/SemanticWeb");
  });
});

// ── formatConceptContext ──────────────────────────────────────────────────────

describe("formatConceptContext", () => {
  it("includes the mention token and IRI", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/SemanticWeb",
      label: "Semantic Web",
      altLabels: [],
    };
    const out = formatConceptContext(concept);
    expect(out).toContain("#SemanticWeb");
    expect(out).toContain("<http://example.org/concept/SemanticWeb>");
  });

  it("includes definition when present", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/SemanticWeb",
      label: "Semantic Web",
      altLabels: [],
      description: "An extension of the Web.",
    };
    expect(formatConceptContext(concept)).toContain("An extension of the Web.");
  });

  it("includes altLabels when present", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/AI",
      label: "Artificial Intelligence",
      altLabels: ["AI", "Machine Intelligence"],
    };
    const out = formatConceptContext(concept);
    expect(out).toContain("AI");
    expect(out).toContain("Machine Intelligence");
  });

  it("includes broader IRI when present", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/OWL",
      label: "OWL",
      altLabels: [],
      broader: "http://example.org/concept/SemanticWeb",
    };
    expect(formatConceptContext(concept)).toContain("<http://example.org/concept/SemanticWeb>");
  });

  it("omits optional lines when absent", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/OWL",
      label: "OWL",
      altLabels: [],
    };
    const out = formatConceptContext(concept);
    expect(out).not.toContain("Definition");
    expect(out).not.toContain("Also known as");
    expect(out).not.toContain("Broader");
  });
});

// ── conceptMention ────────────────────────────────────────────────────────────

describe("conceptMention", () => {
  it("prefixes with # and CamelCases a multi-word label", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/SemanticWeb",
      label: "Semantic Web",
      altLabels: [],
    };
    expect(conceptMention(concept)).toBe("#SemanticWeb");
  });

  it("uppercases only the first character of a single-word label", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/ontology",
      label: "ontology",
      altLabels: [],
    };
    expect(conceptMention(concept)).toBe("#Ontology");
  });

  it("preserves existing uppercase in label", () => {
    const concept: SkosConcept = {
      iri: "http://example.org/concept/AI",
      label: "AI",
      altLabels: [],
    };
    expect(conceptMention(concept)).toBe("#AI");
  });
});
