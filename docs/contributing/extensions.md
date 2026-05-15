# Developing Extensions

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

- each change must be added to the packages CHANGELOG.md following the existing pattern. Only include high-level user-facing changes, no implementation details.