/**
 * Tests for ld-fetch.ts (extension entry-point)
 *
 * `formatFetchResult` is a pure function — tested with no mocks.
 * The execute() path mocks `ldFetch` to keep tests offline and fast.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatFetchResult } from "../../ld-fetch.js";
import { FETCHED_DATA_STORE, type FetchResult } from "../ld-fetch-store.js";

// ── Mock ldFetch ──────────────────────────────────────────────────────────────

const { mockLdFetch } = vi.hoisted(() => ({
  mockLdFetch: vi.fn<(uri: string, storeDir: string) => Promise<FetchResult>>(),
}));

vi.mock("../ld-fetch-store.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ld-fetch-store.js")>();
  return { ...real, ldFetch: mockLdFetch };
});

// ── Fixture ───────────────────────────────────────────────────────────────────

const FIXED_TIME = "2026-05-18T10:00:00.000Z";

const SAMPLE_RESULT = {
  uri: "http://xmlns.com/foaf/0.1/",
  format: "text/turtle",
  tripleCount: 631,
  graphIri: "http://xmlns.com/foaf/0.1/",
  recordedAt: FIXED_TIME,
};

// ── formatFetchResult ─────────────────────────────────────────────────────────

describe("formatFetchResult", () => {
  it("includes the fetched URI on the first line", () => {
    const output = formatFetchResult(SAMPLE_RESULT);
    expect(output).toMatch(/^Fetched <http:\/\/xmlns\.com\/foaf\/0\.1\/>/);
  });

  it("includes the content format", () => {
    const output = formatFetchResult(SAMPLE_RESULT);
    expect(output).toContain("Format:   text/turtle");
  });

  it("includes the triple count", () => {
    const output = formatFetchResult(SAMPLE_RESULT);
    expect(output).toContain("Triples:  631");
  });

  it("references the correct store name", () => {
    const output = formatFetchResult(SAMPLE_RESULT);
    expect(output).toContain(`in store "${FETCHED_DATA_STORE}"`);
  });

  it("includes the recordedAt timestamp", () => {
    const output = formatFetchResult(SAMPLE_RESULT);
    expect(output).toContain(`Recorded: ${FIXED_TIME}`);
  });

  it("includes a rdf_memory_query hint with the correct store and URI", () => {
    const output = formatFetchResult(SAMPLE_RESULT);
    expect(output).toContain(`rdf_memory_query(store="${FETCHED_DATA_STORE}"`);
    expect(output).toContain(`GRAPH <http://xmlns.com/foaf/0.1/>`);
  });
});

// ── execute (via the registered tool) ───────────────────────────────────────────

/**
 * Exercise the tool's execute function directly without going through the
 * full pi extension host. We import the default export (the registration
 * function) and call it with a stub ExtensionAPI whose registerTool
 * captures the handler.
 */
function buildExtensionUnderTest() {
  let capturedExecute: Function | null = null;

  const fakeApi = {
    registerTool(def: any) {
      capturedExecute = def.execute;
    },
    on() {},
  } as any;

  // Dynamically import after vi.mock has been applied
  return import("../../ld-fetch.js").then((mod) => {
    mod.default(fakeApi);
    return {
      execute: (...args: any[]) => capturedExecute!(...args),
    };
  });
}

describe("ld_fetch tool execute", () => {
  beforeEach(() => {
    mockLdFetch.mockReset();
  });

  it("returns formatted text content on success", async () => {
    mockLdFetch.mockResolvedValue(SAMPLE_RESULT);
    const tool = await buildExtensionUnderTest();

    const result = await tool.execute("call-1", { uri: SAMPLE_RESULT.uri }, undefined, undefined, { cwd: "/tmp" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain(`Fetched <${SAMPLE_RESULT.uri}>`);
    expect(result.content[0].text).toContain("Triples:  631");
  });

  it("returns isError:true and the error message when ldFetch rejects", async () => {
    mockLdFetch.mockRejectedValue(new Error("HTTP 404: Not Found"));
    const tool = await buildExtensionUnderTest();

    const result = await tool.execute("call-2", { uri: "http://example.org/missing" }, undefined, undefined, { cwd: "/tmp" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 404: Not Found");
  });

  it("forwards the Authorization header when the authorization param is provided", async () => {
    mockLdFetch.mockResolvedValue(SAMPLE_RESULT);
    const tool = await buildExtensionUnderTest();

    await tool.execute(
      "call-3",
      { uri: SAMPLE_RESULT.uri, authorization: "Bearer secret" },
      undefined,
      undefined,
      { cwd: "/tmp" },
    );

    expect(mockLdFetch).toHaveBeenCalledWith(
      SAMPLE_RESULT.uri,
      expect.any(String),
      { Authorization: "Bearer secret" },
    );
  });

  it("passes undefined headers when authorization param is omitted", async () => {
    mockLdFetch.mockResolvedValue(SAMPLE_RESULT);
    const tool = await buildExtensionUnderTest();

    await tool.execute("call-4", { uri: SAMPLE_RESULT.uri }, undefined, undefined, { cwd: "/tmp" });

    expect(mockLdFetch).toHaveBeenCalledWith(
      SAMPLE_RESULT.uri,
      expect.any(String),
      undefined,
    );
  });
});
