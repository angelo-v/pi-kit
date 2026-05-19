import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  loadAgentsFromDir,
  findProjectAgentsDir,
  discoverAgents,
  formatAgentCatalogue,
  type FsAdapter,
} from "../discover-agents.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFs(tree: Record<string, string>): FsAdapter {
  const dirs = new Set<string>();
  for (const p of Object.keys(tree)) {
    // Register every ancestor as a directory
    const parts = p.split("/");
    for (let i = 1; i <= parts.length - 1; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }

  return {
    isDir: (p) => dirs.has(p),
    readDir: (p) => {
      const prefix = p + "/";
      return Object.keys(tree)
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
        .map((k) => k.slice(prefix.length));
    },
    readFile: (p) => tree[p] ?? null,
    join: (...parts) => parts.join("/"),
    ancestors: (dir) => {
      const segs = dir.split("/");
      return segs.map((_, i) => segs.slice(0, i + 1).join("/")).reverse();
    },
  };
}

const WORKER_MD = `---
name: worker
description: General-purpose worker agent
---
You are a worker.
`;

const SCOUT_MD = `---
name: scout
description: Codebase research agent
---
You are a scout.
`;

const BAD_MD = `---
name: bad
---
Missing description.
`;

const NO_FM_MD = `Just plain text, no frontmatter.`;

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses standard --- block", () => {
    const fm = parseFrontmatter(WORKER_MD);
    expect(fm.name).toBe("worker");
    expect(fm.description).toBe("General-purpose worker agent");
  });

  it("returns empty object for no frontmatter", () => {
    expect(parseFrontmatter(NO_FM_MD)).toEqual({});
  });

  it("ignores entries with missing description", () => {
    const fm = parseFrontmatter(BAD_MD);
    expect(fm.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// loadAgentsFromDir
// ---------------------------------------------------------------------------

describe("loadAgentsFromDir", () => {
  it("loads valid agent files", () => {
    const fs = makeFs({
      "agents/worker.md": WORKER_MD,
      "agents/scout.md": SCOUT_MD,
    });
    const agents = loadAgentsFromDir("agents", "user", fs);
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.name).sort()).toEqual(["scout", "worker"]);
  });

  it("skips files without name or description", () => {
    const fs = makeFs({
      "agents/bad.md": BAD_MD,
      "agents/nofm.md": NO_FM_MD,
    });
    expect(loadAgentsFromDir("agents", "user", fs)).toHaveLength(0);
  });

  it("ignores non-.md files", () => {
    const fs = makeFs({ "agents/readme.txt": "ignored" });
    expect(loadAgentsFromDir("agents", "user", fs)).toHaveLength(0);
  });

  it("returns [] for missing directory", () => {
    const fs = makeFs({});
    expect(loadAgentsFromDir("nonexistent", "user", fs)).toHaveLength(0);
  });

  it("tags agents with their source", () => {
    const fs = makeFs({ "agents/worker.md": WORKER_MD });
    const [a] = loadAgentsFromDir("agents", "project", fs);
    expect(a.source).toBe("project");
  });
});

// ---------------------------------------------------------------------------
// findProjectAgentsDir
// ---------------------------------------------------------------------------

describe("findProjectAgentsDir", () => {
  it("finds .pi/agents in cwd", () => {
    const fs = makeFs({ "repo/.pi/agents/worker.md": WORKER_MD });
    expect(findProjectAgentsDir("repo/src/feature", fs)).toBe("repo/.pi/agents");
  });

  it("walks up to find .pi/agents", () => {
    const fs = makeFs({ "repo/.pi/agents/worker.md": WORKER_MD });
    expect(findProjectAgentsDir("repo/src", fs)).toBe("repo/.pi/agents");
  });

  it("returns null when not found", () => {
    const fs = makeFs({});
    expect(findProjectAgentsDir("repo/src", fs)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// discoverAgents
// ---------------------------------------------------------------------------

describe("discoverAgents", () => {
  const userAgentsDir = "home/.pi/agent/agents";
  const cwd = "repo/src";

  const fs = makeFs({
    "home/.pi/agent/agents/worker.md": WORKER_MD,
    "home/.pi/agent/agents/scout.md": SCOUT_MD,
    "repo/.pi/agents/scout.md": `---\nname: scout\ndescription: Project scout\n---\n`,
  });

  it('scope "user" only returns user agents', () => {
    const { agents } = discoverAgents({ userAgentsDir, cwd, scope: "user", fs });
    expect(agents.every((a) => a.source === "user")).toBe(true);
    expect(agents).toHaveLength(2);
  });

  it('scope "project" only returns project agents', () => {
    const { agents } = discoverAgents({ userAgentsDir, cwd, scope: "project", fs });
    expect(agents).toHaveLength(1);
    expect(agents[0].source).toBe("project");
  });

  it('scope "both" merges, project shadows user', () => {
    const { agents } = discoverAgents({ userAgentsDir, cwd, scope: "both", fs });
    expect(agents).toHaveLength(2);
    const scout = agents.find((a) => a.name === "scout")!;
    expect(scout.source).toBe("project");
    expect(scout.description).toBe("Project scout");
  });

  it("exposes projectAgentsDir", () => {
    const { projectAgentsDir } = discoverAgents({ userAgentsDir, cwd, scope: "both", fs });
    expect(projectAgentsDir).toBe("repo/.pi/agents");
  });
});

// ---------------------------------------------------------------------------
// formatAgentCatalogue
// ---------------------------------------------------------------------------

describe("formatAgentCatalogue", () => {
  it("returns empty string for no agents", () => {
    expect(formatAgentCatalogue([])).toBe("");
  });

  it("includes agent names and descriptions", () => {
    const text = formatAgentCatalogue([
      { name: "worker", description: "Does work", source: "user" },
      { name: "scout", description: "Does research", source: "project" },
    ]);
    expect(text).toContain("**worker**");
    expect(text).toContain("Does work");
    expect(text).toContain("**scout**");
    expect(text).toContain("project");
  });

  it("includes subagent tool guidance", () => {
    const text = formatAgentCatalogue([{ name: "x", description: "y", source: "user" }]);
    expect(text).toContain("`subagent`");
  });
});
