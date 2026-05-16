/**
 * Unit tests for rdf-memory-explorer-server.ts
 *
 * `handleRequest` is called with a fake `IncomingMessage` / `ServerResponse`
 * pair and an injected `StoresFs` adapter — no real HTTP or filesystem I/O.
 */

import { describe, it, expect, vi } from "vitest";
import {
  parseQuery,
  respondJson,
  respondNq,
  respondNotFound,
  handleRequest,
  type HandlerDeps,
} from "../rdf-memory-explorer-server.js";
import type { StoresFs } from "../rdf-memory-explorer-stores.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Minimal fake ServerResponse that captures writeHead and end calls. */
function fakeRes() {
  const written: { status: number; headers: Record<string, string>; body: unknown } = {
    status: 0,
    headers: {},
    body: undefined,
  };
  const res = {
    writeHead: vi.fn((status: number, headers: Record<string, string> = {}) => {
      written.status = status;
      written.headers = headers;
    }),
    end: vi.fn((body: unknown) => {
      written.body = body;
    }),
    written,
  } as any;
  return res;
}

/** Minimal fake IncomingMessage with a given URL. */
function fakeReq(url: string) {
  return { url } as any;
}

/** A `StoresFs` that knows about a small set of stores in a given directory. */
function makeFs(storeDir: string, stores: string[], contents: Record<string, string> = {}): StoresFs {
  const dataFiles = new Set(stores.map((s) => `${storeDir}/${s}/data.nq`));
  const knownDirs = new Set([storeDir, ...stores.map((s) => `${storeDir}/${s}`)]);
  return {
    existsSync: (p) => knownDirs.has(p) || dataFiles.has(p) || p in contents,
    readdirSync: (dir) =>
      dir === storeDir
        ? stores.map((name) => ({ name, isDirectory: () => true }))
        : [],
    readFileSync: (p, _enc) => {
      if (p in contents) return contents[p];
      const nqPath = p;
      if (dataFiles.has(nqPath)) return "<urn:s> <urn:p> <urn:o> .\n";
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

const HTML = Buffer.from("<html>explorer</html>");
const DEFAULT_DIR = "/home/test/.pi/agent/rdf-memory";

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    htmlBytes: HTML,
    defaultDir: DEFAULT_DIR,
    fs: makeFs(DEFAULT_DIR, ["store-a", "store-b"], {
      [`${DEFAULT_DIR}/store-a/data.nq`]: "<urn:a> <urn:p> <urn:o> .\n",
      [`${DEFAULT_DIR}/store-b/data.nq`]: "<urn:b> <urn:p> <urn:o> .\n",
    }),
    ...overrides,
  };
}

// ── parseQuery ────────────────────────────────────────────────────────────────

describe("parseQuery", () => {
  it("returns an empty object when there is no query string", () => {
    expect(parseQuery("/api/stores")).toEqual({});
  });

  it("parses a single key-value pair", () => {
    expect(parseQuery("/api/dir?path=/tmp")).toEqual({ path: "/tmp" });
  });

  it("parses multiple key-value pairs", () => {
    expect(parseQuery("/api/store-path?dir=/tmp&name=mystore")).toEqual({
      dir: "/tmp",
      name: "mystore",
    });
  });

  it("returns an empty object for a bare '?'", () => {
    expect(parseQuery("/path?")).toEqual({});
  });

  it("decodes percent-encoded values", () => {
    expect(parseQuery("/api/dir?path=%2Ftmp%2Ftest")).toEqual({ path: "/tmp/test" });
  });
});

// ── respondJson ───────────────────────────────────────────────────────────────

describe("respondJson", () => {
  it("writes the default 200 status", () => {
    const res = fakeRes();
    respondJson(res, { ok: true });
    expect(res.written.status).toBe(200);
  });

  it("writes the provided status when specified", () => {
    const res = fakeRes();
    respondJson(res, { error: "bad" }, 400);
    expect(res.written.status).toBe(400);
  });

  it("sets Content-Type to application/json", () => {
    const res = fakeRes();
    respondJson(res, {});
    expect(res.written.headers["Content-Type"]).toBe("application/json");
  });

  it("sets CORS header", () => {
    const res = fakeRes();
    respondJson(res, {});
    expect(res.written.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("serialises the body as JSON", () => {
    const res = fakeRes();
    respondJson(res, { hello: "world" });
    expect(res.written.body).toBe('{"hello":"world"}');
  });
});

// ── respondNq ─────────────────────────────────────────────────────────────────

describe("respondNq", () => {
  it("writes status 200", () => {
    const res = fakeRes();
    respondNq(res, "");
    expect(res.written.status).toBe(200);
  });

  it("sets Content-Type to application/n-quads", () => {
    const res = fakeRes();
    respondNq(res, "");
    expect(res.written.headers["Content-Type"]).toBe("application/n-quads");
  });

  it("sets CORS header", () => {
    const res = fakeRes();
    respondNq(res, "nq data");
    expect(res.written.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("writes the nq text as the body", () => {
    const res = fakeRes();
    respondNq(res, "<urn:s> <urn:p> <urn:o> .\n");
    expect(res.written.body).toBe("<urn:s> <urn:p> <urn:o> .\n");
  });
});

// ── respondNotFound ───────────────────────────────────────────────────────────

describe("respondNotFound", () => {
  it("writes status 404", () => {
    const res = fakeRes();
    respondNotFound(res);
    expect(res.written.status).toBe(404);
  });

  it("ends with a non-empty body", () => {
    const res = fakeRes();
    respondNotFound(res);
    expect(res.written.body).toBeTruthy();
  });
});

// ── handleRequest ─────────────────────────────────────────────────────────────

describe("handleRequest — GET /", () => {
  it("responds with status 200", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/"), res, makeDeps());
    expect(res.written.status).toBe(200);
  });

  it("sets Content-Type to text/html", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/"), res, makeDeps());
    expect(res.written.headers["Content-Type"]).toContain("text/html");
  });

  it("sends the HTML bytes", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/"), res, makeDeps());
    expect(res.written.body).toEqual(HTML);
  });

  it("also serves /index.html", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/index.html"), res, makeDeps());
    expect(res.written.status).toBe(200);
  });
});

describe("handleRequest — GET /api/stores", () => {
  it("returns status 200", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/stores"), res, makeDeps());
    expect(res.written.status).toBe(200);
  });

  it("returns the default directory", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/stores"), res, makeDeps());
    const body = JSON.parse(res.written.body as string);
    expect(body.dir).toBe(DEFAULT_DIR);
  });

  it("returns the list of stores", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/stores"), res, makeDeps());
    const body = JSON.parse(res.written.body as string);
    expect(body.stores).toEqual(["store-a", "store-b"]);
  });
});

describe("handleRequest — GET /api/store/:name", () => {
  it("returns 200 with N-Quads for a known store", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/store/store-a"), res, makeDeps());
    expect(res.written.status).toBe(200);
    expect(res.written.headers["Content-Type"]).toBe("application/n-quads");
  });

  it("returns the correct N-Quads content", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/store/store-a"), res, makeDeps());
    expect(res.written.body).toBe("<urn:a> <urn:p> <urn:o> .\n");
  });

  it("returns 404 for an unknown store", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/store/nonexistent"), res, makeDeps());
    expect(res.written.status).toBe(404);
  });

  it("decodes percent-encoded store names in the URL path", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/store/store%2Da"), res, makeDeps());
    // store-a has a hyphen which encodes as %2D
    expect(res.written.status).toBe(200);
  });
});


describe("handleRequest — unknown routes", () => {
  it("returns 404 for an unrecognised path", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/not-a-real-route"), res, makeDeps());
    expect(res.written.status).toBe(404);
  });

  it("returns 404 for /api/unknown", () => {
    const res = fakeRes();
    handleRequest(fakeReq("/api/unknown"), res, makeDeps());
    expect(res.written.status).toBe(404);
  });
});
