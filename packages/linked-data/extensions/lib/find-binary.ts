/**
 * Locates a Comunica binary by walking up the directory tree,
 * checking each ancestor's `node_modules/.bin/` directory.
 *
 * Two starting points are supported and tried in order:
 *
 *  1. The directory of the calling extension file (`importMetaUrl`). This
 *     covers the normal installed-package case: the binary lives in the
 *     package's own `node_modules` tree, regardless of the user's project.
 *
 *  2. The user's current working directory (`cwd`). This covers local
 *     development where the user has installed the binary themselves.
 *
 * Trying the extension's own location first means a `pi install`-ed package
 * always finds its bundled binary without requiring anything in the user's
 * project.
 */

import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** The binary used to query local RDF files. */
export const BINARY_NAME = "comunica-sparql-file";

/** The binary used to query remote SPARQL endpoints. */
export const REMOTE_BINARY_NAME = "comunica-sparql";

/**
 * Walk up from `startDir` until `binaryName` is found in a
 * `node_modules/.bin/` subdirectory, then return its absolute path.
 * Returns `null` if the binary is not found before reaching the filesystem root.
 */
function walkUp(startDir: string, binaryName: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, "node_modules", ".bin", binaryName);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/**
 * Locate `binaryName` by searching from the extension file's own directory
 * first, then from the user's `cwd`. Throws if it cannot be found in either
 * ancestor chain.
 *
 * @param cwd           The user's current working directory (`ctx.cwd`).
 * @param importMetaUrl Pass `import.meta.url` from the calling module so the
 *                      walk can start from the package's own install location.
 * @param binaryName    Defaults to `BINARY_NAME` (`comunica-sparql-file`).
 */
export function findBinary(
  cwd: string,
  importMetaUrl: string,
  binaryName: string = BINARY_NAME
): string {
  const extensionDir = dirname(fileURLToPath(importMetaUrl));

  const fromExtension = walkUp(extensionDir, binaryName);
  if (fromExtension) return fromExtension;

  const fromCwd = walkUp(cwd, binaryName);
  if (fromCwd) return fromCwd;

  throw new Error(
    `${binaryName} binary not found. Run \`npm install\` in the workspace root.`
  );
}
