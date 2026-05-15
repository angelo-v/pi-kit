---
name: spa-html
description: Creates and edits single-page web applications as a single self-contained HTML file with inline CSS and JS, CDN-only dependencies, modular JS via custom elements, and WebAwesome for standard UI components. Use when the user wants to build, scaffold, update, or debug a single-file HTML web app.
---

# Single-Page App — Single HTML File

Build single-file HTML web apps: inline CSS, inline JS (ES modules + custom elements), CDN dependencies, [WebAwesome](https://webawesome.com) for standard UI components, and [Pollen](https://pollen.style) as the CSS design-token foundation.

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
| **One file** | Everything lives in one `.html` file |
| **Inline CSS** | All styles in a single `<style>` block in `<head>` |
| **Inline JS** | All scripts in a single `<script type="module">` at end of `<body>` |
| **CDN only** | No bundler, no local node_modules — only `https://` URLs |
| **Default CDN** | **esm.sh** for JS; Pollen and WebAwesome load their own CSS via `<link>` |
| **Design tokens** | **Pollen** first, then a semantic theme layer on top (see `docs/theming.md`) |
| **Custom elements** | JS split into `class Foo extends HTMLElement` components (see `docs/custom-elements.md`) |
| **WebAwesome** | Use `wa-*` for buttons, dialogs, inputs, icons, alerts, badges, tabs, etc. (see `docs/webawesome.md`) |

---

## Workflow

### Creating a new app

#### Step 1 — Clarify intent (if not already clear)

One question is enough.

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
- Add new custom element classes for domain-specific behaviour (see `docs/custom-elements.md`)
- All spacing, colour, typography use semantic vars — never hard-coded values (see `docs/checklist.md`)

#### Step 5 — Write the file

Ask for the output path if not specified; default to `index.html` in the current directory.

#### Step 6 — Confirm

Show the file path and a brief summary.

---

### Editing an existing app

1. **Read only what you need** — use the section one-liners below
2. Plan the affected section: markup, style, or JS
3. Use `edit` with minimal `oldText` for targeted changes
4. When changing colours or spacing, update `:root` semantic vars — not individual declarations
5. After editing JS, validate syntax:
   ```bash
   node --input-type=module < <(sed -n '/<script type="module">/,/<\/script>/p' app.html | sed '1d;$d')
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
