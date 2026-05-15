/**
 * ADR (Architecture Decision Record) extension
 *
 * Registers two tools that together support the `adr` skill:
 *
 *   detect_adr_dir  — scans the project for existing ADR directories
 *   create_adr      — writes a new MADR-format ADR from structured parameters
 *
 * Business logic lives in `lib/adr-writer.ts` and `lib/detect-adr-dir.ts`
 * so it can be unit-tested independently of the pi extension API.
 *
 * The skill orchestrates the full workflow:
 *   1. detect_adr_dir → find existing directories
 *   2. questionnaire  → ask where to store ADRs + collect all MADR sections
 *   3. create_adr     → write the file
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { writeAdr } from "./lib/adr-writer.js";
import { detectExistingAdrDirs, ADR_CANDIDATE_DIRS } from "./lib/detect-adr-dir.js";

export default function (pi: ExtensionAPI) {
  // -------------------------------------------------------------------------
  // Tool: detect_adr_dir
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "detect_adr_dir",
    label: "Detect ADR Directory",
    description:
      "Scans the project for existing ADR directories. " +
      "Returns known locations if found, or common defaults if none exist. " +
      "Call this before asking the user where to store ADRs.",
    promptSnippet: "Scan the project for an existing ADR storage directory",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const existing = detectExistingAdrDirs(ctx.cwd);
      const defaults = [...ADR_CANDIDATE_DIRS];

      if (existing.length > 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `Found existing ADR directories:\n${existing.map((d) => `  • ${d}`).join("\n")}\n\n` +
                `Ask the user to confirm one of these or enter a custom path.`,
            },
          ],
          details: { existing, defaults },
        };
      }

      return {
        content: [
          {
            type: "text",
            text:
              `No existing ADR directory found. Common locations:\n${defaults.map((d) => `  • ${d}`).join("\n")}\n\n` +
              `Ask the user which one to use (or a custom path).`,
          },
        ],
        details: { existing: [], defaults },
      };
    },

    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("detect_adr_dir")), 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as { existing: string[] } | undefined;
      const found = details?.existing ?? [];
      const msg =
        found.length > 0
          ? theme.fg("success", `✓ Found: ${found.join(", ")}`)
          : theme.fg("muted", "No existing ADR directory");
      return new Text(msg, 0, 0);
    },
  });

  // -------------------------------------------------------------------------
  // Tool: create_adr
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "create_adr",
    label: "Create ADR",
    description:
      "Writes a new Architecture Decision Record (ADR) in MADR format to disk. " +
      "Call this after collecting all required information from the user via the questionnaire tool. " +
      "Returns the path of the created file.",
    promptSnippet: "Write a new Architecture Decision Record (ADR) file in MADR format",
    promptGuidelines: [
      "Use create_adr to write the ADR file after collecting answers from the user via questionnaire.",
      "Always use the questionnaire tool to interview the user before calling create_adr.",
    ],
    parameters: Type.Object({
      adr_dir: Type.String({
        description:
          "Directory where the ADR should be stored, relative to the project root " +
          "(e.g. 'docs/decisions'). Created if it does not exist.",
      }),
      title: Type.String({
        description: "Short noun-phrase title for the decision (e.g. 'Use PostgreSQL as primary database').",
      }),
      status: Type.String({
        description: "Decision status: 'proposed', 'accepted', 'deprecated', or 'superseded'.",
      }),
      context: Type.String({
        description: "Context and problem statement — what is the issue motivating this decision?",
      }),
      drivers: Type.Array(Type.String(), {
        description: "Decision drivers: forces, concerns, constraints, or quality goals.",
      }),
      options: Type.Array(Type.String(), {
        description: "Considered options (list of candidate solutions).",
      }),
      chosen_option: Type.String({
        description: "The chosen option (must be one of the considered options).",
      }),
      outcome_reason: Type.String({
        description: "Reason the chosen option was selected (completes 'because …').",
      }),
      good_consequences: Type.String({
        description: "Positive consequences of the decision (completes 'Good, because …').",
      }),
      bad_consequences: Type.String({
        description: "Negative consequences or trade-offs (completes 'Bad, because …').",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await writeAdr({
        adrDir:           params.adr_dir,
        title:            params.title,
        status:           params.status,
        context:          params.context,
        drivers:          params.drivers,
        options:          params.options,
        chosenOption:     params.chosen_option,
        outcomeReason:    params.outcome_reason,
        goodConsequences: params.good_consequences,
        badConsequences:  params.bad_consequences,
        cwd:              ctx.cwd,
      });

      const summary = [
        `ADR created: ${result.relPath}`,
        `  Title:  ${params.title}`,
        `  Status: ${params.status}`,
        `  Chosen: ${params.chosen_option}`,
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        details: {
          path:         result.relPath,
          absPath:      result.absPath,
          number:       result.number,
          title:        params.title,
          status:       params.status,
          chosenOption: params.chosen_option,
        },
      };
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("create_adr "));
      text += theme.fg("dim", (args.title as string | undefined) ?? "");
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as
        | { path?: string; title?: string }
        | undefined;

      if (!details?.path) {
        const t = result.content[0];
        return new Text(t?.type === "text" ? t.text : "", 0, 0);
      }

      let text = theme.fg("success", "✓ ") + theme.fg("text", details.path);
      if (details.title) {
        text += "\n  " + theme.fg("muted", details.title);
      }
      return new Text(text, 0, 0);
    },
  });
}
