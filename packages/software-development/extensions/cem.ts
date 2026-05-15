/**
 * Custom Elements Manifest (CEM) extension
 *
 * Registers three tools for querying any CEM-compliant custom-elements.json:
 *
 *   cem_list_elements   — compact list of every element (name + one-liner)
 *   cem_search_elements — keyword search returning compact results
 *   cem_get_element     — full API detail for a single element by tag name
 *
 * Every tool accepts a `manifest_url` parameter so the same tools work
 * with any component library that ships a CEM, not only Web Awesome.
 *
 * Business logic lives in `lib/cem.ts` and is unit-tested independently.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listElements, searchElements, getElement } from "./lib/cem.js";

const MANIFEST_URL_PARAM = Type.String({
  description:
    "Full HTTPS URL to a CEM-compliant custom-elements.json file. " +
    "Example: https://cdn.jsdelivr.net/npm/@awesome.me/webawesome@3.7.0/dist/custom-elements.json",
});

export default function (pi: ExtensionAPI) {
  // -------------------------------------------------------------------------
  // Tool: cem_list_elements
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "cem_list_elements",
    label: "CEM: List Elements",
    description:
      "Lists every custom element found in a Custom Elements Manifest (CEM). " +
      "Returns only tag names and one-line summaries to keep context small. " +
      "Use cem_get_element afterwards to fetch full API details for a specific element.",
    promptSnippet: "List all custom elements from a Custom Elements Manifest URL",
    promptGuidelines: [
      "Use cem_list_elements to get a compact overview of all available components before picking one.",
      "Always call cem_get_element for full attribute/slot/event details — never guess from the list alone.",
    ],
    parameters: Type.Object({
      manifest_url: MANIFEST_URL_PARAM,
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const elements = await listElements(params.manifest_url);

      if (elements.length === 0) {
        return {
          content: [{ type: "text", text: "No custom elements found in the manifest." }],
          details: { count: 0, elements: [] },
        };
      }

      const lines = elements.map((el) => `${el.tag} — ${el.summary}`);
      const text = `Found ${elements.length} element(s):\n\n${lines.join("\n")}`;

      return {
        content: [{ type: "text", text }],
        details: { count: elements.length, elements },
      };
    },
  });

  // -------------------------------------------------------------------------
  // Tool: cem_search_elements
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "cem_search_elements",
    label: "CEM: Search Elements",
    description:
      "Searches a Custom Elements Manifest for elements matching a keyword. " +
      "Matches against tag name, summary, and description (case-insensitive). " +
      "Returns compact results (tag + one-liner) — use cem_get_element for full details.",
    promptSnippet: "Search a Custom Elements Manifest by keyword",
    parameters: Type.Object({
      manifest_url: MANIFEST_URL_PARAM,
      keyword: Type.String({
        description: "Case-insensitive search term, e.g. 'dialog', 'form', 'button'.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const elements = await searchElements(params.manifest_url, params.keyword);

      if (elements.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No elements matched "${params.keyword}".`,
            },
          ],
          details: { keyword: params.keyword, count: 0, elements: [] },
        };
      }

      const lines = elements.map((el) => `${el.tag} — ${el.summary}`);
      const text =
        `${elements.length} element(s) matching "${params.keyword}":\n\n${lines.join("\n")}`;

      return {
        content: [{ type: "text", text }],
        details: { keyword: params.keyword, count: elements.length, elements },
      };
    },
  });

  // -------------------------------------------------------------------------
  // Tool: cem_get_element
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "cem_get_element",
    label: "CEM: Get Element",
    description:
      "Fetches full API details for a single custom element from a Custom Elements Manifest. " +
      "Returns attributes, own properties, events, slots, CSS custom properties, and CSS parts. " +
      "Use cem_list_elements or cem_search_elements first to find the exact tag name.",
    promptSnippet: "Fetch full API detail for one custom element from a CEM",
    parameters: Type.Object({
      manifest_url: MANIFEST_URL_PARAM,
      tag_name: Type.String({
        description: "Exact custom-element tag name, e.g. 'wa-button' or 'my-card'.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const detail = await getElement(params.manifest_url, params.tag_name);

      if (!detail) {
        return {
          content: [
            {
              type: "text",
              text: `Element "${params.tag_name}" not found in the manifest.`,
            },
          ],
          details: null,
        };
      }

      // Build a human-readable summary for the LLM context
      const lines: string[] = [];

      lines.push(`## <${detail.tag}>`);
      if (detail.status) lines.push(`Status: ${detail.status}${detail.since ? ` (since ${detail.since})` : ""}`);
      if (detail.summary) lines.push(`\n${detail.summary}`);
      if (detail.description && detail.description !== detail.summary) {
        lines.push(`\n${detail.description}`);
      }

      if (detail.attributes.length) {
        lines.push("\n### Attributes");
        for (const a of detail.attributes) {
          const def = a.default !== undefined ? ` (default: ${a.default})` : "";
          lines.push(`- **${a.name}** \`${a.type}\`${def} — ${a.description}`);
        }
      }

      if (detail.properties.length) {
        lines.push("\n### Properties");
        for (const p of detail.properties) {
          const def = p.default !== undefined ? ` (default: ${p.default})` : "";
          lines.push(`- **${p.name}** \`${p.type}\`${def} — ${p.description}`);
        }
      }

      if (detail.events.length) {
        lines.push("\n### Events");
        for (const e of detail.events) {
          lines.push(`- **${e.name}** — ${e.description}`);
        }
      }

      if (detail.slots.length) {
        lines.push("\n### Slots");
        for (const s of detail.slots) {
          lines.push(`- **${s.name}** — ${s.description}`);
        }
      }

      if (detail.cssProperties.length) {
        lines.push("\n### CSS Custom Properties");
        for (const p of detail.cssProperties) {
          const def = p.default !== undefined ? ` (default: \`${p.default}\`)` : "";
          lines.push(`- **${p.name}**${def} — ${p.description}`);
        }
      }

      if (detail.cssParts.length) {
        lines.push("\n### CSS Parts");
        for (const p of detail.cssParts) {
          lines.push(`- **${p.name}** — ${p.description}`);
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: detail,
      };
    },
  });
}
