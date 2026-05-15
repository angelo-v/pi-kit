/**
 * Wikidata Entity Search helper.
 *
 * Wraps the Wikidata MediaWiki API `wbsearchentities` action:
 *   GET https://www.wikidata.org/w/api.php?action=wbsearchentities&...
 *
 * Kept as a plain lib module (no ExtensionAPI / framework imports) so it can
 * be unit-tested without pulling in the pi extension runtime.
 */

export type SearchType = "item" | "property";

export interface SearchHit {
  id: string;
  label: string;
  description: string;
}

export interface SearchResult {
  hits: SearchHit[];
  /** Human-readable table formatted for the LLM. */
  table: string;
}

/** The Wikidata API base URL — injectable for tests. */
export const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";

/**
 * Injectable fetch adapter so tests never touch the real network.
 */
export type FetchFn = (
  url: string
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * Search Wikidata entities or properties by free-text label.
 *
 * @param term    The search term (free text).
 * @param type    "item" (Q-IDs) or "property" (P-IDs). Defaults to "item".
 * @param lang    BCP-47 language code for labels / descriptions. Defaults to "en".
 * @param limit   Maximum number of results (1–50). Defaults to 10.
 * @param fetchFn Injectable fetch adapter. Defaults to global `fetch`.
 * @param apiUrl  Base URL for the Wikidata API. Defaults to WIKIDATA_API_URL.
 */
export async function searchWikidata(
  term: string,
  type: SearchType = "item",
  lang = "en",
  limit = 10,
  fetchFn: FetchFn = fetch as FetchFn,
  apiUrl = WIKIDATA_API_URL
): Promise<SearchResult> {
  const clampedLimit = Math.max(1, Math.min(50, limit));

  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: term,
    type,
    language: lang,
    uselang: lang,
    limit: String(clampedLimit),
    format: "json",
    origin: "*",
  });

  const url = `${apiUrl}?${params}`;

  let body: string;
  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    body = await response.text();
  } catch (err: any) {
    throw new Error(`Wikidata API request failed: ${err.message}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Wikidata API returned invalid JSON");
  }

  if (parsed.error) {
    throw new Error(
      `Wikidata API error: ${parsed.error.info ?? parsed.error.code}`
    );
  }

  const raw: any[] = parsed.search ?? [];

  const hits: SearchHit[] = raw.map((entry) => ({
    id: entry.id ?? "",
    label: entry.label ?? "",
    description: entry.description ?? "",
  }));

  return { hits, table: formatTable(hits) };
}

/**
 * Format search hits as a plain-text table suitable for the LLM.
 *
 * Example:
 *   id       label      description
 *   ──────── ────────── ────────────────────────────────────────
 *   Q64      Berlin     capital and largest city of Germany
 *   Q1726    Munich     state capital of Bavaria, Germany
 */
export function formatTable(hits: SearchHit[]): string {
  if (hits.length === 0) return "(no results)";

  const colId = Math.max(2, ...hits.map((h) => h.id.length));
  const colLabel = Math.max(5, ...hits.map((h) => h.label.length));

  const header =
    pad("id", colId) + "  " + pad("label", colLabel) + "  " + "description";
  const divider =
    "─".repeat(colId) +
    "  " +
    "─".repeat(colLabel) +
    "  " +
    "─".repeat(40);

  const rows = hits.map(
    (h) =>
      pad(h.id, colId) + "  " + pad(h.label, colLabel) + "  " + h.description
  );

  return [header, divider, ...rows].join("\n");
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
