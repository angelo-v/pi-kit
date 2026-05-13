import { describe, it, expect } from "vitest";
import { inferFormat, FORMAT_LABEL } from "../rdf-format.js";
import type { OutputFormat } from "../rdf-format.js";

describe("inferFormat", () => {
  it.each<[string, OutputFormat]>([
    ["graph.ttl",    "turtle"],
    ["GRAPH.TTL",    "turtle"],   // case-insensitive
    ["data.jsonld",  "jsonld"],
    ["data.json",    "jsonld"],
    ["export.nt",    "ntriples"],
    ["dataset.nq",   "nquads"],
  ])("infers %s → %s", (file, expected) => {
    expect(inferFormat(file)).toBe(expected);
  });

  it("falls back to turtle for an unknown extension", () => {
    expect(inferFormat("graph.rdf")).toBe("turtle");
  });

  it("falls back to turtle for a file with no extension", () => {
    expect(inferFormat("Makefile")).toBe("turtle");
  });

  it("uses only the final extension for dotted names", () => {
    expect(inferFormat("archive.backup.nt")).toBe("ntriples");
  });
});

describe("FORMAT_LABEL", () => {
  const cases: [OutputFormat, string][] = [
    ["turtle",   "Turtle"],
    ["jsonld",   "JSON-LD"],
    ["ntriples", "N-Triples"],
    ["nquads",   "N-Quads"],
  ];

  it.each(cases)("labels %s as %s", (fmt, label) => {
    expect(FORMAT_LABEL[fmt]).toBe(label);
  });
});
