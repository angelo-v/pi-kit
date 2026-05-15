/**
 * Custom Elements Manifest (CEM) client.
 *
 * Generic — works with any CEM-compliant manifest URL, not tied to a specific
 * component library.  Exposes three operations:
 *
 *   - listElements   — compact list (tag name + one-line summary) of all elements
 *   - searchElements — filter by keyword against tag name, summary, and description
 *   - getElement     — full detail for a single element by tag name
 *
 * All network I/O is injected via `FetchAdapter` so the module is unit-testable
 * without real HTTP calls.
 *
 * The manifest URL is a plain parameter on every public function; there is no
 * hardcoded default library.  Callers (e.g. the pi tool entry-point) receive
 * the URL from the LLM at call time.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** Minimal shape of a custom-element declaration inside the CEM. */
export interface CemDeclaration {
  kind: string;
  name: string;
  tagName?: string;
  summary?: string;
  description?: string;
  status?: string;
  since?: string;
  attributes?: CemAttribute[];
  members?: CemMember[];
  events?: CemEvent[];
  slots?: CemSlot[];
  cssProperties?: CemCssProperty[];
  cssParts?: CemCssPart[];
}

export interface CemAttribute {
  name: string;
  description?: string;
  type?: { text: string };
  default?: string;
}

export interface CemMember {
  kind: string;
  name: string;
  description?: string;
  type?: { text: string };
  default?: string;
  static?: boolean;
  inheritedFrom?: { name: string };
}

export interface CemEvent {
  name: string;
  description?: string;
}

export interface CemSlot {
  name: string;
  description?: string;
}

export interface CemCssProperty {
  name: string;
  description?: string;
  default?: string;
}

export interface CemCssPart {
  name: string;
  description?: string;
}

interface CemModule {
  kind: string;
  declarations?: CemDeclaration[];
}

interface CemManifest {
  modules: CemModule[];
}

// ── Public result types ────────────────────────────────────────────────────────

/** One row in the compact element listing. */
export interface ElementSummary {
  tag: string;
  summary: string;
}

/** Full detail for a single element. */
export interface ElementDetail {
  tag: string;
  name: string;
  summary: string;
  description: string;
  status?: string;
  since?: string;
  attributes: Array<{ name: string; type: string; default?: string; description: string }>;
  properties: Array<{ name: string; type: string; default?: string; description: string }>;
  events: Array<{ name: string; description: string }>;
  slots: Array<{ name: string; description: string }>;
  cssProperties: Array<{ name: string; default?: string; description: string }>;
  cssParts: Array<{ name: string; description: string }>;
}

// ── Injectable adapter ─────────────────────────────────────────────────────────

export interface FetchAdapter {
  fetch(url: string): Promise<string>;
}

export const defaultFetch: FetchAdapter = {
  async fetch(url: string): Promise<string> {
    const res = await globalThis.fetch(url);
    if (!res.ok) throw new Error(`CEM fetch failed: ${res.status} ${res.statusText}`);
    return res.text();
  },
};

// ── Internal helpers ───────────────────────────────────────────────────────────

function extractElements(manifest: CemManifest): CemDeclaration[] {
  const elements: CemDeclaration[] = [];
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName) elements.push(decl);
    }
  }
  return elements;
}

function oneLiner(decl: CemDeclaration): string {
  const raw = decl.summary ?? decl.description ?? "";
  // Take just the first sentence / line and cap at 120 chars
  const first = raw.split(/\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  return first.length > 120 ? first.slice(0, 117) + "…" : first;
}

function toDetail(decl: CemDeclaration): ElementDetail {
  // Members that are NOT inherited and NOT static are "own" properties
  const ownMembers = (decl.members ?? []).filter(
    (m) => m.kind === "field" && !m.static && !m.inheritedFrom,
  );

  return {
    tag: decl.tagName!,
    name: decl.name,
    summary: decl.summary?.trim() ?? "",
    description: decl.description?.trim() ?? "",
    status: decl.status,
    since: decl.since,
    attributes: (decl.attributes ?? []).map((a) => ({
      name: a.name,
      type: a.type?.text ?? "string",
      default: a.default,
      description: a.description ?? "",
    })),
    properties: ownMembers.map((m) => ({
      name: m.name,
      type: m.type?.text ?? "unknown",
      default: m.default,
      description: m.description ?? "",
    })),
    events: (decl.events ?? []).map((e) => ({
      name: e.name,
      description: e.description ?? "",
    })),
    slots: (decl.slots ?? []).map((s) => ({
      name: s.name || "(default)",
      description: s.description ?? "",
    })),
    cssProperties: (decl.cssProperties ?? []).map((p) => ({
      name: p.name,
      default: p.default,
      description: p.description ?? "",
    })),
    cssParts: (decl.cssParts ?? []).map((p) => ({
      name: p.name,
      description: p.description ?? "",
    })),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns a compact list of all custom elements: tag + one-line summary.
 * Intentionally small to avoid bloating the LLM context.
 *
 * @param url     Full URL (or local file path prefixed with `file://`) to a
 *                CEM-compliant `custom-elements.json`.
 * @param fetcher Injectable fetch adapter; defaults to `globalThis.fetch`.
 */
export async function listElements(
  url: string,
  fetcher: FetchAdapter = defaultFetch,
): Promise<ElementSummary[]> {
  const json = await fetcher.fetch(url);
  const manifest: CemManifest = JSON.parse(json);
  return extractElements(manifest).map((decl) => ({
    tag: decl.tagName!,
    summary: oneLiner(decl),
  }));
}

/**
 * Searches elements by keyword.  Matches against tag name, summary, and
 * description (case-insensitive).  Returns compact summaries only.
 *
 * @param url     Full URL to a CEM-compliant `custom-elements.json`.
 * @param keyword Case-insensitive search term.
 * @param fetcher Injectable fetch adapter; defaults to `globalThis.fetch`.
 */
export async function searchElements(
  url: string,
  keyword: string,
  fetcher: FetchAdapter = defaultFetch,
): Promise<ElementSummary[]> {
  const json = await fetcher.fetch(url);
  const manifest: CemManifest = JSON.parse(json);
  const kw = keyword.toLowerCase();
  return extractElements(manifest)
    .filter((decl) => {
      const hay = [decl.tagName, decl.summary, decl.description]
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    })
    .map((decl) => ({ tag: decl.tagName!, summary: oneLiner(decl) }));
}

/**
 * Returns full detail for a single element by exact tag name.
 * Returns `null` when the tag is not found in the manifest.
 *
 * @param url     Full URL to a CEM-compliant `custom-elements.json`.
 * @param tagName Exact custom-element tag name (e.g. `"wa-button"`, `"my-card"`).
 * @param fetcher Injectable fetch adapter; defaults to `globalThis.fetch`.
 */
export async function getElement(
  url: string,
  tagName: string,
  fetcher: FetchAdapter = defaultFetch,
): Promise<ElementDetail | null> {
  const json = await fetcher.fetch(url);
  const manifest: CemManifest = JSON.parse(json);
  const decl = extractElements(manifest).find(
    (d) => d.tagName === tagName,
  );
  return decl ? toDetail(decl) : null;
}
