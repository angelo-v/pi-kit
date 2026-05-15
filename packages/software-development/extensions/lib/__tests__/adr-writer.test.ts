/**
 * Unit tests for adr-writer.ts
 *
 * The filesystem is injected via `FsAdapter` so no real files are touched.
 * Pure helpers (zeroPad, slugify, nextAdrNumber, …) are exercised directly.
 */

import { vi, describe, it, expect } from "vitest";
import {
  zeroPad,
  slugify,
  nextAdrNumber,
  buildOptionsList,
  buildOptionsAnalysis,
  buildDriversList,
  renderTemplate,
  writeAdr,
  MADR_TEMPLATE,
} from "../adr-writer.js";
import type { FsAdapter } from "../adr-writer.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFakeFs(existingFiles: string[] = []): FsAdapter {
  return {
    mkdir:     vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir:   vi.fn().mockResolvedValue(existingFiles),
  };
}

const MINIMAL_OPTIONS = {
  adrDir:           "docs/decisions",
  title:            "Use PostgreSQL",
  status:           "accepted",
  context:          "We need a reliable database.",
  drivers:          ["performance", "ACID compliance"],
  options:          ["PostgreSQL", "MySQL", "SQLite"],
  chosenOption:     "PostgreSQL",
  outcomeReason:    "it has the best feature set for our needs",
  goodConsequences: "strong consistency guarantees",
  badConsequences:  "operational overhead",
  cwd:              "/workspace",
};

// ── zeroPad ───────────────────────────────────────────────────────────────────

