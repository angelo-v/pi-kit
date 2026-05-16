/**
 * HTTP server logic for the rdf-memory-explorer extension.
 *
 * Business rules only — no module-level singletons, no real I/O.
 * The entry-point owns the server lifecycle (start / stop).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { listStores, readStoreNq, type StoresFs } from "./rdf-memory-explorer-stores.js";

// ── Response helpers ──────────────────────────────────────────────────────────

/** Write a JSON response. */
export function respondJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** Write an N-Quads response. */
export function respondNq(res: ServerResponse, text: string): void {
  res.writeHead(200, {
    "Content-Type": "application/n-quads",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

/** Write a plain-text 404. */
export function respondNotFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

// ── Query-string parsing ──────────────────────────────────────────────────────

/**
 * Parse the query string from a raw request URL.
 *
 * @param rawUrl - The full URL string (e.g. `/api/stores` or `/api/store/my-store`).
 * @returns A plain object of key → value pairs; empty object when no `?`.
 */
export function parseQuery(rawUrl: string): Record<string, string> {
  const idx = rawUrl.indexOf("?");
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(rawUrl.slice(idx + 1)));
}

// ── Route handler ─────────────────────────────────────────────────────────────

/** Dependencies injected into the request handler. */
export interface HandlerDeps {
  /** Pre-read bytes of the HTML app to serve on `/`. */
  htmlBytes: Buffer;
  /** Default store directory (e.g. `~/.pi/agent/rdf-memory`). */
  defaultDir: string;
  /** Filesystem adapter. */
  fs: StoresFs;
}

/**
 * Handle a single HTTP request.
 *
 * Routes:
 *   GET /                → HTML app
 *   GET /api/stores      → JSON { dir, stores[] } for the default dir only
 *   GET /api/store/:name → N-Quads for a store in the default dir
 *
 * All reads are scoped to `defaultDir`; no arbitrary-path endpoints are
 * exposed to avoid directory-traversal / local-file-read attacks.
 */
export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: HandlerDeps,
): void {
  const { htmlBytes, defaultDir, fs } = deps;
  const rawUrl = req.url ?? "/";
  const pathname = rawUrl.split("?")[0];

  // ── HTML app ──────────────────────────────────────────────────────────────
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(htmlBytes);
    return;
  }

  // ── GET /api/stores ───────────────────────────────────────────────────────
  if (pathname === "/api/stores") {
    respondJson(res, { dir: defaultDir, stores: listStores(defaultDir, fs) });
    return;
  }

  // ── GET /api/store/:name ──────────────────────────────────────────────────
  const storeMatch = pathname.match(/^\/api\/store\/(.+)$/);
  if (storeMatch) {
    const name = decodeURIComponent(storeMatch[1]);
    const text = readStoreNq(defaultDir, name, fs);
    if (text === null) { respondNotFound(res); return; }
    respondNq(res, text);
    return;
  }


  respondNotFound(res);
}