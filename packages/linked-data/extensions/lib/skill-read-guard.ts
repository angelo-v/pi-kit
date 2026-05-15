/**
 * Guard that checks whether the sparql-query-wikidata skill has been read in
 * the current session before allowing a call to sparql_query_wikidata.
 *
 * Kept as a plain lib module (no ExtensionAPI / framework imports) so it can
 * be unit-tested without pulling in the pi extension runtime.
 */

import { parseSkillBlock } from "@earendil-works/pi-coding-agent";

/** Skill name as declared in SKILL.md frontmatter. */
export const SKILL_NAME = "sparql-query-wikidata";

/**
 * Marker string present in the SKILL.md content.
 * Used to recognise a read-tool result that contains the skill file.
 */
export const SKILL_CONTENT_MARKER = `name: ${SKILL_NAME}`;

/**
 * Minimal shape of a session branch entry required by skillWasRead.
 * Mirrors the subset of SessionEntry / AgentMessage used by the check,
 * without importing the full pi type hierarchy.
 */
export interface BranchEntry {
  type: string;
  message?: {
    role: string;
    toolName?: string;
    isError?: boolean;
    content:
      | string
      | Array<{ type: string; text?: string }>;
  };
}

/**
 * Returns true if the session branch shows the Wikidata skill has been read.
 *
 * Two cases are handled:
 *  1. `/skill:sparql-query-wikidata` expansion — skill block present in a
 *     user message, detected via parseSkillBlock.
 *  2. `read` tool called on the SKILL.md file — detected by the presence of
 *     the frontmatter name marker in the toolResult content (toolResult
 *     entries do not carry an input field; only the paired assistant toolCall
 *     does, so we match on content instead).
 */
export function skillWasRead(branch: Iterable<BranchEntry>): boolean {
  for (const entry of branch) {
    if (entry.type !== "message" || !entry.message) continue;
    const { message } = entry;

    // Case 1: /skill:name expansion → skill block in user message
    if (message.role === "user") {
      const text = messageText(message.content);
      if (parseSkillBlock(text)?.name === SKILL_NAME) return true;
    }

    // Case 2: read tool result containing the SKILL.md content
    if (
      message.role === "toolResult" &&
      message.toolName === "read" &&
      !message.isError
    ) {
      if (messageText(message.content).includes(SKILL_CONTENT_MARKER)) return true;
    }
  }
  return false;
}

function messageText(
  content: string | Array<{ type: string; text?: string }>
): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
