# Porting pi-kit to Claude Code — Conceptual Analysis

## Background

pi-kit consists of two layers:

1. **Core logic (`extensions/lib/`)** — pure TypeScript, fully decoupled from pi, testable without any pi API. Contains: Oxigraph store management, SPARQL execution via Comunica, SHACL validation, RDF serialisation, ADR writer, CEM parser, Wikidata search, …

2. **Integration layer (`extensions/*.ts`)** — thin entry-points that call `pi.registerTool()`, declare parameter schemas via `typebox`, and use `ctx.cwd` / `ctx.ui`.

The question: can an analogous integration layer be written for **Claude Code** that wires in the same core logic?

---

## Claude Code's Extension Model

Claude Code offers two official extension points:

### 1. MCP (Model Context Protocol) — Tools
Claude Code can integrate MCP servers. An MCP server exposes tools that the model can call. The protocol is JSON-based (stdio or HTTP/SSE). Tools have a JSON Schema for parameters and return structured results.

**Analogy to pi:** `pi.registerTool()` ↔ MCP Tool definition

### 2. Claude Code Extensions (`~/.claude/commands/` / `CLAUDE.md`)
Slash-commands (Markdown files) and context instructions via `CLAUDE.md` — no programmatic API comparable to pi's `ExtensionAPI`.

**No analogy** to pi's `pi.on("tool_call", ...)` event system or `ctx.ui.*`.

---

## What Is Feasible

### ✅ Core logic fully portable

All `lib/` modules are pi-agnostic and can be reused 1:1:

| Module | Function | Portable? |
|---|---|---|
| `oxigraph-store.ts` | Persistent RDF store (WASM) | ✅ |
| `rdf-memory-chunks.ts` | Named-graph data model | ✅ |
| `shacl-validate.ts` | SHACL validation | ✅ |
| `rdf-write.ts` | Turtle parsing + serialisation | ✅ |
| `sparql-query-files.ts` / `run-query.ts` | Comunica integration | ✅ |
| `wikidata-search.ts` / `wikidata.ts` | Wikidata API | ✅ |
| `adr-writer.ts` / `detect-adr-dir.ts` | ADR logic | ✅ |
| `cem.ts` | CEM parsing | ✅ |
| `find-binary.ts` | CLI binary lookup | ✅ (minor adjustment) |

### ✅ Tools exposable via MCP

Every pi tool can be implemented as an MCP tool. Parameter schemas from `typebox` can be converted to JSON Schema (which MCP expects). The execution logic stays identical.

### ✅ Skills as `CLAUDE.md` instructions

pi's skill files (`SKILL.md`) are Markdown documents with workflow instructions for the model. The same concept works in `CLAUDE.md` or as slash-command documents — structurally identical, only the embedding mechanism differs.

---

## Challenges and Problems

### 🔴 Problem 1: No native Extension API — MCP server boilerplate

pi has a type-safe, event-driven TypeScript API (`ExtensionAPI`). Claude Code has no comparable SDK. The integration layer would have to be implemented as an **MCP server** (e.g. with `@modelcontextprotocol/sdk`). This means:

- Each package becomes a standalone MCP process (stdio or HTTP)
- Per-call startup latency in stdio mode is avoided with a persistent process, but process management falls to the user
- No hot-reload like pi's `/reload`

**Effort:** Medium. One MCP server wrapper per package. But the clean `lib/` separation means no refactoring of the core logic.

### 🔴 Problem 2: No `ctx.cwd` — no clean working-directory concept

pi passes `ctx.cwd` (the current project directory) to every tool call. In Claude Code, the MCP server's working directory is wherever it was started — not necessarily the current project. For file operations (reading/writing RDF files, finding ADR directories) this is a serious problem.

**Workaround:** Pass the CWD as a configurable parameter to the MCP server (via env var), or expose it as an explicit tool parameter. Both worsen UX.

### 🔴 Problem 3: No `ctx.ui` — no interactive user interface

pi's `ctx.ui.confirm()`, `ctx.ui.select()`, `ctx.ui.notify()`, and `ctx.ui.custom()` have no equivalent in MCP. This affects:

- **`questionnaire` tool** (ADR skill, SHACL shape builder) — interactive dialog
- **`rdf-memory-explorer`** — TUI-based store browser
- All confirmation dialogs

**Consequence:** These interactive tools must either be dropped entirely or reimplemented as pure LLM conversation (the model asks, the user replies in chat). This is less ergonomic and more error-prone.

### 🟡 Problem 4: No event system — no lifecycle hooks

pi's `pi.on("session_start", ...)`, `pi.on("session_shutdown", ...)`, etc. enable e.g. cleanly closing Oxigraph stores on shutdown. In MCP there are only tool calls.

**Workaround:** Design the `oxigraph-store` manager to persist atomically on every call (which it already does — `dirty` flag + atomic rename). `session_shutdown` is therefore not missed, but there is no explicit cleanup.

### 🟡 Problem 5: typebox → JSON Schema conversion

pi uses `typebox` for parameter schemas (`Type.Object`, `Type.Array`, …). MCP expects JSON Schema. `typebox` is a superset of JSON Schema, so conversion is technically straightforward, but requires an adapter (`@sinclair/typebox` → plain JSON Schema). `StringEnum` from `@earendil-works/pi-ai` is a pi-specific wrapper that must be replaced.

**Effort:** Low. A one-off utility wrapper.

### 🟡 Problem 6: `find-binary.ts` — binary localisation

