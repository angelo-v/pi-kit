/**
 * discover-agents.ts
 *
 * Pure helper for loading agent configs from the user (~/.pi/agent/agents)
 * and project-local (.pi/agents) directories.
 *
 * All I/O is injected via `FsAdapter` so the module is fully unit-testable.
 */

export interface AgentInfo {
  name: string;
  description: string;
  source: "user" | "project";
}

export interface FsAdapter {
  /** Returns true when the path is an accessible directory. */
  isDir(path: string): boolean;
  /** Returns file names (not paths) inside `dir`, or [] if unreadable. */
  readDir(dir: string): string[];
  /** Returns the UTF-8 content of `filePath`, or null if unreadable. */
  readFile(filePath: string): string | null;
  /** Joins path segments. */
  join(...parts: string[]): string;
  /** Returns every ancestor directory up to (and including) the filesystem root. */
  ancestors(dir: string): string[];
}

/**
 * Parse the YAML-like frontmatter block at the top of an agent `.md` file.
 * Handles both `---` delimiters and bare `key: value` pairs at the start.
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");
  let inBlock = false;
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!started && trimmed === "---") {
      inBlock = true;
      started = true;
      continue;
    }

    if (inBlock && trimmed === "---") {
      break;
    }

    if (inBlock) {
      const match = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
      if (match) result[match[1]] = match[2].trim();
    }
  }

  return result;
}

/**
 * Load agents from a single directory.
 */
export function loadAgentsFromDir(
  dir: string,
  source: "user" | "project",
  fs: FsAdapter,
): AgentInfo[] {
  if (!fs.isDir(dir)) return [];

  const agents: AgentInfo[] = [];
  for (const name of fs.readDir(dir)) {
    if (!name.endsWith(".md")) continue;

    const content = fs.readFile(fs.join(dir, name));
    if (!content) continue;

    const fm = parseFrontmatter(content);
    if (!fm.name || !fm.description) continue;

    agents.push({ name: fm.name, description: fm.description, source });
  }
  return agents;
}

/**
 * Walk from `cwd` upward looking for `.pi/agents`.
 */
export function findProjectAgentsDir(cwd: string, fs: FsAdapter): string | null {
  for (const ancestor of fs.ancestors(cwd)) {
    const candidate = fs.join(ancestor, ".pi", "agents");
    if (fs.isDir(candidate)) return candidate;
  }
  return null;
}

export interface DiscoverAgentsOptions {
  userAgentsDir: string;
  cwd: string;
  scope: "user" | "project" | "both";
  fs: FsAdapter;
}

export interface DiscoveryResult {
  agents: AgentInfo[];
  projectAgentsDir: string | null;
}

/**
 * Discover all available agents according to `scope`.
 * Project agents shadow user agents with the same name.
 */
export function discoverAgents(opts: DiscoverAgentsOptions): DiscoveryResult {
  const { userAgentsDir, cwd, scope, fs } = opts;
  const projectAgentsDir = scope !== "user" ? findProjectAgentsDir(cwd, fs) : null;

  const userAgents = scope !== "project" ? loadAgentsFromDir(userAgentsDir, "user", fs) : [];
  const projectAgents =
    scope !== "user" && projectAgentsDir
      ? loadAgentsFromDir(projectAgentsDir, "project", fs)
      : [];

  // Project agents shadow user agents with the same name.
  const map = new Map<string, AgentInfo>();
  for (const a of userAgents) map.set(a.name, a);
  for (const a of projectAgents) map.set(a.name, a);

  return { agents: Array.from(map.values()), projectAgentsDir };
}

/**
 * Format the agent catalogue as a system-prompt section.
 */
export function formatAgentCatalogue(agents: AgentInfo[]): string {
  if (agents.length === 0) return "";

  const lines = [
    "## Available subagents",
    "",
    "Use the `subagent` tool to delegate tasks. Available agents:",
    "",
  ];

  for (const a of agents) {
    lines.push(`- **${a.name}** (${a.source}): ${a.description}`);
  }

  lines.push("");
  lines.push(
    'Always use one of the names above. For project-local agents set `agentScope: "both"` or `"project"`.',
  );

  return lines.join("\n");
}
