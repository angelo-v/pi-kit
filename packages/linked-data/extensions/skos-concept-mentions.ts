/**
 * skos-concept-mentions extension
 *
 * Adds `#SomeConcept` autocomplete to the pi editor.  When the user types
 * a `#` token, the provider queries all SKOS concepts found in the local RDF
 * files of the repo and surfaces them as suggestions — just like the built-in
 * `@file` completion, but for knowledge-graph concepts.
 *
 * Concept list is loaded lazily on the first keystroke and cached for the
 * session.  Fuzzy-filtering keeps suggestions responsive.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  fuzzyFilter,
} from "@earendil-works/pi-tui";

import { findByExtensions, RDF_EXTENSIONS } from "./lib/find-files.js";
import { querySkosConcepts, conceptMention, formatConceptContext, type SkosConcept } from "./lib/skos-concepts.js";

const MAX_SUGGESTIONS = 20;

// ── token extraction ──────────────────────────────────────────────────────────

/**
 * Returns the partial token after `#` immediately before the cursor,
 * or `undefined` when the cursor is not inside a `#...` token.
 *
 * Matches `#` preceded by start-of-line or whitespace to avoid firing
 * inside URLs or other `#`-containing constructs.
 */
function extractConceptToken(textBeforeCursor: string): string | undefined {
  const match = textBeforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
  return match?.[1];
}

// ── suggestion filtering ──────────────────────────────────────────────────────

function toItem(concept: SkosConcept): AutocompleteItem {
  const mention = conceptMention(concept);
  const desc = [concept.description, concept.altLabels.join(", "), concept.iri].filter(Boolean).join(" · ");
  return {
    value: mention,
    label: concept.label,
    description: desc,
  };
}

function filterConcepts(concepts: SkosConcept[], query: string): AutocompleteItem[] {
  if (!query.trim()) {
    return concepts.slice(0, MAX_SUGGESTIONS).map(toItem);
  }

  return fuzzyFilter(
    concepts,
    query,
    (c) => `${c.label} ${c.altLabels.join(" ")} ${c.iri}`
  )
    .slice(0, MAX_SUGGESTIONS)
    .map(toItem);
}

// ── autocomplete provider factory ─────────────────────────────────────────────

function createConceptProvider(
  current: AutocompleteProvider,
  getConcepts: () => Promise<SkosConcept[] | undefined>,
  onConceptSelected: (concept: SkosConcept) => void,
): AutocompleteProvider {
  return {
    async getSuggestions(
      lines,
      cursorLine,
      cursorCol,
      options
    ): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const token = extractConceptToken(textBeforeCursor);

      if (token === undefined) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const concepts = await getConcepts();
      if (options.signal.aborted || !concepts || concepts.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const items = filterConcepts(concepts, token);
      if (items.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return { items, prefix: `#${token}` };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      // item.value is the mention token (e.g. "#SemanticWeb") — look up the
      // concept synchronously from the already-resolved cache and stash it.
      void getConcepts().then((concepts) => {
        const match = concepts?.find((c) => conceptMention(c) === item.value);
        if (match) onConceptSelected(match);
      });
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

// ── extension entry point ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    let conceptsPromise: Promise<SkosConcept[] | undefined> | undefined;
    let errorShown = false;
    // Concepts selected via autocomplete in the current editor buffer.
    // Cleared after each agent turn so stale mentions don't bleed across prompts.
    const pendingConcepts = new Map<string, SkosConcept>(); // keyed by IRI

    const getConcepts = async (): Promise<SkosConcept[] | undefined> => {
      conceptsPromise ??= (async () => {
        const files = findByExtensions(ctx.cwd, RDF_EXTENSIONS);

        if (files.length === 0) return undefined;

        try {
          return await querySkosConcepts(files);
        } catch (err: unknown) {
          if (!errorShown) {
            errorShown = true;
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.notify(`skos-concept-mentions: failed to load concepts: ${msg}`, "error");
          }
          return undefined;
        }
      })();
      return conceptsPromise;
    };

    // Kick off loading eagerly so the first `#` keystroke is instant
    void getConcepts();

    ctx.ui.addAutocompleteProvider((current) =>
      createConceptProvider(current, getConcepts, (concept) => {
        pendingConcepts.set(concept.iri, concept);
      })
    );

    pi.on("before_agent_start", async (_event, _ctx) => {
      if (pendingConcepts.size === 0) return;

      const contexts = [...pendingConcepts.values()].map(formatConceptContext).join("\n\n");
      pendingConcepts.clear();

      return {
        message: {
          customType: "skos-concept-mentions",
          content: `The following SKOS concepts were mentioned:\n\n${contexts}`,
          display: true,
        },
      };
    });
  });
}
