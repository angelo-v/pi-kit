import { describe, it, expect } from "vitest";
import { parseTurtle } from "../rdf-parse.js";

const MINIMAL_TTL = `
  @prefix ex: <http://example.org/> .
  ex:alice a ex:Person .
`;

const TWO_TRIPLES_TTL = `
  @prefix ex:   <http://example.org/> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

  ex:alice a ex:Person ;
           rdfs:label "Alice" .
`;

describe("parseTurtle", () => {
  it("resolves with the correct number of quads", async () => {
    const { quads } = await parseTurtle(MINIMAL_TTL);
    expect(quads).toHaveLength(1);
  });

  it("returns quads with correct subject, predicate, and object IRIs", async () => {
    const { quads } = await parseTurtle(MINIMAL_TTL);
    const [q] = quads;
    expect(q.subject.value).toBe("http://example.org/alice");
    expect(q.predicate.value).toBe("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
    expect(q.object.value).toBe("http://example.org/Person");
  });

  it("returns all quads when the source has multiple triples", async () => {
    const { quads } = await parseTurtle(TWO_TRIPLES_TTL);
    expect(quads).toHaveLength(2);
  });

  it("collects prefix declarations from the source", async () => {
    const { prefixes } = await parseTurtle(TWO_TRIPLES_TTL);
    expect(prefixes["ex"]).toBe("http://example.org/");
    expect(prefixes["rdfs"]).toBe("http://www.w3.org/2000/01/rdf-schema#");
  });

  it("returns an empty quads array for an empty document", async () => {
    const { quads } = await parseTurtle("@prefix ex: <http://example.org/> .");
    expect(quads).toHaveLength(0);
  });

  it("rejects with a descriptive error for invalid Turtle", async () => {
    await expect(parseTurtle("this is not turtle!!!")).rejects.toThrow();
  });

  it("parses literal objects and exposes their value", async () => {
    const ttl = `@prefix ex: <http://example.org/> . ex:s ex:p "hello world" .`;
    const { quads } = await parseTurtle(ttl);
    expect(quads[0].object.value).toBe("hello world");
  });

  it("parses blank-node subjects", async () => {
    const ttl = `@prefix ex: <http://example.org/> . [] a ex:Thing .`;
    const { quads } = await parseTurtle(ttl);
    expect(quads[0].subject.termType).toBe("BlankNode");
  });
});
