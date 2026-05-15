/**
 * Unit tests for cem.ts
 *
 * All HTTP is injected via `FetchAdapter` — no real network calls occur.
 * The manifest URL is treated as an opaque string; the tests use a dummy
 * value to confirm it is passed through correctly.
 */

import { describe, it, expect } from "vitest";
import { listElements, searchElements, getElement } from "../cem.js";
import type { FetchAdapter, CemDeclaration } from "../cem.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DUMMY_URL = "https://example.com/custom-elements.json";

function makeDecl(overrides: Partial<CemDeclaration> & { tagName: string }): CemDeclaration {
  return {
    kind: "class",
    name: overrides.name ?? overrides.tagName,
    ...overrides,
  };
}

function makeManifest(decls: CemDeclaration[]): string {
  return JSON.stringify({
    schemaVersion: "2.0.0",
    modules: [{ kind: "javascript-module", declarations: decls }],
  });
}

function makeFetcher(json: string, expectUrl?: string): FetchAdapter {
  return {
    async fetch(url) {
      if (expectUrl) expect(url).toBe(expectUrl);
      return json;
    },
  };
}

// Full fixture with a realistic element for detail tests
const BUTTON_DECL = makeDecl({
  tagName: "x-button",
  name: "XButton",
  summary: "A clickable button.",
  description: "Longer description of the button.",
  status: "stable",
  since: "1.0.0",
  attributes: [
    { name: "variant", type: { text: "string" }, default: "default", description: "Visual variant." },
    { name: "disabled", type: { text: "boolean" }, description: "Disables the button." },
  ],
  members: [
    // own field
    { kind: "field", name: "value", type: { text: "string" }, description: "Current value." },
    // static — should be excluded
    { kind: "field", name: "styles", type: { text: "CSSResult" }, static: true, description: "Styles." },
    // inherited — should be excluded
    { kind: "field", name: "inherited", inheritedFrom: { name: "BaseEl" }, description: "Inherited." },
    // method — should be excluded
    { kind: "method", name: "click", description: "Clicks the button." },
  ],
  events: [{ name: "x-click", description: "Emitted on click." }],
  slots: [
    { name: "", description: "Default slot for label." },
    { name: "icon", description: "Leading icon." },
  ],
  cssProperties: [{ name: "--x-button-color", default: "blue", description: "Button colour." }],
  cssParts: [{ name: "base", description: "Base wrapper." }],
});

const CARD_DECL = makeDecl({
  tagName: "x-card",
  name: "XCard",
  summary: "A card container for grouping content.",
});

const MANIFEST_TWO = makeManifest([BUTTON_DECL, CARD_DECL]);

// ── listElements ──────────────────────────────────────────────────────────────

describe("listElements", () => {
  it("returns one row per custom element", async () => {
    const result = await listElements(DUMMY_URL, makeFetcher(MANIFEST_TWO));
    expect(result).toHaveLength(2);
    expect(result[0].tag).toBe("x-button");
    expect(result[1].tag).toBe("x-card");
  });

  it("uses the summary field for the one-liner", async () => {
    const result = await listElements(DUMMY_URL, makeFetcher(MANIFEST_TWO));
    expect(result[0].summary).toBe("A clickable button.");
  });

  it("falls back to description when summary is absent", async () => {
    const decl = makeDecl({ tagName: "x-no-summary", description: "No summary here." });
    const json = makeManifest([decl]);
    const [row] = await listElements(DUMMY_URL, makeFetcher(json));
    expect(row.summary).toBe("No summary here.");
  });

  it("truncates summaries longer than 120 characters", async () => {
    const long = "A".repeat(200);
    const decl = makeDecl({ tagName: "x-long", summary: long });
    const json = makeManifest([decl]);
    const [row] = await listElements(DUMMY_URL, makeFetcher(json));
    // 117 chars of content + the single '…' character = 118
    expect(row.summary.length).toBe(118);
    expect(row.summary.endsWith("…")).toBe(true);
  });

  it("skips declarations without a tagName", async () => {
    const fn: CemDeclaration = { kind: "function", name: "helper" };
    const json = makeManifest([fn, BUTTON_DECL]);
    const result = await listElements(DUMMY_URL, makeFetcher(json));
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe("x-button");
  });

  it("returns an empty array for an empty manifest", async () => {
    const json = makeManifest([]);
    const result = await listElements(DUMMY_URL, makeFetcher(json));
    expect(result).toHaveLength(0);
  });

  it("passes the manifest URL to the fetch adapter", async () => {
    const url = "https://other.example.com/cem.json";
    await listElements(url, makeFetcher(MANIFEST_TWO, url));
  });
});

