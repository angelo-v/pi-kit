/**
 * Core ADR-writing logic.
 *
 * All I/O is injected via `FsAdapter` so the function can be unit-tested
 * without touching the real filesystem.
 */

import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";

// ---------------------------------------------------------------------------
// MADR template
// ---------------------------------------------------------------------------

export const MADR_TEMPLATE = `# {title}

## Status

{status}

## Context and Problem Statement

{context}

## Decision Drivers

{drivers}

## Considered Options

{options_list}

## Decision Outcome

Chosen option: "{chosen_option}", because {outcome_reason}.

### Consequences

* Good, because {good_consequences}
* Bad, because {bad_consequences}

## Pros and Cons of the Options

{options_analysis}
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteAdrOptions {
  /** Directory to store the ADR (absolute or relative to `cwd`). */
  adrDir: string;
  title: string;
  status: string;
  context: string;
  drivers: string[];
  options: string[];
  chosenOption: string;
  outcomeReason: string;
  goodConsequences: string;
  badConsequences: string;
  /** Working directory for resolving a relative `adrDir`. Defaults to `process.cwd()`. */
  cwd?: string;
}

export interface WriteAdrResult {
  /** Absolute path of the written file. */
  absPath: string;
  /** Path relative to `cwd`. */
  relPath: string;
  /** Zero-padded sequence number (e.g. 3 → "0003"). */
  number: number;
  /** File name only (e.g. "0003-use-postgresql.md"). */
  filename: string;
}

/** Injectable filesystem interface — keeps the function unit-testable. */
export interface FsAdapter {
  mkdir(dir: string, opts: { recursive: boolean }): Promise<unknown>;
  writeFile(filePath: string, data: string, encoding: "utf8"): Promise<void>;
  /** List entries in a directory; throws when the directory does not exist. */
  readdir(dir: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Default fs adapter
// ---------------------------------------------------------------------------

export const defaultFs: FsAdapter = {
  mkdir:     (dir, opts) => nodeFs.mkdir(dir, opts),
  writeFile: (filePath, data, enc) => nodeFs.writeFile(filePath, data, enc),
  readdir:   (dir) => nodeFs.readdir(dir),
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Zero-pads `n` to `width` digits. */
export function zeroPad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

/** Converts a title to a URL/filesystem-safe slug. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Determines the next ADR sequence number by scanning `entries` for files
 * whose names start with one or more digits followed by a hyphen.
 * Returns 1 when no numbered files are found.
 */
export function nextAdrNumber(entries: string[]): number {
  const numbers = entries
    .map((f) => f.match(/^(\d+)-/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

/** Builds the `## Considered Options` bullet list. */
export function buildOptionsList(options: string[]): string {
  return options.length > 0
    ? options.map((o) => `* ${o}`).join("\n")
    : "* …";
}

/** Builds the `## Pros and Cons` section scaffold. */
export function buildOptionsAnalysis(options: string[]): string {
  return options
    .map((o) => `### ${o}\n\n* Good, because …\n* Bad, because …\n`)
    .join("\n");
}

/** Renders the `## Decision Drivers` bullet list. */
export function buildDriversList(drivers: string[]): string {
  return drivers.length > 0
    ? drivers.map((d) => `* ${d}`).join("\n")
    : "* …";
}

/** Fills the MADR template with the provided values. */
export function renderTemplate(
  template: string,
  values: {
    title: string;
    status: string;
    context: string;
    drivers: string;
    optionsList: string;
    chosenOption: string;
    outcomeReason: string;
    goodConsequences: string;
    badConsequences: string;
    optionsAnalysis: string;
  }
): string {
  return template
    .replace("{title}",             values.title)
    .replace("{status}",            values.status)
    .replace("{context}",           values.context)
    .replace("{drivers}",           values.drivers)
    .replace("{options_list}",      values.optionsList)
    .replace("{chosen_option}",     values.chosenOption)
    .replace("{outcome_reason}",    values.outcomeReason)
    .replace("{good_consequences}", values.goodConsequences)
    .replace("{bad_consequences}",  values.badConsequences)
    .replace("{options_analysis}",  values.optionsAnalysis);
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Writes a new MADR-format ADR file to `options.adrDir`.
 *
 * The sequence number is determined by scanning the directory for existing
 * numbered files. The directory is created when it does not yet exist.
 *
 * @throws Re-throws any I/O errors from the injected `fs` adapter.
 */
export async function writeAdr(
  options: WriteAdrOptions,
  fs: FsAdapter = defaultFs
): Promise<WriteAdrResult> {
  const cwd    = options.cwd ?? process.cwd();
  const absDir = nodePath.resolve(cwd, options.adrDir);

  await fs.mkdir(absDir, { recursive: true });

  let entries: string[] = [];
  try {
    entries = await fs.readdir(absDir);
  } catch {
    // Directory just created or unreadable — treat as empty.
  }

  const num      = nextAdrNumber(entries);
  const filename = `${zeroPad(num)}-${slugify(options.title)}.md`;
  const absPath  = nodePath.join(absDir, filename);
  const relPath  = nodePath.join(options.adrDir, filename);

  const content = renderTemplate(MADR_TEMPLATE, {
    title:            options.title,
    status:           options.status,
    context:          options.context,
    drivers:          buildDriversList(options.drivers),
    optionsList:      buildOptionsList(options.options),
    chosenOption:     options.chosenOption,
    outcomeReason:    options.outcomeReason,
    goodConsequences: options.goodConsequences,
    badConsequences:  options.badConsequences,
    optionsAnalysis:  buildOptionsAnalysis(options.options),
  });

  await fs.writeFile(absPath, content, "utf8");

  return { absPath, relPath, number: num, filename };
}