describe("zeroPad", () => {
  it("pads a single-digit number to 4 characters", () => {
    expect(zeroPad(1)).toBe("0001");
  });

  it("pads a two-digit number to 4 characters", () => {
    expect(zeroPad(42)).toBe("0042");
  });

  it("does not truncate a number that fills the width exactly", () => {
    expect(zeroPad(1234)).toBe("1234");
  });

  it("does not truncate a number that exceeds the default width", () => {
    expect(zeroPad(12345)).toBe("12345");
  });

  it("respects a custom width", () => {
    expect(zeroPad(7, 2)).toBe("07");
  });
});

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("converts spaces to hyphens", () => {
    expect(slugify("Use PostgreSQL")).toBe("use-postgresql");
  });

  it("lowercases all characters", () => {
    expect(slugify("Use REST API")).toBe("use-rest-api");
  });

  it("strips special characters", () => {
    expect(slugify("Use (PostgreSQL) as DB!")).toBe("use-postgresql-as-db");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(slugify("foo  bar")).toBe("foo-bar");
  });

  it("collapses multiple hyphens into one", () => {
    expect(slugify("foo--bar")).toBe("foo-bar");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugify("  trim me  ")).toBe("trim-me");
  });

  it("returns an empty string for an all-special input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

// ── nextAdrNumber ─────────────────────────────────────────────────────────────

describe("nextAdrNumber", () => {
  it("returns 1 when the directory is empty", () => {
    expect(nextAdrNumber([])).toBe(1);
  });

  it("returns max + 1 for a single numbered file", () => {
    expect(nextAdrNumber(["0003-some-decision.md"])).toBe(4);
  });

  it("ignores files that do not start with a number", () => {
    expect(nextAdrNumber(["README.md", "template.md"])).toBe(1);
  });

  it("finds the highest number when multiple ADRs exist", () => {
    expect(
      nextAdrNumber(["0001-foo.md", "0005-bar.md", "0003-baz.md"])
    ).toBe(6);
  });

  it("handles multi-digit sequence numbers", () => {
    expect(nextAdrNumber(["0010-foo.md"])).toBe(11);
  });

  it("ignores non-ADR files mixed with ADR files", () => {
    expect(
      nextAdrNumber(["0002-decision.md", "README.md", ".gitkeep"])
    ).toBe(3);
  });
});

// ── buildOptionsList ──────────────────────────────────────────────────────────

describe("buildOptionsList", () => {
  it("renders each option as a bullet point", () => {
    const result = buildOptionsList(["Option A", "Option B"]);
    expect(result).toBe("* Option A\n* Option B");
  });

  it("returns a placeholder for an empty list", () => {
    expect(buildOptionsList([])).toBe("* …");
  });

  it("handles a single option", () => {
    expect(buildOptionsList(["Only one"])).toBe("* Only one");
  });
});

// ── buildDriversList ──────────────────────────────────────────────────────────

describe("buildDriversList", () => {
  it("renders each driver as a bullet point", () => {
    const result = buildDriversList(["performance", "cost"]);
    expect(result).toBe("* performance\n* cost");
  });

  it("returns a placeholder for an empty list", () => {
    expect(buildDriversList([])).toBe("* …");
  });
});

// ── buildOptionsAnalysis ──────────────────────────────────────────────────────

describe("buildOptionsAnalysis", () => {
  it("creates a section heading for each option", () => {
    const result = buildOptionsAnalysis(["PostgreSQL", "MySQL"]);
    expect(result).toContain("### PostgreSQL");
    expect(result).toContain("### MySQL");
  });

  it("includes pro/con scaffolding for each option", () => {
    const result = buildOptionsAnalysis(["PostgreSQL"]);
    expect(result).toContain("* Good, because");
    expect(result).toContain("* Bad, because");
  });

  it("returns an empty string for no options", () => {
    expect(buildOptionsAnalysis([])).toBe("");
  });
});

// ── renderTemplate ────────────────────────────────────────────────────────────

describe("renderTemplate", () => {
  const values = {
    title:            "Use PostgreSQL",
    status:           "accepted",
    context:          "We need a DB.",
    drivers:          "* performance",
    optionsList:      "* PostgreSQL",
    chosenOption:     "PostgreSQL",
    outcomeReason:    "it fits our needs",
    goodConsequences: "strong consistency",
    badConsequences:  "operational overhead",
    optionsAnalysis:  "### PostgreSQL\n\n* Good, because …\n* Bad, because …\n",
  };

  it("replaces the title placeholder", () => {
    expect(renderTemplate(MADR_TEMPLATE, values)).toContain("# Use PostgreSQL");
  });

  it("replaces the status placeholder", () => {
    expect(renderTemplate(MADR_TEMPLATE, values)).toContain("accepted");
  });

  it("replaces the chosen_option placeholder", () => {
    expect(renderTemplate(MADR_TEMPLATE, values)).toContain('"PostgreSQL"');
  });

  it("replaces the outcome_reason placeholder", () => {
    expect(renderTemplate(MADR_TEMPLATE, values)).toContain("it fits our needs");
  });

  it("replaces good_consequences", () => {
    expect(renderTemplate(MADR_TEMPLATE, values)).toContain("strong consistency");
  });

  it("replaces bad_consequences", () => {
    expect(renderTemplate(MADR_TEMPLATE, values)).toContain("operational overhead");
  });

  it("leaves no unreplaced placeholders in the output", () => {
    const result = renderTemplate(MADR_TEMPLATE, values);
    expect(result).not.toMatch(/\{[a-z_]+\}/);
  });
});

// ── writeAdr: filename generation ─────────────────────────────────────────────

describe("writeAdr: filename generation", () => {
  it("uses a zero-padded sequence number in the filename", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(result.filename).toMatch(/^\d{4}-/);
  });

  it("starts at 0001 for an empty directory", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(result.filename).toMatch(/^0001-/);
  });

  it("increments past the highest existing number", async () => {
    const fs = makeFakeFs(["0005-previous.md"]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(result.filename).toMatch(/^0006-/);
  });

  it("slugifies the title into the filename", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr({ ...MINIMAL_OPTIONS, title: "Use PostgreSQL as DB" }, fs);
    expect(result.filename).toContain("use-postgresql-as-db");
  });

  it("has a .md extension", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(result.filename).toMatch(/\.md$/);
  });
});

// ── writeAdr: path resolution ─────────────────────────────────────────────────

describe("writeAdr: path resolution", () => {
  it("resolves adrDir against cwd into an absolute absPath", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(result.absPath).toMatch(/^\/workspace\/docs\/decisions\//);
  });

  it("includes the relative adrDir in relPath", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(result.relPath).toMatch(/^docs\/decisions\//);
  });

  it("returns the sequence number as a plain integer", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(result.number).toBe(1);
  });
});

