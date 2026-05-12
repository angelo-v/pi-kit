/**
 * Locates the `comunica-sparql-file` binary by walking up the directory
 * tree from `cwd`, checking each ancestor's `node_modules/.bin/` directory.
 *
 * This handles both local workspace installs and hoisted monorepo layouts.
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

export const BINARY_NAME = "comunica-sparql-file";

/**
 * Walk up from `cwd` until the binary is found, then return its absolute path.
 * Throws if the binary cannot be located anywhere in the ancestor chain.
 */
export function findBinary(cwd: string): string {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, "node_modules", ".bin", BINARY_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  throw new Error(
    `${BINARY_NAME} binary not found. Run \`npm install\` in the workspace root.`
  );
}
