# Web Awesome Reference

## CEM tools

WebAwesome publishes a [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/) — use `cem_*` tools to inspect APIs instead of guessing.

**Manifest URL:** `https://cdn.jsdelivr.net/npm/@awesome.me/webawesome@3.7.0/dist/custom-elements.json`

| Tool | When to use |
|------|-------------|
| `cem_list_elements` | Compact list of every `wa-*` tag and one-line summary |
| `cem_search_elements` | Search by keyword (e.g. `"dialog"`, `"input"`, `"badge"`) |
| `cem_get_element` | Full API details (attributes, slots, events, CSS parts) — **call before writing markup** |

Workflow: search → inspect → write.

---

## Docs reference

**Component docs** — one file per component:
```
https://raw.githubusercontent.com/shoelace-style/webawesome/refs/heads/next/packages/webawesome/docs/docs/components/<name>.md
```

**Full index** (llms.txt):
```
https://cdn.jsdelivr.net/npm/@awesome.me/webawesome@3.7.0/dist/llms.txt
```

**Topic docs** (installation, theming, form controls, etc.):
```
https://raw.githubusercontent.com/shoelace-style/webawesome/refs/heads/next/packages/webawesome/docs/docs/<topic>.md
```
Key topics: `usage.md`, `customizing.md`, `form-controls.md`, `frameworks.md`

**Utility classes** (`wa-stack`, `wa-cluster`, `wa-grid`, etc.):
```
https://raw.githubusercontent.com/shoelace-style/webawesome/refs/heads/next/packages/webawesome/docs/docs/utilities/<name>.md
```

Fetch with bash: `curl -sL <url>`

---

## Key rules

- Custom elements **cannot self-close**: `<wa-input></wa-input>` ✅ — `<wa-input />` ❌
- Standard form events fire without prefix: listen with `addEventListener('change', ...)` ✅ — `addEventListener('wa-change', ...)` ❌
- Component-specific events are prefixed `wa-`: `wa-clear`, `wa-show`, `wa-after-show`, `wa-hide`, `wa-after-hide`, `wa-invalid`, etc.
- Icons use Font Awesome names: `<wa-icon name="heart"></wa-icon>`
- Slot content: `slot="name"` — e.g. `<wa-icon slot="start"></wa-icon>`
- Buttons: use `appearance` + `variant` together — `appearance="filled"` + `variant="brand"`

---

## Common snippets

```html
<wa-button appearance="filled" variant="brand">Save</wa-button>
<wa-icon name="heart"></wa-icon>
<wa-input label="Name" placeholder="Enter name"></wa-input>
<wa-select label="Role">
  <wa-option value="admin">Admin</wa-option>
</wa-select>
<wa-textarea label="Notes" rows="4"></wa-textarea>
<wa-switch checked>Enable notifications</wa-switch>
<wa-callout variant="success">Saved successfully.</wa-callout>
<wa-badge variant="brand">New</wa-badge>
<wa-dialog id="dlg" label="Confirm">
  Are you sure?
  <wa-button slot="footer" appearance="filled" variant="brand">Yes</wa-button>
</wa-dialog>
<wa-tab-group>
  <wa-tab slot="nav" panel="a">Tab A</wa-tab>
  <wa-tab-panel name="a">Content</wa-tab-panel>
</wa-tab-group>
<wa-card><span slot="header">Title</span>Body</wa-card>
<wa-avatar label="Jane Smith" initials="JS"></wa-avatar>
```
