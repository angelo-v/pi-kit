#!/usr/bin/env node
/**
 * validate — SHACL validation CLI for pi-kit projects.
 *
 * Usage:
 *   npx pi-kit-validate [options] [data-files...]
 *
 * Options:
 *   --shapes <file>   Add a shapes file (repeatable). Defaults to auto-discovery
 *                     of *.shacl.ttl under the current working directory.
 *   --cwd <dir>       Root directory for file discovery (default: process.cwd()).
 *   --help, -h        Print this help message.
 *
 * When no data files are given, all RDF files (*.ttl, *.rdf, *.n3, *.jsonld,
 * *.trig, *.nq, *.nt) that are NOT shapes files are discovered under --cwd.
 *
 * Exit codes:
 *   0  — validation passed (or --help)
 *   1  — one or more SHACL violations found
 *   2  — usage / file-not-found error
 */

import { resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import {
  findByExtensions,
  findByFullSuffix,
  RDF_EXTENSIONS,
  SHACL_EXTENSIONS,
} from "../extensions/lib/find-files.js";
import {
  validateShacl,
  formatValidationResult,
} from "../extensions/lib/shacl-validate.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Usage: pi-kit-validate [options] [data-files...]

Validates RDF data files against SHACL shapes.

Options:
  --shapes <file>   Path to a SHACL shapes file (repeatable).
                    Default: auto-discover *.shacl.ttl under --cwd.
  --cwd <dir>       Root for file discovery (default: current working directory).
  --help, -h        Print this help and exit.

When no data-files are given, all RDF files under --cwd are validated
(*.ttl, *.rdf, *.n3, *.jsonld, *.trig, *.nq, *.nt), excluding shapes files.

Exit codes:
  0  validation passed
  1  one or more violations found
  2  argument / file error
`.trim());
}

function parseArgs(argv: string[]): {
  cwd: string;
  dataFiles: string[];
  shapesFiles: string[];
  help: boolean;
} {
  const args = argv.slice(2); // strip "node" + script name
  const cwd = process.cwd();
  let rootDir = cwd;
  const dataFiles: string[] = [];
  const shapesFiles: string[] = [];
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      help = true;
    } else if (a === "--cwd") {
      const next = args[++i];
      if (!next) { console.error("--cwd requires a directory argument"); process.exit(2); }
      rootDir = isAbsolute(next) ? next : resolve(cwd, next);
    } else if (a === "--shapes") {
      const next = args[++i];
      if (!next) { console.error("--shapes requires a file argument"); process.exit(2); }
      shapesFiles.push(isAbsolute(next) ? next : resolve(cwd, next));
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    } else {
      dataFiles.push(isAbsolute(a) ? a : resolve(cwd, a));
    }
  }

  return { cwd: rootDir, dataFiles, shapesFiles, help };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { cwd, dataFiles: explicitData, shapesFiles: explicitShapes, help } = parseArgs(process.argv);

  if (help) {
    printHelp();
    process.exit(0);
  }

  // ── Resolve shapes files ─────────────────────────────────────────────
  let shapesFiles = explicitShapes;
  if (shapesFiles.length === 0) {
    shapesFiles = findByFullSuffix(cwd, SHACL_EXTENSIONS);
    if (shapesFiles.length === 0) {
      console.error(`No shapes files found. Place *.shacl.ttl files under ${cwd} or pass --shapes <file>.`);
      process.exit(2);
    }
    console.log(`Auto-discovered ${shapesFiles.length} shapes file(s):`);
    shapesFiles.forEach((f) => console.log(`  ${f}`));
  }

  // Validate shapes files exist
  for (const f of shapesFiles) {
    if (!existsSync(f)) {
      console.error(`Shapes file not found: ${f}`);
      process.exit(2);
    }
  }

  // ── Resolve data files ───────────────────────────────────────────────
  let dataFiles = explicitData;
  if (dataFiles.length === 0) {
    const shapesSet = new Set(shapesFiles);
    dataFiles = findByExtensions(cwd, RDF_EXTENSIONS).filter((f) => !shapesSet.has(f));
    if (dataFiles.length === 0) {
      console.error(`No RDF data files found under ${cwd}.`);
      process.exit(2);
    }
    console.log(`Auto-discovered ${dataFiles.length} data file(s):`);
    dataFiles.forEach((f) => console.log(`  ${f}`));
  }

  // Validate data files exist
  for (const f of dataFiles) {
    if (!existsSync(f)) {
      console.error(`Data file not found: ${f}`);
      process.exit(2);
    }
  }

  // ── Run validation ───────────────────────────────────────────────────
  console.log("\nRunning SHACL validation…");
  let result;
  try {
    result = await validateShacl({ dataFiles, shapesFiles });
  } catch (err) {
    console.error("Validation failed with an error:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  console.log("\n" + formatValidationResult(result));

  process.exit(result.conforms ? 0 : 1);
}

main();
