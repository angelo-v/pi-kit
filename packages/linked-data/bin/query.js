#!/usr/bin/env node
/**
 * pi-kit-query — thin launcher that runs query.ts via tsx.
 *
 * tsx is declared as a devDependency of this package, so it is available
 * as ./node_modules/.bin/tsx when the package is installed.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsEntry = resolve(__dirname, "query.ts");

// Resolve tsx binary: prefer local (node_modules/.bin), then parent (workspace
// hoisting), then fall back to PATH.
const candidates = [
  resolve(__dirname, "../node_modules/.bin/tsx"),    // local install
  resolve(__dirname, "../../node_modules/.bin/tsx"), // workspace root
  resolve(__dirname, "../../../node_modules/.bin/tsx"), // one more level
];
const tsxBin = candidates.find(existsSync) ?? "tsx";

const result = spawnSync(tsxBin, [tsEntry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
