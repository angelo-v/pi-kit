#!/usr/bin/env node
/**
 * query — SPARQL query CLI for local RDF files.
 *
 * Usage:
 *   npx pi-kit-query <query.rq> [rdf-files...]
 *   npx pi-kit-query <query.rq> --format json
 *
 * The first positional argument must be a .rq or .sparql file.
 * When no rdf-files are given, all RDF files (*.ttl, *.rdf, *.n3,
 * *.jsonld, *.trig, *.nq, *.nt) under the current directory are used.
 *
 * Options:
 *   --format <fmt>   Output format: table (default), json, csv, turtle.
 *   --no-limit       Do not auto-append LIMIT 500 to SELECT/ASK queries.
 *   --help, -h       Print this help message.
 *
 * Exit codes:
 *   0  — query succeeded
 *   1  — SPARQL error
 *   2  — usage / file-not-found error
 */

import { resolve, isAbsolute, extname, relative } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { search } from "@inquirer/prompts";
import { findBinary } from "../extensions/lib/find-binary.js";
import { findByExtensions, gitRoot, RDF_EXTENSIONS, QUERY_EXTENSIONS } from "../extensions/lib/find-files.js";
import { resolveSources } from "../extensions/lib/resolve-sources.js";
import { buildArgs, type OutputFormat } from "../extensions/lib/format.js";
import { ensureLimit } from "../extensions/lib/limit-query.js";
import { runQuery } from "../extensions/lib/run-query.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Usage: pi-kit-query <query.rq> [rdf-files...] [--format table|json|csv|turtle]

Runs a SPARQL 1.1 query against local RDF files using Comunica.

Arguments:
  <query.rq>      Path to a .rq or .sparql query file (required).
  [rdf-files...]  RDF files to query. When omitted, all RDF files under
                  the current directory are used automatically.

Options:
  --format <fmt>  Output format: table (default), json, csv, turtle.
  --no-limit      Skip auto-appending LIMIT 500 to SELECT/ASK queries.
  -h, --help      Print this help and exit.

Examples:
  pi-kit-query find-books.rq
  pi-kit-query find-books.rq data.ttl shapes.ttl
  pi-kit-query find-books.rq --format json

Exit codes:
  0  query succeeded
  1  SPARQL error
  2  argument / file error
`.trim());
}

const VALID_FORMATS = new Set<string>(["table", "json", "csv", "turtle"]);

function isQueryFile(p: string): boolean {
  const ext = extname(p);
  return QUERY_EXTENSIONS.has(ext);
}

function parseArgs(argv: string[]): {
  cwd: string;
  queryFile: string;
  rdfFiles: string[];
  format: OutputFormat;
  applyLimit: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  const cwd = process.cwd();
  let queryFile: string | null = null;
  const rdfFiles: string[] = [];
  let format: OutputFormat = "table";
  let applyLimit = true;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      help = true;
    } else if (a === "--no-limit") {
      applyLimit = false;
    } else if (a === "--format") {
      const next = args[++i];
      if (!next || !VALID_FORMATS.has(next)) {
        console.error(`--format must be one of: ${[...VALID_FORMATS].join(", ")}`);
        process.exit(2);
      }
      format = next as OutputFormat;
    } else if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    } else {
      // positional: first .rq/.sparql file is the query, rest are RDF sources
      const abs = isAbsolute(a) ? a : resolve(cwd, a);
      if (queryFile === null && isQueryFile(a)) {
        queryFile = abs;
      } else {
        rdfFiles.push(abs);
      }
    }
  }

  return { cwd, queryFile: queryFile ?? "", rdfFiles, format, applyLimit, help };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  const { cwd, rdfFiles: explicitFiles, format, applyLimit, help } = parsed;
  let { queryFile } = parsed;

  if (help) {
    printHelp();
    process.exit(0);
  }

  // ── Resolve query file ───────────────────────────────────────────────
  if (!queryFile) {
    const searchRoot = gitRoot(cwd);
    const available = findByExtensions(searchRoot, QUERY_EXTENSIONS);
    if (available.length === 0) {
      console.error("No .rq or .sparql files found. Pass a query file as the first argument.");
      process.exit(2);
    }
    try {
      queryFile = await search({
        message: "Select a query",
        source: (term) => {
          const lower = (term ?? "").toLowerCase();
          return available
            .filter((f) => relative(searchRoot, f).toLowerCase().includes(lower))
            .map((f) => ({ name: relative(searchRoot, f), value: f }));
        },
      });
    } catch {
      // user cancelled (Ctrl-C)
      process.exit(0);
    }
    // Inquirer leaves stdin in raw mode — release it so child processes
    // (Comunica) can read from it without blocking.
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  if (!existsSync(queryFile)) {
    console.error(`Query file not found: ${queryFile}`);
    process.exit(2);
  }
  let query = readFileSync(queryFile, "utf8");
  if (applyLimit) query = ensureLimit(query);

  // ── Resolve RDF files ────────────────────────────────────────────────
  const repoRoot = gitRoot(cwd);
  let rdfFiles = explicitFiles;
  if (rdfFiles.length === 0) {
    rdfFiles = findByExtensions(repoRoot, RDF_EXTENSIONS);
    if (rdfFiles.length === 0) {
      console.error(`No RDF files found under ${repoRoot}.`);
      process.exit(2);
    }
    console.error(`Auto-discovered ${rdfFiles.length} RDF file(s).`);
  }

  const { sources, missing } = resolveSources(rdfFiles, repoRoot);
  if (missing.length > 0) {
    console.error("File(s) not found:");
    missing.forEach((f) => console.error(`  ${f}`));
    process.exit(2);
  }

  // ── Find Comunica binary ─────────────────────────────────────────────
  let binary: string;
  try {
    binary = findBinary(cwd, import.meta.url);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  // ── Run query ────────────────────────────────────────────────────────
  const args = buildArgs(sources, query, format);
  try {
    const { output } = await runQuery(binary, args, cwd);
    process.stdout.write(output);
    if (!output.endsWith("\n")) process.stdout.write("\n");
    process.exit(0);
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message;
    console.error("SPARQL Error:");
    console.error(msg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
