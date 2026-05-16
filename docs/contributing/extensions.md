# Developing Extensions

This repo contains extensions and skills for Pi Coding Agent, [grouped by package](../../packages). Work in those directories.

## Extension authoring rules

- **Thin entry-points** — extension files only register tools/events; no business logic.
- **Business logic in `lib/`** — one module per responsibility.
- **Inject all I/O** — filesystem/network access via injectable adapter interfaces; no real I/O in tests.
- **Export pure helpers** — so tests can call them directly without going through `execute()`.
- **No `ctx.ui` in `lib/`** — UI and pi-API concerns belong in the entry-point only.

Refer to existing extensions for the established pattern.

---

## Testing rules

- **Framework:** vitest. Every `lib/` module needs a test at `extensions/lib/__tests__/<module>.test.ts`.
- **Prefer injected adapters** over module-level `vi.mock(...)`.
- **Exclude tests from the npm tarball** — add `"!extensions/**/__tests__"` to `"files"` in `package.json`.

---

## Adding a new capability

**To an existing package:** add `lib/<name>.ts`, its test, wire it into the entry-point, run tests.

**New package:** scaffold `packages/<name>/extensions/lib/__tests__` and `skills/`, copy and update `package.json`, declare `"pi": { "extensions": [...], "skills": [...] }`.

## Keeping changelog

- Each change must be added to the package's `CHANGELOG.md` under `[Unreleased]`, following the existing pattern.
- **High-level only** — one bullet per capability or fix, written from the user's perspective. Do not list intermediate refactors, internal module splits, or implementation steps taken along the way. Consolidate a series of iterative commits into a single, outcome-focused entry.