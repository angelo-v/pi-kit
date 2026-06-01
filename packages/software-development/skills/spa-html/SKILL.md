---
name: spa-html
description: Creates and edits single-page web applications that start as a single self-contained HTML file and evolve into a multi-file component structure as complexity grows. Uses CDN-only dependencies, Lit for components, WebAwesome for standard UI, and Pollen for design tokens. Use when the user wants to build, scaffold, update, or debug a single-file or multi-file HTML web app.
---

# Single-Page App — Start Simple, Evolve to Components

Apps start as a single `index.html` with inline CSS and JS. As complexity grows, components are extracted to their own files grouped by user-facing feature. CDN-only — no bundler. [Lit](https://lit.dev) for all custom elements, [WebAwesome](https://webawesome.com) for standard UI components, [Pollen](https://pollen.style) for design tokens.

**Reference docs** (read on demand):
- [`docs/theming.md`](docs/theming.md) — Pollen tokens + semantic theme layer
- [`docs/cdn.md`](docs/cdn.md) — CDN URLs and common JS packages
- [`docs/leaflet.md`](docs/leaflet.md) — Leaflet maps (CDN, API, tile sources)
- [`docs/cytoscape.md`](docs/cytoscape.md) — Cytoscape.js graph visualisation (CDN, API, layouts)
- [`docs/webawesome.md`](docs/webawesome.md) — CEM tools, WA docs, key rules, common snippets
- [`docs/custom-elements.md`](docs/custom-elements.md) — JS class pattern and guidelines
- [`docs/checklist.md`](docs/checklist.md) — Dos/Don'ts and accessibility checklist

---

## Core Constraints

| Rule | Detail |
|------|--------|
| **Start single** | Begin with one `index.html`; extract components when either threshold is hit (see Component Extraction Rules) |
| **Inline CSS** | Global styles in a `<style>` block in `<head>`; component styles via Lit `css\`…\`` |
| **Inline JS** | One `<script type="module">` — inline components until extracted, then imports only |
| **CDN only** | No bundler, no local node_modules — only `https://` URLs |
| **Default CDN** | **esm.sh** for JS; Pollen and WebAwesome load their own CSS via `<link>` |
| **Design tokens** | **Pollen** first, then a semantic theme layer on top (see `docs/theming.md`) |
| **Custom elements** | Use **Lit** (`LitElement`, `html`, `css`) for all components (see `docs/custom-elements.md`) |
| **WebAwesome** | Use `wa-*` for buttons, dialogs, inputs, icons, alerts, badges, tabs, etc. (see `docs/webawesome.md`) |

---

## Component Extraction Rules

Extract when *either* condition is met:

| Trigger | Threshold | Action |
|---------|-----------|--------|
| A single component class body exceeds | **100 lines** | Extract that component to its own file |
| More than **3 component classes** exist inline | any size | Extract **all** of them |

Once any extraction happens, `index.html` becomes an orchestration shell: global `<style>`, markup, trivial one-off scripts (a bare `querySelector`, a global event listener), and feature `import` statements — no component class definitions.

### File structure after extraction

```
project/
├── index.html                          ← shell: markup, global CSS, imports
└── components/
    ├── <feature>/                      ← one folder per user-facing feature
    │   ├── <tag-name>.js               ← one file per component
    │   └── index.js                    ← re-exports all components in this feature
    └── shared/                         ← only for code used by 2+ distinct features
        └── <utility>.js
```

**Feature naming** — use the user-facing concept, not a technical term:
- ✅ `counter/`, `invoice-list/`, `user-profile/`
- ❌ `state/`, `utils/`, `helpers/`

**`components/<feature>/index.js`** re-exports every component in the feature:
```js
// components/counter/index.js
export * from './my-counter.js';
export * from './counter-badge.js';
```

**`index.html`** imports one line per feature:
```html
<script type="module">
  import './components/counter/index.js';
  import './components/invoice-list/index.js';
  // trivial one-off wiring is fine here
</script>
```

**`components/shared/`** — only create if a utility is genuinely used by two or more features. Never move feature-specific code here preemptively.

> **Note:** extracted component files use bare `import` paths and require an HTTP server (`npx serve .`, VS Code Live Server, etc.) — `file://` blocks ES module imports.

---

## Workflow

### Creating a new app

#### Step 1 — Clarify intent (if not already clear)

One question is enough. Always start with a single `index.html` regardless of expected complexity — extract later if thresholds are hit.

#### Step 2 — Ask the user to choose a layout template

Use the `questionnaire` tool:

```
questions:
  - id: template
    label: Template
    prompt: "Which layout template would you like to start from?"
    allowOther: false
    options:
      - value: blank
        label: "Blank"
        description: "Minimal scaffold — just the shell, ready to fill in"
      - value: dashboard
        label: "Dashboard"
        description: "Sidebar navigation + header + main content area with stat cards"
      - value: landing
        label: "Landing page"
        description: "Hero section, features grid, CTA banner, sticky nav, footer"
      - value: crud-list
        label: "CRUD list"
        description: "Toolbar + searchable list panel + detail view, with add/edit/delete"
      - value: settings-form
        label: "Settings / form"
        description: "Sectioned settings page with form fields, toggles, and a save bar"
      - value: kanban
        label: "Kanban board"
        description: "Drag-and-drop column-based card board with add card/column support"
      - value: graph
        label: "Graph"
        description: "Interactive node-link graph explorer with layout picker, detail panel, add/delete, and PNG export"
      - value: map
        label: "Map"
        description: "Interactive Leaflet map with tile-layer switcher, marker list panel, add/remove markers, and fit-all"
```

#### Step 3 — Read the chosen template

Paths are relative to this SKILL.md's directory.

| Template | File |
|----------|------|
| `blank` | `templates/blank.html` |
| `dashboard` | `templates/dashboard.html` |
| `landing` | `templates/landing.html` |
| `crud-list` | `templates/crud-list.html` |
| `settings-form` | `templates/settings-form.html` |
| `kanban` | `templates/kanban.html` |
| `graph` | `templates/graph.html` |
| `map` | `templates/map.html` |

#### Step 4 — Adapt the template

- Replace placeholder copy, labels, column names, icons with the actual domain
- Adjust `--color-brand` in `:root` to match stated colour preferences (see `docs/theming.md`)
- Add/remove `wa-*` components as needed; check APIs via CEM tools (see `docs/webawesome.md`)
- Write all custom elements as **`LitElement`** subclasses (see `docs/custom-elements.md`)
- All spacing, colour, typography use semantic vars — never hard-coded values (see `docs/checklist.md`)
- **Check extraction thresholds** — if any class exceeds 100 lines, or there are more than 3 classes, extract before writing (see Component Extraction Rules)

#### Step 5 — Write the file(s)

Ask for the output path if not specified; default to `index.html` in the current directory. If extraction was triggered, write component files first, then `index.html`.

#### Step 6 — Confirm

Show all written file paths and a brief summary.

---

### Editing an existing app

1. **Read only what you need** — use the section one-liners below
2. Check whether components are inline or already extracted (`ls components/` or scan the `<script>` block)
3. Plan the affected section: markup, style, or JS
4. Use `edit` with minimal `oldText` for targeted changes
5. When changing colours or spacing, update `:root` semantic vars — not individual declarations
6. **Re-check extraction thresholds** after edits — if a class just crossed 100 lines or a 4th class was added, extract now
7. After editing JS, validate syntax:
   ```bash
   # Inline components
   node --input-type=module < <(sed -n '/<script type="module">/,/<\/script>/p' app.html | sed '1d;$d')
   # Extracted components
   node --input-type=module < components/<feature>/<name>.js
   ```

---

## Reading Sections of the File

Replace `app.html` with the actual path.

```bash
# CSS only
sed -n '/<style>/,/<\/style>/p' app.html

# Semantic theme vars only
sed -n '/:root {/,/^}/p' app.html

# JS only
sed -n '/<script type="module">/,/<\/script>/p' app.html

# Markup only (body, excluding script)
sed -n '/<body>/,/<\/body>/p' app.html | grep -v '<script' | grep -v '</script>'

# Head only
sed -n '/<head>/,/<\/head>/p' app.html

# Section line counts (orientation)
echo "=== CSS ===" && sed -n '/<style>/,/<\/style>/p' app.html | wc -l
echo "=== JS  ===" && sed -n '/<script type="module">/,/<\/script>/p' app.html | wc -l
echo "=== Total ==" && wc -l < app.html
```

**Always prefer section reads over full-file reads** for large apps.
