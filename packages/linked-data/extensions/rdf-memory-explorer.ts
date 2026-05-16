/**
 * rdf-memory-explorer extension
 *
 * Registers a `/rdf-memory-explorer` command that serves the bundled
 * RDF Memory Explorer single-page app over a local HTTP server and prints
 * the URL so users can open it — works in containers and remote environments
 * where there is no local browser.
 *
 * Behaviour:
 *  - Starts an HTTP server on a random free port (localhost only).
 *  - The server serves the HTML app and a read-only API scoped to the default
 *    store directory (no arbitrary-path endpoints):
 *      GET /api/stores          → JSON list of store names in the default dir
 *      GET /api/store/:name     → raw N-Quads text for that store
 *  - Default directory: ~/.pi/agent/rdf-memory  (same as the rdf_memory_* tools)
 *  - Prints the URL in the chat via pi.sendMessage so it can be copy-pasted.
 *  - Also attempts xdg-open / open as a best-effort (silently ignored on failure).
 *  - The server shuts down automatically when the pi session ends.
 *  - Running the command again while a server is already up just prints the URL again.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

import { resolveHtmlPath, defaultStoreDir } from "./lib/rdf-memory-explorer-paths.js";
import { handleRequest } from "./lib/rdf-memory-explorer-server.js";

// ── Real filesystem adapter ───────────────────────────────────────────────────

import { existsSync as _existsSync, readdirSync as _readdirSync } from "node:fs";
import type { Dirent } from "node:fs";

const realFs = {
  existsSync: _existsSync,
  readdirSync: (path: string) => _readdirSync(path, { withFileTypes: true }) as Dirent[],
  readFileSync: (path: string, encoding: "utf8") => readFileSync(path, encoding),
};

// ── Server singleton ──────────────────────────────────────────────────────────

let activeServer: Server | null = null;
let activeUrl: string | null = null;

function startServer(htmlPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const htmlBytes = readFileSync(htmlPath);
    const defaultDir = defaultStoreDir();

    const server = createServer((req, res) => {
      handleRequest(req, res, { htmlBytes, defaultDir, fs: realFs });
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      activeServer = server;
      activeUrl = `http://localhost:${port}`;
      resolve(activeUrl);
    });

    server.on("error", reject);
  });
}

function stopServer(): void {
  if (activeServer) {
    activeServer.close();
    activeServer = null;
    activeUrl = null;
  }
}

// ── Platform open (best-effort) ───────────────────────────────────────────────

function openCommand(): string {
  switch (process.platform) {
    case "darwin": return "open";
    case "win32":  return "start";
    default:       return "xdg-open";
  }
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_shutdown", () => {
    stopServer();
  });

  pi.registerCommand("rdf-memory-explorer", {
    description: "Serve the RDF Memory Explorer and show its URL",
    handler: async (_args, ctx) => {
      const extensionDir = dirname(fileURLToPath(import.meta.url));

      let htmlPath: string;
      try {
        htmlPath = resolveHtmlPath(extensionDir, { existsSync });
      } catch (err: any) {
        ctx.ui.notify(`RDF Memory Explorer: ${err.message}`, "error");
        return;
      }

      // Reuse an already-running server
      if (!activeUrl) {
        try {
          await startServer(htmlPath);
        } catch (err: any) {
          ctx.ui.notify(`Could not start server: ${err.message}`, "error");
          return;
        }
      }

      const url = activeUrl!;

      pi.sendMessage({
        customType: "rdf-memory-explorer",
        content: `RDF Memory Explorer is running at:\n\n  ${url}\n\nOpen that URL in your browser to explore your RDF stores.`,
        display: true,
      });

      // Best-effort: try to open in browser (works on desktop, ignored in containers)
      pi.exec(openCommand(), [url]).catch(() => { /* silently ignored */ });
    },
  });
}
