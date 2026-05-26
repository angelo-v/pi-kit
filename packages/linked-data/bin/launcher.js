/**
 * Shared launcher — finds tsx and delegates to a TypeScript entry point.
 *
 * Walk up from `startDir` to find tsx in any ancestor node_modules.
 * This mirrors the same walk-up strategy used in find-binary.ts and correctly
 * handles both local installs and npm-hoisted/workspace layouts.
 *
 * @param {string} tsEntry  Absolute path to the .ts file to execute.
 * @param {string} binName  Display name used in the error message (e.g. "pi-kit-query").
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function findTsx(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = resolve(dir, "node_modules", ".bin", "tsx");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

export function launch(tsEntry, binName) {
  const tsxBin = findTsx(resolve(tsEntry, ".."));
  if (!tsxBin) {
    console.error(
      `Error: tsx not found. It is required to run ${binName}.\n` +
      "Install it in your project: npm install -D tsx"
    );
    process.exit(2);
  }

  const result = spawnSync(tsxBin, [tsEntry, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(result.status ?? 1);
}