`find-binary.ts` locates Comunica binaries relative to the extension file (via `import.meta.url`). In an MCP server context the resolution path differs. This needs adjustment, but is a localised problem.

### 🟡 Problem 7: Skills — no formal mechanism

pi skills are structured Markdown files made known to the agent via `AGENTS.md`. Claude Code has no formal equivalent. Skills would have to be embedded as part of `CLAUDE.md` or as slash-commands — without the fine-grained control (e.g. `promptGuidelines` per tool) that pi offers.

**Consequence:** Skills are conceptually portable, but the integration is less precise. There is no guarantee that Claude Code will reliably follow skill instructions, since no formal binding mechanism exists.

### 🔴 Problem 8: Package distribution and installation

pi packages are installed via `pi install npm:@foo/bar` — pi handles download, build, and integration automatically. Claude Code has no equivalent package management for MCP servers. Users would need to:
1. Manually install the MCP server (`npm install -g ...` or locally)
2. Register the server in `~/.claude/claude_desktop_config.json` (or `settings.json`)
3. Start the server process (or configure autostart)

This is a considerably worse DX compared to pi.

### 🟡 Problem 9: Intra-tool dependencies

Some pi tools conceptually reference other tools (e.g. `rdf_memory_record` vs. `rdf_memory_query` in a skill). In pi this is implicit. In MCP tools are isolated — not a technical problem, but skill documents must be updated to clearly reference MCP tool names.

---

## Overall Assessment

| Dimension | Rating |
|---|---|
| **Core logic portable** | ✅ Fully, without changes |
| **Tools exposable via MCP** | ✅ Yes, with boilerplate |
| **Skills portable** | 🟡 Conceptually yes, mechanically degraded |
| **Interactive tools (questionnaire, TUI)** | 🔴 Not portable (must be dropped) |
| **End-user DX** | 🔴 Worse than pi (manual MCP setup) |
| **Maintenance overhead** | 🟡 Double integration layer (pi + MCP) |

**Conclusion:** A port is technically feasible and would be clean at its core, since the `lib/` modules are genuinely agnostic. But Claude Code offers no comparably rich extension model — interactive features must be dropped, DX is worse, and maintenance overhead doubles for two integration layers. The port is only worthwhile if Claude Code user numbers justify the extra work.

---

## Possible Implementation Plan

If the port were to be undertaken, a sensible roadmap would be:

### Phase 1 — Foundation (one-off)
1. Create `packages/mcp-adapter/` — shared MCP server bootstrapper
2. Write a typebox-to-JSON-Schema utility
3. Define the CWD strategy (env var `MCP_CWD` or explicit parameter)
4. Build pipeline: TypeScript → CommonJS (MCP servers often run without ESM)

### Phase 2 — linked-data package
1. Write `packages/linked-data/mcp-server.ts` as entry-point
2. Adapt all `extensions/*.ts` as MCP tool handlers (without `ctx.ui`, without event hooks)
3. Skip `rdf-memory-explorer` and `shacl-create-shape` for now (due to `ctx.ui`)
4. Document skills as `CLAUDE.md` snippets

### Phase 3 — software-development package
1. Rethink the `adr` workflow without `questionnaire` (model asks in chat)
2. Port `cem` tools (purely functional, no `ctx.ui`)

### Phase 4 — Distribution
1. Publish npm packages with MCP server as `bin` entry-point
2. Installation documentation for `claude_desktop_config.json`

---

## Claude Hooks — Additional Analysis

Claude Code's hooks system (`PreToolUse`, `PostToolUse`, `Notification`, `Stop`) fires shell commands at lifecycle points. The question is whether hooks can close any of the gaps above.

| Problem | Hooks help? | Notes |
|---|---|---|
| **P1** No Extension API / MCP boilerplate | ❌ | Hooks are shell scripts, not a tool-registration mechanism. MCP server still required. |
| **P2** No `ctx.cwd` | 🟡 Partial | `PreToolUse` receives the full tool-call JSON and could inject a `cwd` field before it reaches the MCP server — but this is fragile plumbing. |
| **P3** No `ctx.ui` — interactive dialogs | ❌ | A `PreToolUse` hook can block a call (exit code 2) but cannot collect user input and return it. `questionnaire` / `shacl_create_shape` remain impossible. |
| **P4** No lifecycle hooks — session shutdown | ✅ | The `Stop` hook cleanly handles store flush / file-handle cleanup. (Already a minor issue since Oxigraph persists atomically, but hooks make it explicit.) |
| **P7** Skills — no formal mechanism | 🟡 Marginal | A `PreToolUse` hook could prepend skill context, but `CLAUDE.md` is the practical equivalent and hooks add no real value here. |
| **P8** Package distribution / DX | ❌ | Hooks are configured manually in `settings.json`, same story as MCP server registration. |

**Conclusion:** Hooks solve Problem 4 cleanly and offer a fragile partial workaround for Problem 2. The two blockers — no Extension API (P1) and no interactive UI (P3) — are completely unaddressed. The hooks system is designed for automation and guardrails (blocking dangerous calls, logging, post-processing), not for building an extension ecosystem. The overall assessment of the port is unchanged.

---

## Alternative Approach: pi as an MCP Server

Instead of porting pi-kit for Claude Code, one could run pi itself as an MCP server and thereby supply Claude Code with pi-kit tools. pi supports an RPC mode that enables programmatic integration. This would be architecturally cleaner, but means Claude Code has pi as a dependency — which would likely be unattractive for users.