// ── writeAdr: filesystem interactions ────────────────────────────────────────

describe("writeAdr: filesystem interactions", () => {
  it("calls mkdir with recursive: true before writing", async () => {
    const fs = makeFakeFs([]);
    await writeAdr(MINIMAL_OPTIONS, fs);
    expect(fs.mkdir).toHaveBeenCalledWith(
      "/workspace/docs/decisions",
      { recursive: true }
    );
  });

  it("calls writeFile with the resolved absolute path", async () => {
    const fs = makeFakeFs([]);
    const result = await writeAdr(MINIMAL_OPTIONS, fs);
    expect(fs.writeFile).toHaveBeenCalledWith(
      result.absPath,
      expect.any(String),
      "utf8"
    );
  });

  it("writes non-empty content", async () => {
    const fs = makeFakeFs([]);
    await writeAdr(MINIMAL_OPTIONS, fs);
    const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
    expect((content as string).trim().length).toBeGreaterThan(0);
  });

  it("creates the directory before writing the file", async () => {
    const fs = makeFakeFs([]);
    const order: string[] = [];
    vi.mocked(fs.mkdir).mockImplementation(async () => { order.push("mkdir"); });
    vi.mocked(fs.writeFile).mockImplementation(async () => { order.push("writeFile"); });

    await writeAdr(MINIMAL_OPTIONS, fs);

    expect(order.indexOf("mkdir")).toBeLessThan(order.indexOf("writeFile"));
  });

  it("propagates writeFile errors", async () => {
    const fs = makeFakeFs([]);
    vi.mocked(fs.writeFile).mockRejectedValue(new Error("ENOSPC: disk full"));

    await expect(writeAdr(MINIMAL_OPTIONS, fs)).rejects.toThrow("ENOSPC: disk full");
  });
});

// ── writeAdr: content correctness ────────────────────────────────────────────

describe("writeAdr: content correctness", () => {
  async function getWrittenContent(overrides: Partial<typeof MINIMAL_OPTIONS> = {}): Promise<string> {
    const fs = makeFakeFs([]);
    await writeAdr({ ...MINIMAL_OPTIONS, ...overrides }, fs);
    return vi.mocked(fs.writeFile).mock.calls[0][1] as string;
  }

  it("includes the title as an H1 heading", async () => {
    const content = await getWrittenContent();
    expect(content).toContain("# Use PostgreSQL");
  });

  it("includes the status", async () => {
    const content = await getWrittenContent({ status: "proposed" });
    expect(content).toContain("proposed");
  });

  it("includes the context text", async () => {
    const content = await getWrittenContent();
    expect(content).toContain("We need a reliable database.");
  });

  it("includes each driver as a bullet", async () => {
    const content = await getWrittenContent();
    expect(content).toContain("* performance");
    expect(content).toContain("* ACID compliance");
  });

  it("includes each option as a bullet", async () => {
    const content = await getWrittenContent();
    expect(content).toContain("* PostgreSQL");
    expect(content).toContain("* MySQL");
    expect(content).toContain("* SQLite");
  });

  it("includes the chosen option in the decision outcome", async () => {
    const content = await getWrittenContent();
    expect(content).toContain('"PostgreSQL"');
  });

  it("includes the outcome reason", async () => {
    const content = await getWrittenContent();
    expect(content).toContain("it has the best feature set for our needs");
  });

  it("includes good consequences", async () => {
    const content = await getWrittenContent();
    expect(content).toContain("strong consistency guarantees");
  });

  it("includes bad consequences", async () => {
    const content = await getWrittenContent();
    expect(content).toContain("operational overhead");
  });

  it("contains no unreplaced template placeholders", async () => {
    const content = await getWrittenContent();
    expect(content).not.toMatch(/\{[a-z_]+\}/);
  });

  it("uses placeholder bullet when drivers list is empty", async () => {
    const content = await getWrittenContent({ drivers: [] });
    expect(content).toContain("* …");
  });

  it("uses placeholder bullet when options list is empty", async () => {
    const content = await getWrittenContent({ options: [] });
    expect(content).toContain("* …");
  });
});
