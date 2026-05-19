/**
 * subagent-context.ts
 *
 * Injects a live subagent catalogue into the system prompt before each agent
 * turn, so the model always knows which agents are available and how to call
 * them — mirroring how built-in tools and skills are surfaced at session start.
 *
 * The catalogue is built by reading ~/.pi/agent/agents (user scope) and the
 * nearest .pi/agents directory (project scope) using the same discovery logic
 * as the subagent tool itself.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  discoverAgents,
  formatAgentCatalogue,
  type FsAdapter,
} from "./lib/discover-agents.js";

// ---------------------------------------------------------------------------
// Real fs adapter (production)
// ---------------------------------------------------------------------------

const realFs: FsAdapter = {
  isDir(p) {
    try {
      return nodeFs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  readDir(p) {
    try {
      return nodeFs
        .readdirSync(p, { withFileTypes: true })
        .filter((e) => e.isFile() || e.isSymbolicLink())
        .map((e) => e.name);
    } catch {
      return [];
    }
  },
  readFile(p) {
    try {
      return nodeFs.readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  },
  join: (...parts) => nodePath.join(...parts),
  ancestors(dir) {
    const segs = nodePath.resolve(dir).split(nodePath.sep).filter(Boolean);
    const paths: string[] = [];
    for (let i = segs.length; i > 0; i--) {
      paths.push(nodePath.sep + segs.slice(0, i).join(nodePath.sep));
    }
    return paths;
  },
};

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (_event, ctx) => {
    const userAgentsDir = nodePath.join(getAgentDir(), "agents");

    // Discover user + project agents (union, project wins on name collision).
    const { agents } = discoverAgents({
      userAgentsDir,
      cwd: ctx.cwd,
      scope: "both",
      fs: realFs,
    });

    const catalogue = formatAgentCatalogue(agents);
    if (!catalogue) return;

    return {
      systemPrompt: _event.systemPrompt + "\n\n" + catalogue,
    };
  });
}