// ── searchElements ────────────────────────────────────────────────────────────

describe("searchElements", () => {
  it("matches by tag name", async () => {
    const result = await searchElements(DUMMY_URL, "card", makeFetcher(MANIFEST_TWO));
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe("x-card");
  });

  it("matches by summary text", async () => {
    const result = await searchElements(DUMMY_URL, "clickable", makeFetcher(MANIFEST_TWO));
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe("x-button");
  });

  it("matches by description text", async () => {
    const decl = makeDecl({
      tagName: "x-desc-only",
      description: "A component with unique frobnicator support.",
    });
    const json = makeManifest([decl]);
    const result = await searchElements(DUMMY_URL, "frobnicator", makeFetcher(json));
    expect(result).toHaveLength(1);
  });

  it("is case-insensitive", async () => {
    const result = await searchElements(DUMMY_URL, "CARD", makeFetcher(MANIFEST_TWO));
    expect(result).toHaveLength(1);
  });

  it("returns multiple matches", async () => {
    // Both decls have "x-" in their tag name
    const result = await searchElements(DUMMY_URL, "x-", makeFetcher(MANIFEST_TWO));
    expect(result).toHaveLength(2);
  });

  it("returns an empty array when nothing matches", async () => {
    const result = await searchElements(DUMMY_URL, "zzznomatch", makeFetcher(MANIFEST_TWO));
    expect(result).toHaveLength(0);
  });

  it("returns compact summaries only (no attributes/events/etc.)", async () => {
    const result = await searchElements(DUMMY_URL, "button", makeFetcher(MANIFEST_TWO));
    expect(result[0]).not.toHaveProperty("attributes");
    expect(result[0]).toHaveProperty("tag");
    expect(result[0]).toHaveProperty("summary");
  });
});

// ── getElement ────────────────────────────────────────────────────────────────

describe("getElement", () => {
  it("returns null for an unknown tag", async () => {
    const result = await getElement(DUMMY_URL, "x-unknown", makeFetcher(MANIFEST_TWO));
    expect(result).toBeNull();
  });

  it("returns detail for a known tag", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    expect(result).not.toBeNull();
    expect(result!.tag).toBe("x-button");
    expect(result!.name).toBe("XButton");
  });

  it("includes summary, description, status, and since", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    expect(result!.summary).toBe("A clickable button.");
    expect(result!.description).toBe("Longer description of the button.");
    expect(result!.status).toBe("stable");
    expect(result!.since).toBe("1.0.0");
  });

  it("maps attributes correctly", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    expect(result!.attributes).toHaveLength(2);
    const variant = result!.attributes.find((a) => a.name === "variant")!;
    expect(variant.type).toBe("string");
    expect(variant.default).toBe("default");
    expect(variant.description).toBe("Visual variant.");
  });

  it("includes only own non-static fields as properties", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    // Only 'value' should appear (not styles/inherited/click)
    expect(result!.properties).toHaveLength(1);
    expect(result!.properties[0].name).toBe("value");
  });

  it("maps events correctly", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    expect(result!.events).toHaveLength(1);
    expect(result!.events[0].name).toBe("x-click");
  });

  it("maps slots and uses '(default)' for the empty-string slot name", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    expect(result!.slots).toHaveLength(2);
    const defaultSlot = result!.slots.find((s) => s.name === "(default)")!;
    expect(defaultSlot.description).toBe("Default slot for label.");
  });

  it("maps CSS custom properties correctly", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    expect(result!.cssProperties).toHaveLength(1);
    expect(result!.cssProperties[0].name).toBe("--x-button-color");
    expect(result!.cssProperties[0].default).toBe("blue");
  });

  it("maps CSS parts correctly", async () => {
    const result = await getElement(DUMMY_URL, "x-button", makeFetcher(MANIFEST_TWO));
    expect(result!.cssParts).toHaveLength(1);
    expect(result!.cssParts[0].name).toBe("base");
  });

  it("returns empty arrays when sections are absent", async () => {
    const result = await getElement(DUMMY_URL, "x-card", makeFetcher(MANIFEST_TWO));
    expect(result!.attributes).toEqual([]);
    expect(result!.properties).toEqual([]);
    expect(result!.events).toEqual([]);
    expect(result!.slots).toEqual([]);
    expect(result!.cssProperties).toEqual([]);
    expect(result!.cssParts).toEqual([]);
  });

  it("passes the manifest URL to the fetch adapter", async () => {
    const url = "https://other.example.com/cem.json";
    await getElement(url, "x-button", makeFetcher(MANIFEST_TWO, url));
  });
});
