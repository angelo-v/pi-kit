import { describe, it, expect } from "vitest";
import { skillWasRead, SKILL_NAME, SKILL_CONTENT_MARKER } from "../skill-read-guard.js";
import type { BranchEntry } from "../skill-read-guard.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function userEntry(content: string): BranchEntry {
  return { type: "message", message: { role: "user", content } };
}

function toolResultEntry(content: string, isError = false): BranchEntry {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolName: "read",
      isError,
      content: [{ type: "text", text: content }],
    },
  };
}

function nonMessageEntry(): BranchEntry {
  return { type: "compaction" };
}

/** Minimal skill block as produced by pi's /skill:name expansion. */
function skillBlock(name = SKILL_NAME, location = "/some/path/SKILL.md"): string {
  return `<skill name="${name}" location="${location}">\n---\nname: ${name}\ndescription: …\n---\n# Content\n</skill>`;
}

/** SKILL.md content snippet (frontmatter only is enough for the guard). */
const skillFileContent = `---\nname: ${SKILL_NAME}\ndescription: some description\n---\n# Wikidata SPARQL Skill\n`;

// ── SKILL_CONTENT_MARKER ──────────────────────────────────────────────────────

describe("SKILL_CONTENT_MARKER", () => {
  it("contains the skill name", () => {
    expect(SKILL_CONTENT_MARKER).toContain(SKILL_NAME);
  });

  it("is present in the skill file content", () => {
    expect(skillFileContent).toContain(SKILL_CONTENT_MARKER);
  });
});

// ── skillWasRead ──────────────────────────────────────────────────────────────

describe("skillWasRead", () => {
  describe("empty / irrelevant session", () => {
    it("returns false for an empty branch", () => {
      expect(skillWasRead([])).toBe(false);
    });

    it("returns false for non-message entries only", () => {
      expect(skillWasRead([nonMessageEntry()])).toBe(false);
    });

    it("returns false for an unrelated user message", () => {
      expect(skillWasRead([userEntry("hello world")])).toBe(false);
    });

    it("returns false for a read toolResult with unrelated content", () => {
      expect(skillWasRead([toolResultEntry("some other file content")])).toBe(false);
    });

    it("returns false for a different skill's skill block", () => {
      expect(skillWasRead([userEntry(skillBlock("some-other-skill"))])).toBe(false);
    });
  });

  describe("Case 1: /skill:sparql-query-wikidata expansion in user message", () => {
    it("returns true when user message contains the skill block", () => {
      expect(skillWasRead([userEntry(skillBlock())])).toBe(true);
    });

    it("returns false when skill block is preceded by other text (parseSkillBlock requires ^ anchor)", () => {
      expect(skillWasRead([userEntry("some preamble\n" + skillBlock())])).toBe(false);
    });

    it("returns true when user message content is a string (not array)", () => {
      const entry: BranchEntry = {
        type: "message",
        message: { role: "user", content: skillBlock() },
      };
      expect(skillWasRead([entry])).toBe(true);
    });

    it("returns true when user message content is an array of text blocks", () => {
      const entry: BranchEntry = {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: skillBlock() }],
        },
      };
      expect(skillWasRead([entry])).toBe(true);
    });

    it("ignores non-text blocks in array content", () => {
      const entry: BranchEntry = {
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "image" },
            { type: "text", text: skillBlock() },
          ],
        },
      };
      expect(skillWasRead([entry])).toBe(true);
    });
  });

  describe("Case 2: read tool result containing SKILL.md content", () => {
    it("returns true when toolResult contains the skill file content", () => {
      expect(skillWasRead([toolResultEntry(skillFileContent)])).toBe(true);
    });

    it("returns true when toolResult content contains only the marker string", () => {
      expect(skillWasRead([toolResultEntry(SKILL_CONTENT_MARKER)])).toBe(true);
    });

    it("returns false when the read toolResult is an error", () => {
      expect(skillWasRead([toolResultEntry(skillFileContent, true)])).toBe(false);
    });

    it("returns false for a toolResult from a different tool", () => {
      const entry: BranchEntry = {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "bash",
          isError: false,
          content: [{ type: "text", text: skillFileContent }],
        },
      };
      expect(skillWasRead([entry])).toBe(false);
    });

    it("returns false for a read toolResult with no toolName set", () => {
      const entry: BranchEntry = {
        type: "message",
        message: {
          role: "toolResult",
          isError: false,
          content: [{ type: "text", text: skillFileContent }],
        },
      };
      expect(skillWasRead([entry])).toBe(false);
    });
  });

  describe("position in branch", () => {
    it("returns true when the skill read appears before other entries", () => {
      expect(
        skillWasRead([
          userEntry(skillBlock()),
          userEntry("another message"),
          toolResultEntry("unrelated"),
        ])
      ).toBe(true);
    });

    it("returns true when the skill read appears after other entries", () => {
      expect(
        skillWasRead([
          userEntry("some earlier message"),
          nonMessageEntry(),
          toolResultEntry(skillFileContent),
        ])
      ).toBe(true);
    });

    it("returns false when only unrelated entries are present among many", () => {
      expect(
        skillWasRead([
          userEntry("hello"),
          toolResultEntry("unrelated file content"),
          nonMessageEntry(),
          userEntry(skillBlock("wrong-skill")),
        ])
      ).toBe(false);
    });
  });
});
