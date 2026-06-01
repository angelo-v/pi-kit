# Custom Elements — Lit Pattern

All components use **Lit** (`LitElement`). Import from esm.sh:

```js
import { LitElement, html, css } from 'https://esm.sh/lit@3';
```

## Class template

```js
class MyWidget extends LitElement {
  // 1. Scoped styles — no global CSS leakage
  static styles = css`
    :host { display: block; }
  `;

  // 2. Reactive properties — Lit re-renders on change
  static properties = {
    value:    { type: String },
    disabled: { type: Boolean },
  };

  // 3. Defaults in constructor
  constructor() {
    super();
    this.value    = '';
    this.disabled = false;
  }

  // 4. Declarative template — Lit's html`` tag
  render() {
    return html`
      <div class="widget">
        <slot></slot>
      </div>
    `;
  }

  // 5. Private methods for event handling
  #handleClick(e) { /* ... */ }

  // 6. Lifecycle hooks (use sparingly)
  connectedCallback()    { super.connectedCallback(); }
  disconnectedCallback() { super.disconnectedCallback(); }
}

customElements.define('my-widget', MyWidget);
```

## Guidelines

| Rule | Detail |
|------|--------|
| **Always extend `LitElement`** | Never use bare `HTMLElement` |
| **`static properties`** | Declare every reactive prop here; Lit schedules renders automatically |
| **`static styles = css\`…\``** | Scoped to shadow DOM \u2014 component styles live here, not in the global `<style>` |
| **`html\`…\``** | Use for all templates; prefer Lit event bindings (`@click`) over `addEventListener` |
| **Private fields** | Use `#field` for internal state not exposed as a property |
| **Cross-component events** | `this.dispatchEvent(new CustomEvent('my-event', { bubbles: true, composed: true, detail: {…} }))` — `composed: true` lets events cross shadow boundaries |
| **Avoid direct DOM queries** | Use `this.renderRoot.querySelector` if you must; prefer reactive properties |

## Inline vs extracted

- **Inline** (inside `index.html` `<script type="module">`): fine while under the extraction thresholds
- **Extracted** (`components/<feature>/<tag-name>.js`): self-contained — includes its own `import { LitElement, html, css }` and `customElements.define` call

## Feature index file

Each feature folder exports all its components through an `index.js`:

```js
// components/counter/index.js
export * from './my-counter.js';
export * from './counter-badge.js';
```
