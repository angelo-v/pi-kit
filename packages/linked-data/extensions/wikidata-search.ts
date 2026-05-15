/**
 * wikidata-search extension
 *
 * Registers the `wikidata_search` tool, which lets the LLM resolve
 * free-text terms to Wikidata Q-IDs (items) or P-IDs (properties) before
 * writing a SPARQL query.
 *
 * Uses the Wikidata MediaWiki API `wbsearchentities` action — not SPARQL —
 * so it is fast, targeted, and doesn't consume a SPARQL round-trip just for
 * a label lookup.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { searchWikidata } from "./lib/wikidata-search.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "wikidata_search",
    label: "Wikidata Search",
    description:
      "Search Wikidata for items (Q-IDs) or properties (P-IDs) by free-text label. " +
      "Returns a table of matching id, label, and description. " +
      "Use this tool to resolve entity names to Q/P numbers before writing a SPARQL query " +
      "instead of guessing IDs from training knowledge.",
    promptSnippet: "Resolve a free-text term to Wikidata Q/P IDs before querying",
    promptGuidelines: [
      "Use wikidata_search to resolve entity or property names to Q/P IDs before calling sparql_query_wikidata — never guess Q or P numbers from training knowledge.",
      "Pass type='property' to wikidata_search when looking up a predicate (e.g. 'instance of', 'country', 'date of birth').",
    ],
    parameters: Type.Object({
      term: Type.String({
        description: "Free-text search term, e.g. 'Berlin', 'instance of', 'Marie Curie'.",
      }),
      type: Type.Optional(
        StringEnum(["item", "property"] as const, {
          description:
            "Whether to search items (Q-IDs, default) or properties (P-IDs). " +
            "Use 'property' when looking up a predicate.",
          default: "item",
        })
      ),
      lang: Type.Optional(
        Type.String({
          description:
            "BCP-47 language code for labels and descriptions (default: 'en').",
          default: "en",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const type = params.type ?? "item";
      const lang = params.lang ?? "en";

      let result: Awaited<ReturnType<typeof searchWikidata>>;
      try {
        result = await searchWikidata(params.term, type, lang);
      } catch (err: any) {
        throw new Error(`wikidata_search failed: ${err.message}`);
      }

      return {
        content: [{ type: "text", text: result.table }],
        details: { hits: result.hits },
      };
    },
  });
}
