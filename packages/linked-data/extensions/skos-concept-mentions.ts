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
import { querySkosConcepts, conceptMention, type SkosConcept } from "./lib/skos-concepts.js";

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
  const desc = [concept.description, concept.altLabels.join(", ")].filter(Boolean).join(" · ");
  return {
    value: mention,
    label: mention,
    description: desc || concept.iri,
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
  getConcepts: () => Promise<SkosConcept[] | undefined>
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
      createConceptProvider(current, getConcepts)
    );
  });
}
