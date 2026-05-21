/**
 * Unit tests for skos-concepts.ts
 *
 * The Comunica QueryEngine is injected as a mock so no real filesystem or
 * network I/O occurs.
 */

import { vi, describe, it, expect } from "vitest";
import { querySkosConcepts, conceptMention, type SkosConcept } from "../skos-concepts.js";
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
