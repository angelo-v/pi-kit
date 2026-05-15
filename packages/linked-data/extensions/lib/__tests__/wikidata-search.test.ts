import { describe, it, expect } from "vitest";
import {
  searchWikidata,
  formatTable,
  WIKIDATA_API_URL,
  type FetchFn,
  type SearchHit,
} from "../wikidata-search.js";

// ── stub helpers ──────────────────────────────────────────────────────────────

/** Build a minimal successful wbsearchentities API response. */
function apiResponse(hits: Array<{ id: string; label?: string; description?: string }>) {
  return {
    searchinfo: { search: "test" },
    search: hits.map((h) => ({
      id: h.id,
      label: h.label ?? h.id,
      description: h.description ?? "",
    })),
    success: 1,
  };
}

function okFetch(body: object): FetchFn {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
}

function errorFetch(status: number): FetchFn {
  return async () => ({
    ok: false,
    status,
    text: async () => "",
  });
}

function throwingFetch(message: string): FetchFn {
  return async () => {
    throw new Error(message);
  };
}

// ── WIKIDATA_API_URL ──────────────────────────────────────────────────────────

describe("WIKIDATA_API_URL", () => {
  it("points to the Wikidata MediaWiki API", () => {
    expect(WIKIDATA_API_URL).toBe("https://www.wikidata.org/w/api.php");
  });
});

// ── searchWikidata ────────────────────────────────────────────────────────────

describe("searchWikidata", () => {
  describe("happy path", () => {
    it("returns hits from the API response", async () => {
      const fetch = okFetch(
        apiResponse([
          { id: "Q64", label: "Berlin", description: "capital of Germany" },
          { id: "Q1726", label: "Munich", description: "city in Bavaria" },
        ])
      );
      const result = await searchWikidata("Berlin", "item", "en", 10, fetch);

      expect(result.hits).toHaveLength(2);
      expect(result.hits[0]).toEqual({
        id: "Q64",
        label: "Berlin",
        description: "capital of Germany",
      });
      expect(result.hits[1]).toEqual({
        id: "Q1726",
        label: "Munich",
        description: "city in Bavaria",
      });
    });

    it("includes a non-empty formatted table", async () => {
      const fetch = okFetch(
        apiResponse([{ id: "Q64", label: "Berlin", description: "capital of Germany" }])
      );
      const result = await searchWikidata("Berlin", "item", "en", 10, fetch);

      expect(result.table).toContain("Q64");
      expect(result.table).toContain("Berlin");
      expect(result.table).toContain("capital of Germany");
    });

    it("returns (no results) table when API returns empty search array", async () => {
      const fetch = okFetch({ search: [], success: 1 });
      const result = await searchWikidata("xyzzy-nonexistent", "item", "en", 10, fetch);

      expect(result.hits).toHaveLength(0);
      expect(result.table).toBe("(no results)");
    });

    it("handles missing search array gracefully", async () => {
      const fetch = okFetch({ success: 1 }); // no `search` key
      const result = await searchWikidata("foo", "item", "en", 10, fetch);
      expect(result.hits).toHaveLength(0);
    });

    it("uses empty string for missing label / description fields", async () => {
      const fetch = okFetch({ search: [{ id: "Q999" }], success: 1 });
      const result = await searchWikidata("foo", "item", "en", 10, fetch);
      expect(result.hits[0]).toEqual({ id: "Q999", label: "", description: "" });
    });
  });

  describe("URL construction", () => {
    it("passes the search term in the query string", async () => {
      let capturedUrl = "";
      const fetch: FetchFn = async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, text: async () => JSON.stringify({ search: [], success: 1 }) };
      };
      await searchWikidata("Berlin", "item", "en", 10, fetch);
      expect(capturedUrl).toContain("search=Berlin");
    });

    it("passes type=property for property searches", async () => {
      let capturedUrl = "";
      const fetch: FetchFn = async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, text: async () => JSON.stringify({ search: [], success: 1 }) };
      };
      await searchWikidata("instance of", "property", "en", 10, fetch);
      expect(capturedUrl).toContain("type=property");
    });

    it("passes the lang parameter", async () => {
      let capturedUrl = "";
      const fetch: FetchFn = async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, text: async () => JSON.stringify({ search: [], success: 1 }) };
      };
      await searchWikidata("Berlin", "item", "de", 10, fetch);
      expect(capturedUrl).toContain("language=de");
      expect(capturedUrl).toContain("uselang=de");
    });

    it("clamps limit to 50", async () => {
      let capturedUrl = "";
      const fetch: FetchFn = async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, text: async () => JSON.stringify({ search: [], success: 1 }) };
      };
      await searchWikidata("foo", "item", "en", 999, fetch);
      expect(capturedUrl).toContain("limit=50");
    });

    it("clamps limit to 1 (minimum)", async () => {
      let capturedUrl = "";
      const fetch: FetchFn = async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, text: async () => JSON.stringify({ search: [], success: 1 }) };
      };
      await searchWikidata("foo", "item", "en", 0, fetch);
      expect(capturedUrl).toContain("limit=1");
    });

    it("uses the injected apiUrl", async () => {
      let capturedUrl = "";
      const fetch: FetchFn = async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, text: async () => JSON.stringify({ search: [], success: 1 }) };
      };
      await searchWikidata("foo", "item", "en", 10, fetch, "https://test.example.com/api.php");
      expect(capturedUrl).toContain("https://test.example.com/api.php");
    });
  });

  describe("error handling", () => {
    it("throws on a non-OK HTTP response", async () => {
      await expect(
        searchWikidata("foo", "item", "en", 10, errorFetch(503))
      ).rejects.toThrow("HTTP 503");
    });

    it("throws when fetch itself rejects", async () => {
      await expect(
        searchWikidata("foo", "item", "en", 10, throwingFetch("network down"))
      ).rejects.toThrow("network down");
    });

    it("throws on invalid JSON", async () => {
      const fetch: FetchFn = async () => ({
        ok: true,
        status: 200,
        text: async () => "not json {{{",
      });
      await expect(searchWikidata("foo", "item", "en", 10, fetch)).rejects.toThrow(
        "invalid JSON"
      );
    });

    it("throws on an API-level error response", async () => {
      const fetch = okFetch({ error: { code: "invalidlang", info: "Invalid language code" } });
      await expect(searchWikidata("foo", "item", "en", 10, fetch)).rejects.toThrow(
        "Invalid language code"
      );
    });

    it("uses error.code when error.info is absent", async () => {
      const fetch = okFetch({ error: { code: "badtoken" } });
      await expect(searchWikidata("foo", "item", "en", 10, fetch)).rejects.toThrow(
        "badtoken"
      );
    });
  });
});

// ── formatTable ───────────────────────────────────────────────────────────────

describe("formatTable", () => {
  it("returns (no results) for an empty hits array", () => {
    expect(formatTable([])).toBe("(no results)");
  });

  it("contains a header row with id, label, description", () => {
    const hits: SearchHit[] = [{ id: "Q64", label: "Berlin", description: "city" }];
    const table = formatTable(hits);
    const lines = table.split("\n");
    expect(lines[0]).toContain("id");
    expect(lines[0]).toContain("label");
    expect(lines[0]).toContain("description");
  });

  it("contains a divider row after the header", () => {
    const hits: SearchHit[] = [{ id: "Q64", label: "Berlin", description: "city" }];
    const table = formatTable(hits);
    const lines = table.split("\n");
    expect(lines[1]).toMatch(/^[─ ]+$/);
  });

  it("includes each hit's data", () => {
    const hits: SearchHit[] = [
      { id: "Q64", label: "Berlin", description: "capital of Germany" },
      { id: "Q1726", label: "Munich", description: "city in Bavaria" },
    ];
    const table = formatTable(hits);
    expect(table).toContain("Q64");
    expect(table).toContain("Berlin");
    expect(table).toContain("capital of Germany");
    expect(table).toContain("Q1726");
    expect(table).toContain("Munich");
    expect(table).toContain("city in Bavaria");
  });

  it("columns are wide enough to accommodate the longest value", () => {
    const hits: SearchHit[] = [
      { id: "Q1234567", label: "A very long label indeed", description: "d" },
      { id: "Q1", label: "x", description: "d" },
    ];
    const table = formatTable(hits);
    const lines = table.split("\n");
    // Every data row should be at least as wide as the longest id
    for (const line of lines.slice(2)) {
      expect(line.length).toBeGreaterThanOrEqual("Q1234567".length);
    }
  });

  it("property IDs (P-numbers) are rendered correctly", () => {
    const hits: SearchHit[] = [
      { id: "P31", label: "instance of", description: "that class of which this subject is a particular example" },
    ];
    const table = formatTable(hits);
    expect(table).toContain("P31");
    expect(table).toContain("instance of");
  });
});
